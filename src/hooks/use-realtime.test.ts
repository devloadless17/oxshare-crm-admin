import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtime } from './use-realtime';

/**
 * The socket lifecycle, asserted against a fake `io`.
 *
 * What is worth testing here is not that Socket.IO works — it does. It is the
 * four things THIS hook adds, each of which fails silently: that ONE connection
 * is shared by every caller, that an inline handler object does not resubscribe
 * on every render, that a handler replaced between renders is the one that runs,
 * and that a refused handshake is retried later rather than abandoned for the
 * life of the page.
 */

/** Swapped per test so the "not configured" case can be exercised. */
let configuredOrigin: string | null = 'http://localhost:3003';

vi.mock('@/lib/env', () => ({
  get REALTIME_ORIGIN() {
    return configuredOrigin;
  },
}));

interface FakeSocket {
  handlers: Map<string, Set<(payload?: unknown) => void>>;
  connected: boolean;
  disconnect: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (payload?: unknown) => void) => FakeSocket;
  off: (event: string, handler?: (payload?: unknown) => void) => FakeSocket;
  /** Drive the socket the way the server would. */
  fire: (event: string, payload?: unknown) => void;
  /** How many handlers are bound to an event — proves cleanup really unbinds. */
  count: (event: string) => number;
}

const sockets: FakeSocket[] = [];

const io = vi.fn((): FakeSocket => {
  const socket: FakeSocket = {
    handlers: new Map(),
    connected: false,
    disconnect: vi.fn(() => {
      socket.connected = false;
      socket.fire('disconnect');
    }),
    connect: vi.fn(() => {
      socket.connected = true;
      socket.fire('connect');
    }),
    removeAllListeners: vi.fn(() => socket.handlers.clear()),
    on: (event, handler) => {
      const set = socket.handlers.get(event) ?? new Set();
      set.add(handler);
      socket.handlers.set(event, set);
      return socket;
    },
    off: (event, handler) => {
      if (!handler) socket.handlers.delete(event);
      else socket.handlers.get(event)?.delete(handler);
      return socket;
    },
    fire: (event, payload) => {
      act(() => {
        for (const handler of [...(socket.handlers.get(event) ?? [])]) handler(payload);
      });
    },
    count: (event) => socket.handlers.get(event)?.size ?? 0,
  };
  sockets.push(socket);
  return socket;
});

vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => io(...(args as [])) }));

beforeEach(() => {
  configuredOrigin = 'http://localhost:3003';
  sockets.length = 0;
  io.mockClear();
});

afterEach(() => {
  // Unmount every hook so the module-level refcount returns to zero — the
  // shared connection would otherwise leak into the next test.
  cleanup();
  vi.useRealTimers();
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
    expect(options['transports']).toEqual(['websocket', 'polling']);
    /*
     * The one that is easy to get wrong: listing both transports does NOT make
     * engine.io fall back. It only advances to the next transport when this is
     * true, and it defaults to false — so without it, a proxy that blocks
     * upgrades means realtime never connects at all rather than degrading.
     */
    expect(options['tryAllTransports']).toBe(true);
  });

  it('does not connect at all when disabled', () => {
    // The portal passes `false` until the email is verified. A socket that would
    // always be refused must not be opened, or it retries forever.
    renderHook(() => useRealtime({ 'notification.created': vi.fn() }, false));

    expect(io).not.toHaveBeenCalled();
  });

  it('does not connect when no realtime origin is configured', () => {
    // `env.ts` yields null rather than throwing, so the app runs and the poll
    // carries the bell. The hook must not dial `null/realtime`.
    configuredOrigin = null;

    const { result } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));

    expect(io).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('shares ONE connection between callers', () => {
    /*
     * The promise the whole transport decision rests on: a future live feature
     * is a new event name on the connection the browser already holds.
     *
     * `io()` does not give this for free — its manager cache creates a NEW
     * manager when the namespace is already in use, so two call sites would
     * otherwise mean two sockets and two handshakes.
     */
    const first = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    const second = renderHook(() => useRealtime({ 'deposit.settled': vi.fn() }));

    expect(io).toHaveBeenCalledTimes(1);

    // Both callers' events are bound to that one socket.
    expect(currentSocket().count('notification.created')).toBe(1);
    expect(currentSocket().count('deposit.settled')).toBe(1);

    // And it survives one of them going away.
    second.unmount();
    expect(currentSocket().disconnect).not.toHaveBeenCalled();
    expect(currentSocket().count('notification.created')).toBe(1);

    first.unmount();
    expect(currentSocket().disconnect).toHaveBeenCalled();
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

  it('does not resubscribe when only the handler identity changes', () => {
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
    // Exactly one binding, not one per render.
    expect(currentSocket().count('notification.created')).toBe(1);
  });

  it('calls the LATEST handler, not the one captured at connect', () => {
    // The other half of the ref: not resubscribing is only correct if the
    // newest handler still runs. Otherwise a stale closure invalidates a stale
    // query key.
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

  it('resubscribes when the set of event names changes', () => {
    // The names decide the subscription, so a caller that starts listening for
    // a second event must actually be subscribed to it.
    const initialProps: { handlers: Record<string, () => void> } = { handlers: { a: vi.fn() } };
    const { rerender } = renderHook(
      ({ handlers }: { handlers: Record<string, () => void> }) => useRealtime(handlers),
      { initialProps },
    );

    rerender({ handlers: { a: vi.fn(), b: vi.fn() } });

    expect(currentSocket().count('b')).toBe(1);
  });

  it('retries a refused handshake later instead of giving up for good', () => {
    /*
     * `unauthorized` is not always permanent, and treating it as permanent was
     * a real gap: a token expiring while the tab is backgrounded produces a
     * refused reconnect, while the API client's own refresh quietly restores
     * the session. Realtime would stay dead until the page was reloaded.
     */
    vi.useFakeTimers();
    const { result } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    const socket = currentSocket();
    socket.fire('connect');

    socket.fire('unauthorized');

    expect(socket.disconnect).toHaveBeenCalled();
    expect(result.current.connected).toBe(false);

    // It must not hammer — nothing for the first stretch...
    act(() => void vi.advanceTimersByTime(30_000));
    expect(socket.connect).not.toHaveBeenCalled();

    // ...then one attempt, on its own.
    act(() => void vi.advanceTimersByTime(31_000));
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('retries immediately when the reader comes back to the tab', () => {
    // The moment a refused socket is most likely to succeed: the reader is
    // here, and the API client refreshes the session on its next request.
    vi.useFakeTimers();
    renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    const socket = currentSocket();
    socket.fire('unauthorized');

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(socket.connect).toHaveBeenCalledTimes(1);
    // …and the pending timer was cancelled rather than firing a second dial.
    act(() => void vi.advanceTimersByTime(120_000));
    expect(socket.connect).toHaveBeenCalledTimes(1);
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

  it('closes the socket when the last component goes away', () => {
    const { unmount } = renderHook(() => useRealtime({ 'notification.created': vi.fn() }));
    const socket = currentSocket();

    unmount();

    // A socket outliving its component is one per navigation, forever.
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.count('notification.created')).toBe(0);
  });
});
