/**
 * Cross-tab session coordination.
 *
 * Two defects share one cause — nothing in this app knew another tab existed:
 *
 *  - **Signing out in one tab left every other tab fully rendered.** The hard
 *    navigation ends the tab it runs in; the others keep their React Query cache
 *    and their chrome, and (before the `endDeadSession` fix) never corrected
 *    even on their next request. On a shared back-office machine that is the
 *    console still showing an operator's name and data to whoever sits down.
 *
 *  - **Two tabs could rotate one refresh token concurrently.** The single-flight
 *    lock in `client.ts` is module scope, which is per TAB. Each tab also runs
 *    its own ten-minute timer, so a laptop waking with two tabs open fires two
 *    refreshes at once. The server has no notion of "these are the same person",
 *    so one is told it lost — and, before the backend's grace window, the whole
 *    token family could be destroyed with a credential-theft alert.
 *
 * ## Why `BroadcastChannel` and Web Locks rather than `localStorage`
 *
 * A `storage` event fires only in OTHER tabs and only for a real value change,
 * so it needs a nonce to avoid being swallowed as a no-op write, and it cannot
 * express mutual exclusion at all. `BroadcastChannel` is the right shape for a
 * notification and Web Locks is the right shape for a lock. Both are supported
 * in every browser this console targets.
 *
 * **Everything degrades to the previous behaviour** when either API is missing:
 * `announce` becomes a no-op and `withSessionLock` runs the callback directly.
 * A tab that cannot coordinate is exactly as correct as it was before this file
 * existed — which is the only acceptable failure mode for a shim like this.
 */

/** One channel name per surface: the portal must not hear the console's events. */
const CHANNEL = 'oxshare-crm-admin-session';

/** The lock every refresh contends for, across every tab on this origin. */
const REFRESH_LOCK = 'oxshare-crm-admin-refresh';

export type SessionEvent = 'signed-out' | 'signed-in';

type ChannelLike = { postMessage(message: unknown): void; close(): void };

function openChannel(): ChannelLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as { BroadcastChannel?: new (name: string) => ChannelLike })
    .BroadcastChannel;
  if (typeof Ctor !== 'function') return null;
  try {
    return new Ctor(CHANNEL);
  } catch {
    return null;
  }
}

/**
 * Tell every other tab on this origin that the session changed.
 *
 * Fire-and-forget by design: a tab that is not listening, or a browser with no
 * `BroadcastChannel`, is not a failure worth surfacing to the operator.
 */
export function announceSessionEvent(event: SessionEvent): void {
  const channel = openChannel();
  if (!channel) return;
  try {
    channel.postMessage(event);
  } finally {
    channel.close();
  }
}

/**
 * Listen for session events from other tabs. Returns an unsubscribe function.
 */
export function onSessionEvent(handler: (event: SessionEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const Ctor = (
    window as {
      BroadcastChannel?: new (name: string) => ChannelLike & {
        onmessage: ((e: { data: unknown }) => void) | null;
      };
    }
  ).BroadcastChannel;
  if (typeof Ctor !== 'function') return () => {};

  let channel: (ChannelLike & { onmessage: ((e: { data: unknown }) => void) | null }) | null = null;
  try {
    channel = new Ctor(CHANNEL);
  } catch {
    return () => {};
  }

  channel.onmessage = (e: { data: unknown }) => {
    if (e.data === 'signed-out' || e.data === 'signed-in') handler(e.data);
  };

  return () => {
    try {
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    } catch {
      /* the channel is already gone; nothing to release */
    }
  };
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * Run `fn` while holding the cross-tab refresh lock.
 *
 * The lock is what stops two tabs presenting the same refresh token at the same
 * moment. Whichever tab gets it rotates; the others wait and then run `fn`
 * themselves — by which point the winner's rotated cookies are already in the
 * shared jar, so their own refresh either succeeds against the new token or is
 * answered `SESSION_SUPERSEDED`, which the client retries rather than treating
 * as a dead session.
 *
 * Serialising rather than short-circuiting is deliberate. A waiting tab cannot
 * observe whether the winner succeeded — the result is in an httpOnly cookie —
 * so "assume it worked" would be a guess, and a wrong guess leaves the tab
 * believing it has a session it does not.
 */
export async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
  if (!locks || typeof locks.request !== 'function') return fn();
  try {
    return await locks.request(REFRESH_LOCK, fn);
  } catch {
    // A browser that refuses the lock must still be able to refresh.
    return fn();
  }
}
