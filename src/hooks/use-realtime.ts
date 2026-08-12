'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_ORIGIN } from '@/lib/env';

/*
 * The realtime origin is resolved and VALIDATED in `lib/env.ts`, not read here.
 *
 * It is not an app-specific value — both apps connect to the same realtime
 * server — and it must not be read as `process.env[name]`, which Next does not
 * inline into the browser bundle. Reading it there would leave the production
 * build pointed at localhost with nothing to say so.
 */

/** The single namespace every live feature shares. See the module note. */
const NAMESPACE = '/realtime';

/**
 * How long to wait before re-attempting a handshake the server refused.
 *
 * Long enough not to hammer an API that has already said no, short enough that
 * a reader who was briefly unauthenticated gets realtime back on their own.
 */
const UNAUTHORIZED_RETRY_MS = 60_000;

export interface RealtimeState {
  /** True while the socket is connected — what the caller backs its poll off on. */
  connected: boolean;
}

/*
 * ── ONE connection per app, shared by every caller ───────────────────────────
 *
 * Module scope, deliberately. `io()` does NOT deduplicate this for us: its
 * manager cache creates a NEW manager whenever the requested namespace is
 * already in use, so two components each calling `useRealtime` would open two
 * sockets and two handshakes — precisely the cost this design exists to avoid.
 *
 * Reference-counted rather than left open: the last caller to unmount closes
 * it, so signing out or navigating away does not leave a socket behind.
 */
let shared: Socket | null = null;
let refCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function acquire(): Socket | null {
  // Realtime is OFF rather than pointed somewhere wrong — see `lib/env.ts`.
  if (!REALTIME_ORIGIN) return null;

  if (!shared) {
    shared = io(`${REALTIME_ORIGIN}${NAMESPACE}`, {
      withCredentials: true,
      /*
       * WebSocket first, polling kept as the fallback.
       *
       * `tryAllTransports` is what actually makes that fallback happen.
       * Listing both transports is not enough: engine.io only advances to the
       * next one when this is true, and it defaults to FALSE — so behind a
       * proxy that blocks upgrades the connection would abort and retry
       * WebSocket forever, never once trying the transport that would work.
       */
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      // Socket.IO's own backoff. Capped so a long outage does not leave the
      // app waiting minutes after the server returns.
      reconnectionDelayMax: 10_000,
    });
  }

  refCount += 1;
  return shared;
}

function release(): void {
  refCount -= 1;
  if (refCount > 0) return;

  refCount = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  shared?.removeAllListeners();
  shared?.disconnect();
  shared = null;
}

/**
 * Try again later after a refused handshake.
 *
 * A refusal is not always permanent. The common case is a token that expired
 * while the tab was in the background: the server closes the socket, the
 * reconnect presents the same stale cookie and is refused — and meanwhile the
 * API client's own refresh quietly restores the session. Giving up forever
 * would leave realtime dead for the life of the page while everything else
 * worked, which reads as "notifications are broken".
 */
function scheduleRetry(): void {
  if (retryTimer || !shared) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    shared?.connect();
  }, UNAUTHORIZED_RETRY_MS);
}

/**
 * One socket, shared by every live feature in this app.
 *
 * ## Why a socket rather than one stream per feature
 *
 * The tech lead's call, and the shape follows it: this is ONE connection to a
 * `/realtime` namespace, and every future live feature is a new EVENT NAME on
 * it. A deposit settling, a withdrawal changing state, a balance moving — each
 * is `useRealtime({ 'deposit.settled': fn })` against the connection the
 * browser already holds. No second handshake, no second authentication, and no
 * extra entry in the browser's per-origin connection budget.
 *
 * That sharing is implemented above rather than assumed — see `acquire`.
 *
 * That is also why this hook is `useRealtime` and not `useNotificationStream`:
 * the transport is the app's, not the bell's.
 *
 * ## The connection is authenticated by the session cookie
 *
 * `withCredentials` sends it on the handshake; the server authenticates there
 * and puts the socket in a room for that principal. Nothing is sent from the
 * browser to say who it is — a socket that claimed its own identity would be
 * an authorization bypass with a friendly API.
 *
 * ## It is closed by the server when the token expires
 *
 * The handshake is the only place credentials are checked, so the server drops
 * the socket at token expiry and this reconnects — through the full
 * authenticator. A refused reconnect backs off for a minute and tries again
 * rather than giving up for the life of the page.
 *
 * TWIN FILE with the sibling repo's copy (registered in check-twins).
 */
export function useRealtime(
  /** Event name → handler. Kept in a ref, so an inline object is safe. */
  handlers: Record<string, () => void>,
  /**
   * Whether to connect at all.
   *
   * The portal passes `false` until the client's email is verified: the feed
   * routes sit behind `EmailVerifiedGuard`, and a socket that will always be
   * refused would otherwise retry forever.
   */
  enabled = true,
): RealtimeState {
  /*
   * Seeded from the SHARED socket, not from `false`.
   *
   * A second caller mounting onto a connection that is already up would
   * otherwise report itself disconnected until the next event — and the sheet
   * uses this to decide its poll interval, so it would poll fast for no reason.
   * A lazy initialiser rather than a `setState` in the effect, which cascades a
   * render and is a lint error here.
   */
  const [connected, setConnected] = React.useState(() => shared?.connected ?? false);

  const handlerRef = React.useRef(handlers);
  // Synced in an effect rather than during render — `react-hooks/refs` forbids
  // writing a ref while rendering. Declared FIRST so it is current before the
  // connection effect below runs.
  React.useEffect(() => {
    handlerRef.current = handlers;
  }, [handlers]);

  /*
   * The event NAMES decide when to rebuild the subscription, not the handler
   * identities. A caller passing an inline object would otherwise resubscribe
   * on every render — several times a second.
   */
  const eventNames = Object.keys(handlers).sort().join(',');

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const socket = acquire();
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDown = () => setConnected(false);
    const onUnauthorized = () => {
      setConnected(false);
      socket.disconnect();
      scheduleRetry();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDown);
    socket.on('connect_error', onDown);
    socket.on('unauthorized', onUnauthorized);
    // The server closes sockets at token expiry so the next connect
    // re-authenticates. Reconnection is Socket.IO's default, so this only has
    // to not be mistaken for an error.
    socket.on('session_expired', onDown);

    const names = eventNames.split(',').filter(Boolean);
    const bound = names.map((name) => {
      const fn = () => handlerRef.current[name]?.();
      socket.on(name, fn);
      return [name, fn] as const;
    });

    /*
     * Coming back to a backgrounded tab is the moment a refused socket is most
     * likely to succeed — the reader is here, and the API client refreshes the
     * session on its next request. Retrying then costs one handshake and turns
     * "realtime stopped working an hour ago" into something nobody notices.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible' && shared && !shared.connected) {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        shared.connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      // Only THIS caller's listeners — the connection may be shared.
      socket.off('connect', onConnect);
      socket.off('disconnect', onDown);
      socket.off('connect_error', onDown);
      socket.off('unauthorized', onUnauthorized);
      socket.off('session_expired', onDown);
      for (const [name, fn] of bound) socket.off(name, fn);
      release();
      setConnected(false);
    };
  }, [enabled, eventNames]);

  return { connected };
}
