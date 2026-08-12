import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtime } from './use-realtime';

/**
 * The socket lifecycle, asserted against a fake `io`.
 *
 * What is worth testing here is not that Socket.IO works — it does. It is the
 * three things THIS hook adds, each of which fails silently: that an inline
 * handler object does not reconnect on every render, that a handler replaced
 * between renders is the one that runs, and that a refused handshake stops the
 * retry loop instead of hammering an API that has already said no.
 */

interface FakeSocket {
  handlers: Map<string, (payload?: unknown) => void>;
  connected: boolean;
  disconnect: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (payload?: unknown) => void) => FakeSocket;
  /** Drive the socket the way the server would. */
  fire: (event: string, payload?: unknown) => void;
}

const sockets: FakeSocket[] = [];
const io = vi.fn((): FakeSocket => {
  const socket: FakeSocket = {
    handlers: new Map(),
    connected: true,
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    removeAllListeners: vi.fn(() => socket.handlers.clear()),
    on: (event, handler) => {
      socket.handlers.set(event, handler);
      return socket;
    },
    fire: (event, payload) => {
      act(() => {
        socket.handlers.get(event)?.(payload);
      });
    },
  };
  sockets.push(socket);
  return socket;
});

vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => io(...(args as [])) }));

beforeEach(() => {
  sockets.length = 0;
  io.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The socket the hook opened, asserted to exist so tests read straight. */
function currentSocket(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error('the hook did not open a socket');
  return socket;
}

describe('useRealtime', () => {
  it('connects to the /realtime namespace with the session cookie', () => {
    renderHook(() => useRealtime({ 'notification.created': vi.fn() }));

    expect(io).toHaveBeenCalledTimes(1);
    const [url, options] = io.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toMatch(/\/realtime$/);
    // Without this the handshake carries no cookie and every connection is
    // refused — the failure looks like "realtime does not work" with no error.
    expect(options['withCredentials']).toBe(true);
    // Polling kept as the fallback: a proxy that blocks upgrades must degrade,
    // not silently kill the feature.
    expect(options['transports']).toEqual(['websocket', 'polling']);
  });

  it('does not connect at all when disabled', () => {
    // The portal passes `false` until the email is verified. A socket that would
    // always be refused must not be opened, or it retries forever.
    renderHook(() => useRealtime({ 'notification.created': vi.fn() }, false));

    expect(io).not.toHaveBeenCalled();
  });

  it('reports connected only while the socket is up', () => {
    const { result } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    expect(result.current.connected).toBe(false);

    currentSocket().fire('connect');
    expect(result.current.connected).toBe(true);

    currentSocket().fire('disconnect');
    expect(result.current.connected).toBe(false);
  });

  it('runs the handler for its event, and only for its event', () => {
    const onNotification = vi.fn();
    renderHook(() => useRealtime({ 'notification.created': onNotification }));

    currentSocket().fire('notification.created');
    expect(onNotification).toHaveBeenCalledTimes(1);

    // A future feature's event on the shared namespace must not fire this one.
    currentSocket().fire('deposit.settled');
    expect(onNotification).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect when only the handler identity changes', () => {
    /*
     * The whole reason handlers live in a ref. The sheet passes an inline
     * object — a fresh identity every render — and a hook keyed on it would
     * tear down and re-handshake several times a second, which from the server
     * is indistinguishable from an attack.
     */
    const { rerender } = renderHook(
      ({ fn }: { fn: () => void }) => useRealtime({ 'notification.created': fn }),
      { initialProps: { fn: vi.fn() } },
    );

    rerender({ fn: vi.fn() });
    rerender({ fn: vi.fn() });

    expect(io).toHaveBeenCalledTimes(1);
    expect(currentSocket().disconnect).not.toHaveBeenCalled();
  });

  it('calls the LATEST handler, not the one captured at connect', () => {
    // The other half of the ref: not reconnecting is only correct if the newest
    // handler still runs. Otherwise a stale closure invalidates a stale query key.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ fn }: { fn: () => void }) => useRealtime({ 'notification.created': fn }),
      { initialProps: { fn: first } },
    );

    rerender({ fn: second });
    currentSocket().fire('notification.created');

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('reconnects when the set of event names changes', () => {
    // The names decide the subscription, so a caller that starts listening for
    // a second event must actually be subscribed to it.
    const initialProps: { handlers: Record<string, () => void> } = { handlers: { a: vi.fn() } };
    const { rerender } = renderHook(
      ({ handlers }: { handlers: Record<string, () => void> }) => useRealtime(handlers),
      { initialProps },
    );

    rerender({ handlers: { a: vi.fn(), b: vi.fn() } });

    expect(io).toHaveBeenCalledTimes(2);
    expect(currentSocket().handlers.has('b')).toBe(true);
  });

  it('stops retrying a handshake the server refused', () => {
    /*
     * `unauthorized` means signed out or suspended — the session is gone, not
     * slow. Socket.IO's default is to retry forever, so the hook has to close
     * it explicitly or a signed-out tab becomes a permanent request loop.
     */
    const { result } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    currentSocket().fire('connect');

    currentSocket().fire('unauthorized');

    expect(currentSocket().disconnect).toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('treats an expiry close as a reconnect, not a refusal', () => {
    // The server closes sockets at token expiry ON PURPOSE, so the next connect
    // re-authenticates. Disconnecting here would defeat that.
    const { result } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    currentSocket().fire('connect');

    currentSocket().fire('session_expired');

    expect(result.current.connected).toBe(false);
    expect(currentSocket().disconnect).not.toHaveBeenCalled();
  });

  it('closes the socket when the component goes away', () => {
    const { unmount } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    const socket = currentSocket();

    unmount();

    // A socket outliving its component is one per navigation, forever.
    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
