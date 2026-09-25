import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import type { RealtimePayload } from '@/hooks/use-realtime';
import type { AdminNotification } from '@/lib/api/admin-notifications';
import { displayOf, KIND_DISPLAY, pathOf, type TaskFacts } from './catalogue';

/**
 * Announce a task the moment it lands — "Approve withdrawal · #1000245 ·
 * 1,250.00 USD", with a Review action.
 *
 * The socket carries the row's `params` and the client's Portal ID, never a
 * name: names are masked per reader, which only the HTTP read can do, so the
 * toast names the client the way every table can — by Portal ID. The badge
 * behind it is the durable signal; the toast is the announcement.
 *
 * A kind this build does not know gets the generic title and no action, never
 * a raw slug. A payload that lost its params (a long reason bursts pg_notify's
 * budget, and the trigger falls back to routing only) still gets its title.
 */
export function toastNotification(
  payload: RealtimePayload,
  onView?: (href: string) => void,
  canOpen: (path: string) => boolean = () => true,
): void {
  if (!payload) return;
  const kind = typeof payload['kind'] === 'string' ? payload['kind'] : undefined;
  if (!kind) return;
  if (!Object.hasOwn(KIND_DISPLAY, kind)) {
    // A kind this build does not know — the title alone, and the refresh hint.
    toast(t('notifications.fallbackTitle'), { description: t('notifications.fallbackBody') });
    return;
  }
  const display = displayOf(kind);

  const raw = payload['params'];
  const portalId =
    typeof payload['subjectPortalId'] === 'number' ? payload['subjectPortalId'] : null;
  const facts: TaskFacts = {
    params:
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as AdminNotification['params'])
        : {},
    client: { portalId },
  };
  const body = display.body(facts);
  const detail = [portalId === null ? null : `#${portalId}`, t(body.key, body.vars)]
    .filter(Boolean)
    .join(' · ');
  const href = display.href(facts);

  toast(t(display.titleKey), {
    description: detail,
    action:
      onView && canOpen(pathOf(href))
        ? { label: t('notifications.review'), onClick: () => onView(href) }
        : undefined,
  });
}

/** The burst toast's id — a burst while one is showing UPDATES it instead of stacking. */
const BURST_TOAST_ID = 'notifications-burst';

/**
 * Several tasks landing together — a scheduler announcing stuck transfers, a
 * busy minute on a desk — are ONE announcement: "5 new tasks need your action",
 * with the inbox one click away. Twenty toasts cycling for a minute is exactly
 * the bell the owner asked not to have.
 */
export function toastBurst(count: number, onOpen: () => void): void {
  toast(t('notifications.burstTitle', { count }), {
    id: BURST_TOAST_ID,
    action: { label: t('notifications.openInbox'), onClick: onOpen },
  });
}
