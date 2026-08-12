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

export interface RealtimeState {
  /** True while the socket is connected — what the caller backs its poll off on. */
  connected: boolean;
}

/**
 * One socket, shared by every live feature in this app.
 *
 * ## Why a socket rather than one stream per feature
 *
 * The tech lead's call, and the shape follows it: this is ONE connection to a
 * `/realtime` namespace, and every future live feature is a new EVENT NAME on
 * it. A deposit settling, a withdrawal changing state, a balance moving — each
 * is `subscribe('deposit.settled', fn)` against the connection the browser
 * already holds. No second handshake, no second authentication, and no extra
 * entry in the browser's per-origin connection budget.
 *
 * That is why this hook is `useRealtime` and not `useNotificationStream`: the
 * transport is the app's, not the bell's.
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
 * authenticator. `unauthorized` means the reconnect will never succeed (signed
 * out, suspended), so the retry loop stops rather than hammering.
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
  const [connected, setConnected] = React.useState(false);

  const handlerRef = React.useRef(handlers);
  // Synced in an effect rather than during render — `react-hooks/refs` forbids
  // writing a ref while rendering. Declared FIRST so it is current before the
  // connection effect below runs.
  React.useEffect(() => {
    handlerRef.current = handlers;
  }, [handlers]);

  /*
   * The event NAMES decide when to rebuild the subscription, not the handler
   * identities. A caller passing an inline object would otherwise reconnect on
   * every render — several times a second, which from the server looks like an
   * attack.
   */
  const eventNames = Object.keys(handlers).sort().join(',');

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const socket: Socket = io(`${REALTIME_ORIGIN}${NAMESPACE}`, {
      withCredentials: true,
      /*
       * WebSocket first, polling kept as the fallback.
       *
       * The fallback is what stops a corporate proxy that blocks upgrades
       * being the one place this silently dies — Socket.IO degrades on its own
       * and the feature still works, slower.
       */
      transports: ['websocket', 'polling'],
      // Socket.IO's own backoff. Capped so a long outage does not leave the
      // app waiting minutes after the server returns.
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    /*
     * A refused handshake will be refused again — the session is gone, not
     * slow. Retrying it forever would be a request loop against a server that
     * has already answered clearly, so the client stops and lets the app's
     * normal 401 handling move the reader to sign in.
     */
    socket.on('unauthorized', () => {
      setConnected(false);
      socket.disconnect();
    });

    // The server closes sockets at token expiry so the next connect
    // re-authenticates. Reconnection is Socket.IO's default, so this only has
    // to not be mistaken for an error.
    socket.on('session_expired', () => setConnected(false));

    for (const name of eventNames.split(',').filter(Boolean)) {
      socket.on(name, () => handlerRef.current[name]?.());
    }

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [enabled, eventNames]);

  return { connected };
}
