import type { QueryClient } from '@tanstack/react-query';
import { keys } from '@/lib/query-keys';

/** Long enough to fold a click and its own socket echo into one refetch. */
const COALESCE_MS = 300;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Re-read the notifications — once, however many reasons arrive together.
 *
 * Every write here is answered twice: the mutation settles, then the backend's
 * `notification.changed` echoes the same write back over the socket. And a
 * busy desk resolves several tasks a minute, each one an echo. Each refresh
 * re-reads EVERY page an infinite feed has loaded, so ten pages of History
 * turned one click into twenty requests. Folded here, a burst costs one read.
 */
export function refreshNotifications(queryClient: QueryClient): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void queryClient.invalidateQueries({ queryKey: keys.notifications.all() });
  }, COALESCE_MS);
}
