import { toast } from 'sonner';
import { t } from '@/lib/i18n';
import type { RealtimePayload } from '@/hooks/use-realtime';
import type { AdminNotification } from '@/lib/api/admin';
import { resolveKind } from './notification-kinds';

/**
 * Turn one `notification.created` socket event into a toast.
 *
 * ## Why this renders from the EVENT and not from a refetch
 *
 * The socket carries `{id, kind, params}` (backend migration 0061), which is
 * everything the kind catalogue needs — so the toast is drawn from what
 * arrived, with no request in between. The alternative was to invalidate the
 * feed and toast the newest row once it came back, and that reads worse than it
 * sounds: on a busy console the toast would trail the event by a round trip,
 * and a failed request would drop the announcement entirely while the badge
 * still ticked up.
 *
 * The bell list is still invalidated by the caller. That is the durable record;
 * this is the announcement.
 *
 * ## Why a plain toast and not `lib/toast.ts`
 *
 * `toastSuccess`/`toastError` are for the outcome of a write THIS operator just
 * performed — they colour green and red, and `toastError` unwraps an axios
 * error and appends a request id. A notification is neither: nobody here did
 * anything, and "a client requested a withdrawal" is not a success or a
 * failure. Colouring it green would put a positive signal on a work item, and
 * red would make an ordinary queue arrival look like an incident. So this is
 * the neutral variant, raised through the same host.
 *
 * ## Both degrade paths render something honest
 *
 * An UNKNOWN kind (a backend deployed ahead of this app) and a MISSING `params`
 * (the trigger drops it above `pg_notify`'s 8000-byte limit) both fall back to
 * a title with no body, never a raw slug and never a sentence with an empty
 * hole in it. The bell row behind it always has the full detail, because that
 * comes from the permission-checked read rather than the socket.
 */
export function toastNotification(
  payload: RealtimePayload,
  /**
   * Navigate to the screen this is actioned on. Supplied by the caller rather
   * than imported, because `useRouter` is a hook and this is not a component.
   * Omitted, the toast simply has no action.
   */
  onView?: (href: string) => void,
): void {
  // No payload at all means no event worth announcing — the transport already
  // discarded anything that was not an object, and a toast with no kind could
  // only be the generic title with nothing behind it.
  if (!payload) return;

  const kind = typeof payload['kind'] === 'string' ? payload['kind'] : undefined;
  if (!kind) return;

  const config = resolveKind(kind);
  if (!config) {
    // A kind this build does not know. The generic title is the same one the
    // bell row uses, so the two agree even here.
    toast(t('notifications.fallbackTitle'));
    return;
  }

  /*
   * `params` is validated as an object before the catalogue's `vars` is allowed
   * near it. `vars` reads named fields and passes them through `formatMoney`,
   * and this value came off a socket — so an absent or non-object `params`
   * means no body at all rather than a sentence built out of empty strings.
   */
  const raw = payload['params'];
  const params =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as AdminNotification['params'])
      : undefined;

  const description = params && config.vars ? t(config.bodyKey, config.vars(params)) : undefined;

  toast(t(config.titleKey), {
    // A body only when there is one to build. `undefined` renders no second
    // line; an empty string renders an empty line, which looks like a bug.
    description: params ? (description ?? t(config.bodyKey)) : undefined,
    action:
      config.href && onView
        ? {
            label: t('notifications.view'),
            // `config.href` is narrowed by the guard above, but the closure
            // outlives it — hence the local.
            onClick: () => onView(config.href as string),
          }
        : undefined,
  });
}
