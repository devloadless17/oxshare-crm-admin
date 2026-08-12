'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import type { AdminNotification } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';
import { t } from '@/lib/i18n';
import { toastError } from '@/lib/toast';
import { relativeTime } from '@/lib/relative-time';
import { useRealtime } from '@/hooks/use-realtime';
import {
  playNotificationSound,
  setSoundEnabled,
  soundEnabled,
  soundEnabledOnServer,
  subscribeToSoundPreference,
} from '@/lib/notification-sound';
import { resolveKind } from './notification-kinds';

/**
 * The notification bell, and the panel behind it — live since the
 * `GET /admin/notifications` feed landed. (This file's previous version showed
 * labelled sample rows and said so; the migration its doc comment promised —
 * SAMPLES → `useResource`, `previewNotice` → a real empty state — is this.)
 *
 * TWIN in intent with the portal's `layout/notifications-sheet.tsx` — same
 * component shape — but NOT a twin file: the kind catalogues are disjoint
 * (work-queue events here, account events there).
 *
 * ## The badge polls; the list fetches on open
 *
 * The unread count lives up here, beside the trigger, on the same 60-second /
 * `retry: false` cadence as the sidebar's queue badges — and like them it is
 * NOT drawn when the count is zero or unknown: a badge that cannot be counted
 * is a badge that is not drawn. The list itself lives inside `SheetContent`,
 * which Radix unmounts when closed, so opening the panel naturally fetches a
 * fresh page — no imperative refetch choreography.
 *
 * ## Read is EXPLICIT, never a side effect of opening
 *
 * Opening the panel does not mark anything read. Auto-mark-on-open destroys
 * the only unread signal before anything was actually read — the "status
 * light that lies" this product has removed twice. Clicking a row marks that
 * row; "Mark all as read" is a button.
 */

const COUNT_KEY = ['admin', 'notifications', 'unread-count'] as const;
const LIST_KEY = ['admin', 'notifications'] as const;
const PAGE_SIZE = 30;

export function NotificationsSheet() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  /*
   * The sound preference lives in localStorage, which React does not own and
   * the server cannot read — so it is subscribed to rather than copied into
   * state. The explicit server snapshot is what keeps the first client render
   * identical to the server's instead of flipping after hydration.
   */
  const soundOn = React.useSyncExternalStore(
    subscribeToSoundPreference,
    soundEnabled,
    soundEnabledOnServer,
  );

  /*
   * The live socket. When it is proven up the poll backs off to five minutes;
   * when it is not, the original sixty-second cadence carries the feature.
   *
   * That fallback is the whole reason the poll survives: a WebSocket upgrade
   * is blocked by some corporate proxies, and while Socket.IO degrades to
   * long-polling on its own, a bell that silently stops updating is worse than
   * a slow one — nobody can tell it apart from "nothing has happened".
   */
  const { connected } = useRealtime({
    /*
     * The event the backend emits into this admin's room. Passed inline
     * deliberately: `useRealtime` keys its effect on the event NAMES and holds
     * the handlers in a ref, so this object being new on every render does not
     * rebuild the socket.
     */
    'notification.created': () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      playNotificationSound();
    },
  });

  const count = useQuery({
    queryKey: COUNT_KEY,
    queryFn: ({ signal }) => api.admin.getNotificationsUnreadCount(signal),
    refetchInterval: connected ? 300_000 : 60_000,
    retry: false,
  });
  const unread = count.data?.count;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A fresh count on open, so the badge and the list the reader is
        // about to see agree with each other.
        if (next) void queryClient.invalidateQueries({ queryKey: COUNT_KEY });
      }}
    >
      {/*
        Icon-only, so it needs a name: without one a screen reader announces
        "button" and the only route to this panel is unreachable to anyone not
        looking at it. Sized to match the controls beside it.
      */}
      <SheetTrigger
        aria-label={
          unread
            ? `${t('notifications.open')} — ${t('notifications.unreadCountLabel', { count: unread })}`
            : t('notifications.open')
        }
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted focus-outline"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t('notifications.title')}</SheetTitle>
            {/*
              A control, not an indicator. Audio can be refused by the browser
              until the reader interacts with the page, so this says what they
              have ASKED for rather than what the speaker is currently doing —
              claiming "on" while autoplay policy holds it silent would be a
              status light that lies.
            */}
            <button
              type="button"
              aria-pressed={soundOn}
              aria-label={soundOn ? t('notifications.soundOn') : t('notifications.soundOff')}
              title={soundOn ? t('notifications.soundOn') : t('notifications.soundOff')}
              onClick={() => {
                const next = !soundOn;
                setSoundEnabled(next);
                // Play on the way ON, never on the way off. It confirms the
                // choice and — because this is a click — satisfies the
                // autoplay policy, so the next real notification is audible.
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
          <SheetDescription className="sr-only">
            {t('notifications.panelDescription')}
          </SheetDescription>
        </SheetHeader>
        {/* Mounted only while open — see the component note. */}
        <NotificationsList unreadCount={unread ?? 0} />
      </SheetContent>
    </Sheet>
  );
}

function NotificationsList({ unreadCount }: { unreadCount: number }) {
  const queryClient = useQueryClient();

  const query = useResource([...LIST_KEY, 'list'], (signal) =>
    api.admin.getNotifications({ limit: PAGE_SIZE }, signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: LIST_KEY });

  /*
   * Per-row mark-read, fired alongside navigation and NEVER toasted on
   * failure: an error toast interrupting a navigation the operator asked for
   * reports the failure of something they didn't ask for. An unread row that
   * stays unread is silently retriable on the next visit.
   */
  const markRead = useMutation({
    mutationFn: (id: string) => api.admin.markNotificationRead(id),
    onSuccess: () => void invalidate(),
  });

  /*
   * No success toast: the rows visibly re-rendering read and the badge
   * clearing IS the outcome report — a toast over a panel the operator is
   * looking at is noise (the tags form takes the same stance on error
   * placement). Failure does toast, because nothing else would say so.
   */
  const markAllRead = useMutation({
    mutationFn: () => api.admin.markAllNotificationsRead(),
    onSuccess: () => void invalidate(),
    onError: (error) => toastError(error, t('notifications.markAllReadFailed')),
  });

  const items = query.data?.items ?? [];
  /*
   * Derived from the rows the operator can SEE, OR-ed with the polled count:
   * gating on the count alone let a failed count poll (`retry: false`) hide
   * the button above a list of visibly-unread rows.
   */
  // Gated on `ready` as well: rendering it over the error or BackendPending
  // card offers a button that would clear rows the operator never saw.
  const hasUnread =
    query.status === 'ready' && (unreadCount > 0 || items.some((item) => !item.readAt));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasUnread && (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="cursor-pointer text-xs font-medium text-primary hover:underline disabled:opacity-50 focus-outline"
          >
            {t('notifications.markAllRead')}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <AsyncBoundary
          status={query.status}
          label={t('notifications.loading')}
          endpoints={['GET /admin/notifications']}
          onRetry={query.refetch}
          errorMessage={t('notifications.loadFailed')}
          error={query.error}
          fill
        >
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <Bell className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">{t('notifications.emptyTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('notifications.emptyBody')}</p>
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onRead={() => {
                      if (!item.readAt) markRead.mutate(item.id);
                    }}
                  />
                ))}
              </ul>
              {query.data?.nextCursor ? (
                <p className="pt-3 text-center text-[11px] text-muted-foreground">
                  {t('notifications.recentNotice', { count: items.length })}
                </p>
              ) : null}
            </>
          )}
        </AsyncBoundary>
      </div>
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: AdminNotification; onRead: () => void }) {
  const { admin } = useAdmin();
  const config = resolveKind(item.kind);
  const Icon = config?.icon ?? Bell;
  const unread = !item.readAt;
  /*
   * The deep link renders only when this admin can actually open it. The
   * fan-out filters on the ACTION permission (`withdrawals.approve`), but the
   * queue routes gate on the VIEW keys — a role granting approve without view
   * would otherwise click through to the "no access" panel. The row stays,
   * link-less: the information was addressed to them; the navigation was not.
   */
  const href = config?.href && canAccess(admin, config.href) ? config.href : undefined;

  const body = (
    <>
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${unread ? 'bg-primary/15' : 'bg-primary/10'} text-primary`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            {config ? t(config.titleKey) : t('notifications.fallbackTitle')}
            {unread && <span className="sr-only"> — {t('notifications.itemUnread')}</span>}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {relativeTime(item.createdAt)}
          </span>
        </span>
        {config ? (
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {t(config.bodyKey, config.vars?.(item.params))}
          </span>
        ) : null}
      </span>
      {unread && (
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </>
  );

  const rowClass = `flex gap-3 rounded-lg border border-border p-3 ${unread ? 'bg-primary/5' : 'bg-muted/30'}`;

  /*
   * A known kind navigates to the screen the event is actioned on; the sheet
   * closes with it (SheetClose). An unknown kind — a backend newer than this
   * deploy — renders as a plain row: generic title and timestamp, never a raw
   * slug.
   */
  if (href) {
    return (
      <li>
        <SheetClose asChild>
          <Link
            href={href}
            onClick={onRead}
            className={`${rowClass} transition-colors hover:bg-muted focus-outline`}
          >
            {body}
          </Link>
        </SheetClose>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onRead}
        className={`${rowClass} w-full cursor-pointer text-left transition-colors hover:bg-muted focus-outline`}
      >
        {body}
      </button>
    </li>
  );
}
