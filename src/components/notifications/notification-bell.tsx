'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAdmin } from '@/context/AdminAuthContext';
import { useRealtime, type RealtimePayload } from '@/hooks/use-realtime';
import { adminNotificationsApi } from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';
import {
  playNotificationSound,
  primeNotificationSound,
  setSoundEnabled,
  soundEnabled,
  soundEnabledOnServer,
  subscribeToSoundPreference,
} from '@/lib/notification-sound';
import { canAccess } from '@/lib/permissions';
import { keys } from '@/lib/query-keys';
import { clientName } from '@/components/clients/client-identity';
import { NotificationCenter } from './notification-center';
import { refreshNotifications } from './refresh';
import { toastBurst, toastNotification } from './notification-toast';
import { BROADCAST_RESOURCES, queryKeysFor, resourceKeysFor } from './realtime-keys';

const ROOT = keys.notifications.all();

/** Arrivals this close together are ONE announcement — one chime, one toast. */
const BURST_MS = 400;
/** The chime never repeats sooner than this, however fast tasks land. */
const CHIME_GAP_MS = 3_000;
/** A burst toast still on screen absorbs the next burst rather than stacking. */
const BURST_TOAST_MS = 6_000;

const kindOf = (payload: RealtimePayload): string =>
  payload && typeof payload['kind'] === 'string' ? payload['kind'] : '';

/**
 * The bell in the console header — how an admin learns there is something to
 * HANDLE, and nothing else.
 *
 * ## The badge counts the inbox
 *
 * Tasks waiting on this reader: every one not yet handled by anybody, opened
 * or not — opening a task never lowers it, handling does (5 Oct 2026). It
 * polls on the sidebar badges' cadence (sixty seconds, backing off to five
 * minutes while the socket is proven up) and is NOT drawn at zero or unknown —
 * a badge that cannot be counted is not drawn.
 *
 * ## Three live events
 *
 *   notification.created   a task landed — the badge, the chime, the toast, and
 *                          the table it is about refresh;
 *   notification.changed   one of this reader's tasks was seen (another tab) or
 *                          HANDLED (by anyone) — the bell re-reads; this is what
 *                          makes an approved withdrawal leave every inbox;
 *   resource.changed       another operator decided something — the data only.
 *
 * None carries anything to trust: the bell re-reads through the scoped,
 * permission-checked endpoint, and the toast names the client by Portal ID.
 *
 * ## Many arrivals are ONE announcement
 *
 * Tasks can land in a burst — the transfer scheduler announces every transfer
 * that stuck while the MT5 bridge was down, in one pass. Arrivals within
 * `BURST_MS` are gathered: one refetch, one chime (never closer together than
 * `CHIME_GAP_MS`), and one toast — the task itself when it is alone, "5 new
 * tasks need your action" when it is not. With the panel OPEN there is no toast
 * at all: the reader is watching the list move.
 *
 * ## Read is explicit; handled is automatic
 *
 * Opening the panel marks nothing — auto-mark-on-open would destroy the signal
 * before anything was read. A task leaves the inbox when this reader opens or
 * clears it, or when anybody handles it.
 */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { admin } = useAdmin();
  const [open, setOpen] = React.useState(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Fresh on open, so the badge and the list the reader is about to see agree.
    if (next) void queryClient.invalidateQueries({ queryKey: ROOT });
  };

  /*
   * Build the AudioContext on the operator's first click or keypress, rather
   * than on the first notification that wants it — otherwise the first chime of
   * a session is inaudible even with sound on. See `lib/notification-sound.ts`.
   */
  React.useEffect(() => primeNotificationSound(), []);
  const soundOn = React.useSyncExternalStore(
    subscribeToSoundPreference,
    soundEnabled,
    soundEnabledOnServer,
  );

  // The arrivals of the current burst, and the moment each announcement last went out.
  const arrivals = React.useRef<RealtimePayload[]>([]);
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastChime = React.useRef(0);
  const lastBurst = React.useRef({ count: 0, at: 0 });
  const panelOpen = React.useRef(open);
  React.useEffect(() => {
    panelOpen.current = open;
  }, [open]);
  React.useEffect(() => () => clearTimeout(flushTimer.current), []);

  const announce = () => {
    flushTimer.current = undefined;
    const arrived = arrivals.current;
    arrivals.current = [];
    if (arrived.length === 0) return;

    void queryClient.invalidateQueries({ queryKey: ROOT });
    for (const kind of new Set(arrived.map(kindOf))) {
      for (const key of queryKeysFor(kind)) void queryClient.invalidateQueries({ queryKey: key });
    }

    const now = Date.now();
    if (now - lastChime.current >= CHIME_GAP_MS) {
      lastChime.current = now;
      playNotificationSound();
    }
    // The open panel already shows them arriving; a toast would say it twice.
    // Nor into a hidden tab: it would expire unseen, and the badge already
    // carries the arrival to whenever the reader comes back.
    if (panelOpen.current || document.hidden) return;

    const burstShowing = now - lastBurst.current.at <= BURST_TOAST_MS;
    const [only] = arrived;
    if (arrived.length === 1 && !burstShowing && only !== undefined) {
      const id = typeof only['id'] === 'string' ? only['id'] : undefined;
      const show = (name?: string) =>
        toastNotification(
          only,
          (href) => {
            // Following the toast IS opening the task — it is marked seen, as a
            // click on its row is, and stays in the inbox until handled.
            if (id) {
              void adminNotificationsApi.markRead(id).then(
                () => refreshNotifications(queryClient),
                () => undefined,
              );
            }
            router.push(href);
          },
          (path) => canAccess(admin, path),
          name,
        );
      /*
       * The client BY NAME. The socket carries a Portal ID and never a name —
       * names are masked per reader, and only the scoped HTTP read applies that
       * mask — so the toast asks for its own row first, the same read the inbox
       * makes, and prints whatever this reader may see: "John Doe · #1000245",
       * or the Portal ID alone for a role that hides names. A failed read still
       * announces the task, by Portal ID, rather than dropping it.
       */
      if (!id) {
        show();
        return;
      }
      void adminNotificationsApi.list({ view: 'inbox', limit: 20 }).then(
        (page) => {
          const row = page.items.find((item) => item.id === id);
          show(row ? clientName(row.client.firstName, row.client.lastName) : undefined);
        },
        () => show(),
      );
      return;
    }
    const count = arrived.length + (burstShowing ? lastBurst.current.count : 0);
    lastBurst.current = { count, at: now };
    // Through the same path as a click on the bell, so the panel opens fresh.
    toastBurst(count, () => onOpenChange(true));
  };

  const { connected } = useRealtime({
    'notification.created': (payload) => {
      arrivals.current.push(payload);
      flushTimer.current ??= setTimeout(announce, BURST_MS);
    },
    'notification.changed': () => refreshNotifications(queryClient),
    'resource.changed': (payload) => {
      const resource =
        payload && typeof payload === 'object' && typeof payload.resource === 'string'
          ? payload.resource
          : '';
      for (const key of resourceKeysFor(resource))
        void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  /*
   * ⚠️ RE-SYNC WHENEVER THE SOCKET COMES BACK. A Socket.IO event reaches only a
   * socket connected at that moment — no replay — so everything that happened
   * while this tab slept or was offline simply never arrives. Reconnecting IS
   * the moment to ask what was missed: the bell, and every shared queue, since a
   * missed `resource.changed` leaves no trace anywhere else.
   */
  React.useEffect(() => {
    if (!connected) return;
    void queryClient.invalidateQueries({ queryKey: ROOT });
    for (const resource of BROADCAST_RESOURCES) {
      for (const key of resourceKeysFor(resource))
        void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [connected, queryClient]);

  const summary = useQuery({
    queryKey: keys.notifications.summary(),
    queryFn: ({ signal }) => adminNotificationsApi.summary(signal),
    refetchInterval: connected ? 300_000 : 60_000,
    retry: false,
  });
  const count = summary.data?.count;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        aria-label={
          count
            ? `${t('notifications.open')} — ${t('notifications.needActionLabel', { count })}`
            : t('notifications.open')
        }
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted focus-outline"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {count ? (
          <span
            aria-hidden="true"
            className="absolute -end-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-background"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t('notifications.title')}</SheetTitle>
            {/*
              A control, not an indicator: it says what the operator ASKED for.
              Audio can be refused by the browser until they interact, and
              claiming "on" while autoplay holds it silent would be a status
              light that lies.
            */}
            <button
              type="button"
              aria-pressed={soundOn}
              aria-label={soundOn ? t('notifications.soundOn') : t('notifications.soundOff')}
              title={soundOn ? t('notifications.soundOn') : t('notifications.soundOff')}
              onClick={() => {
                const next = !soundOn;
                setSoundEnabled(next);
                // On the way ON only — confirms the choice and satisfies autoplay.
                if (next) playNotificationSound();
              }}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
            >
              {soundOn ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <SheetDescription>{t('notifications.panelDescription')}</SheetDescription>
        </SheetHeader>
        {/* Mounted only while open — opening fetches fresh. */}
        <NotificationCenter summary={summary.data} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
