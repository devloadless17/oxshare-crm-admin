'use client';

import * as React from 'react';

// ─── twin:config:start ────────────────────────────────────────────────────────
/*
 * The portal's copy points at `/api/notifications/stream`; this one at the
 * admin feed. Same file otherwise.
 */
const STREAM_URL = '/api/admin/notifications/stream';
// ─── twin:config:end ──────────────────────────────────────────────────────────

/**
 * How long a stream may go silent before it is treated as dead.
 *
 * The server sends a keep-alive every 25 seconds, so 70 covers two missed ones
 * plus slack. This exists because the failure that matters is not a stream
 * that ERRORS — the browser reports those and reconnects — but one that stays
 * open and stops delivering: a proxy that dropped the connection without
 * telling either end. That looks identical to "nothing has happened", which is
 * the state a notification system must never be unable to distinguish.
 */
const SILENCE_TIMEOUT_MS = 70_000;

export interface NotificationStreamState {
  /** True while the stream is proven live — the server has sent something. */
  connected: boolean;
}

/**
 * Subscribe to the live notification feed.
 *
 * ## Server-Sent Events, not a socket
 *
 * This channel only ever pushes server→client, which is what SSE is for. It
 * needs no dependency, no CSP change (`connect-src 'self'` already allows it,
 * because the console proxies `/api` through its own origin, which is also why
 * the session cookie is sent), and the browser owns reconnection. The server
 * closes each stream after fifteen minutes so the next connect re-authenticates
 * — including re-reading `admins.status`, so a suspended operator's bell goes
 * quiet.
 *
 * ## `connected` is what the caller does something with
 *
 * The bell keeps a slow poll underneath this. When the stream is proven live
 * the poll is pointless and is backed off; when it is not — SSE blocked by a
 * corporate proxy, the listener down, the browser out of connections — the
 * poll carries the feature at its old cadence. So the degradation is to
 * "slower", never to "silent".
 *
 * TWIN FILE with the portal's copy (registered in check-twins).
 */
export function useNotificationStream(
  onEvent: () => void,
  /**
   * Whether to open the stream at all.
   *
   * The portal passes `false` until the client's email is verified: both feed
   * routes sit behind `EmailVerifiedGuard`, and `EventSource` retries a
   * refused connection forever — so one guaranteed 403 becomes a reconnect
   * loop against a route that can never succeed.
   */
  enabled = true,
): NotificationStreamState {
  const [connected, setConnected] = React.useState(false);

  /*
   * The callback is held in a ref so a caller may pass an inline arrow without
   * tearing down and rebuilding the connection on every render — which would
   * reconnect several times a second and look, from the server, like an
   * attack.
   */
  const handler = React.useRef(onEvent);
  // Synced in an effect rather than during render: writing a ref while
  // rendering is what `react-hooks/refs` forbids, and this effect is declared
  // FIRST so the handler is current before the connection effect below runs.
  React.useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let source: EventSource | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const markAlive = () => {
      setConnected(true);
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        // Open but silent for over two heartbeats. Report it as down so the
        // poll resumes, and drop the connection so the browser rebuilds it.
        setConnected(false);
        source?.close();
        if (!disposed) connect();
      }, SILENCE_TIMEOUT_MS);
    };

    const connect = () => {
      if (disposed) return;
      source = new EventSource(STREAM_URL, { withCredentials: true });

      // The heartbeat proves the stream is live without implying an event.
      source.addEventListener('ping', markAlive);

      source.addEventListener('notification', () => {
        markAlive();
        handler.current();
      });

      source.onerror = () => {
        /*
         * Reported as not-connected, and then LEFT ALONE. EventSource
         * reconnects on its own with its own backoff, and closing it here to
         * reconnect manually would replace that with a tighter loop against a
         * server that is probably already struggling.
         *
         * The one exception is a closed connection, which never recovers by
         * itself — that is the server's fifteen-minute cycle, so reconnect.
         */
        setConnected(false);
        if (source?.readyState === EventSource.CLOSED && !disposed) {
          source.close();
          connect();
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      source?.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
