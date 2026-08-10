import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotificationStream } from './use-notification-stream';

/**
 * The live stream's contract with its caller.
 *
 * jsdom has no `EventSource`, so one is supplied here. That is not a
 * workaround — the three properties worth pinning are all about how this hook
 * DRIVES that object, and each has a failure mode that is invisible in the UI:
 *
 *  - not opening a connection when disabled (the portal's unverified client),
 *    because `EventSource` retries a refused connection forever and one
 *    guaranteed 403 becomes a permanent reconnect loop;
 *  - reporting `connected` from the heartbeat, because that is what backs the
 *    poll off — get it wrong and the app either polls forever or stops
 *    polling while the stream is dead;
 *  - closing on unmount, because a leaked connection per mount exhausts the
 *    browser's six-per-origin budget and every later stream silently hangs.
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;

  readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  onerror: (() => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((handler) => handler(new MessageEvent(type)));
  }

  close(): void {
    this.closed = true;
  }

  /**
   * The connection the hook most recently opened.
   *
   * `instances[0]` is what every assertion below wants, and under
   * `noUncheckedIndexedAccess` that expression is `FakeEventSource | undefined`
   * — so nine call sites failed `tsc` while the suite passed, because vitest's
   * transform does not typecheck. Nine `!` assertions would silence it and turn
   * "the hook never opened a connection" into `Cannot read properties of
   * undefined`, which names neither the hook nor the expectation.
   *
   * This throws with the reason instead, so the interesting failure — a change
   * that stops the hook connecting at all — reports itself.
   */
  static latest(): FakeEventSource {
    const source = FakeEventSource.instances.at(-1);
    if (!source) throw new Error('The hook opened no EventSource connection.');
    return source;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  Object.defineProperty(window, 'EventSource', {
    value: FakeEventSource,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'EventSource');
});

describe('useNotificationStream', () => {
  it('opens ONE connection, to the admin feed', () => {
    renderHook(() => useNotificationStream(vi.fn()));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.latest().url).toBe('/api/admin/notifications/stream');
  });

  it('opens NOTHING while disabled', () => {
    // The portal's unverified client. A connection here would be refused by
    // EmailVerifiedGuard and retried forever.
    renderHook(() => useNotificationStream(vi.fn(), false));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('reports connected only once the server has actually spoken', () => {
    const { result } = renderHook(() => useNotificationStream(vi.fn()));

    // Constructing an EventSource proves nothing — the connection may still
    // fail. Until a frame arrives the caller must keep polling.
    expect(result.current.connected).toBe(false);

    act(() => FakeEventSource.latest().emit('ping'));
    expect(result.current.connected).toBe(true);
  });

  it('calls the handler on a notification, and marks the stream alive', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useNotificationStream(onEvent));

    act(() => FakeEventSource.latest().emit('notification'));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(result.current.connected).toBe(true);
  });

  it('reports NOT connected when the connection errors, so polling resumes', () => {
    const { result } = renderHook(() => useNotificationStream(vi.fn()));
    act(() => FakeEventSource.latest().emit('ping'));

    act(() => {
      FakeEventSource.latest().readyState = 0;
      FakeEventSource.latest().onerror?.();
    });

    expect(result.current.connected).toBe(false);
    // Left open on purpose: EventSource reconnects with its own backoff, and
    // closing to reconnect by hand replaces that with a tighter loop against a
    // server that is probably already struggling.
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('reconnects when the server CLOSED the stream — its 15-minute re-auth cycle', () => {
    renderHook(() => useNotificationStream(vi.fn()));

    act(() => {
      FakeEventSource.latest().readyState = FakeEventSource.CLOSED;
      FakeEventSource.latest().onerror?.();
    });

    // A closed connection never recovers by itself, so this is the one error
    // the hook acts on.
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('closes the connection on unmount', () => {
    const { unmount } = renderHook(() => useNotificationStream(vi.fn()));
    const source = FakeEventSource.latest();

    unmount();

    expect(source.closed).toBe(true);
  });

  it('does not reconnect when the handler identity changes', () => {
    // Callers pass an inline arrow. Rebuilding the connection on every render
    // would reconnect several times a second and read, from the server, as an
    // attack.
    const { rerender } = renderHook(({ handler }) => useNotificationStream(handler), {
      initialProps: { handler: vi.fn() },
    });

    rerender({ handler: vi.fn() });
    rerender({ handler: vi.fn() });

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('calls the LATEST handler, not the one captured at connect time', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useNotificationStream(handler), {
      initialProps: { handler: first },
    });

    rerender({ handler: second });
    act(() => FakeEventSource.latest().emit('notification'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
