import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Cross-tab session coordination — and the loop it caused.
 *
 * The portal's copy of this module shipped without the self-sender guard and
 * reloaded forever:
 *
 *   land on the sign-in page → the profile call 401s → refresh fails →
 *   `endDeadSession` announces 'signed-out' → THIS document's own listener
 *   hears it → hard navigation → and round again.
 *
 * It also aborted whatever request was in flight, which surfaced as an
 * "unreachable API" screen over a perfectly healthy backend — the loop wearing
 * the costume of a different failure.
 *
 * The cause is a genuine surprise in the API, which is why it is pinned here
 * rather than left to a reviewer to notice: `BroadcastChannel` does not deliver
 * a message back to the channel OBJECT that sent it, but it DOES deliver to
 * every other object of the same name in the same origin — including other
 * objects in the same document. `announceSessionEvent` opens a short-lived
 * channel to post; `onSessionEvent` holds a separate long-lived one. Two
 * objects, one document, and the listener hears itself.
 *
 * jsdom has no `BroadcastChannel`, so these drive a fake with exactly that
 * delivery rule. A fake that echoed to the sender, or that delivered to nobody,
 * would make the test pass while proving nothing — so the rule is implemented
 * once, here, and the "hears another document" case exists to show the fake can
 * deliver at all.
 */

type Listener = (e: { data: unknown }) => void;

class FakeChannel {
  static open: FakeChannel[] = [];
  onmessage: Listener | null = null;
  closed = false;

  constructor(public name: string) {
    FakeChannel.open.push(this);
  }

  postMessage(data: unknown) {
    // The real rule: every OTHER object with this name, including in this
    // document. Never back to the sender.
    for (const ch of FakeChannel.open) {
      if (ch === this || ch.closed || ch.name !== this.name) continue;
      ch.onmessage?.({ data });
    }
  }

  close() {
    this.closed = true;
    FakeChannel.open = FakeChannel.open.filter((c) => c !== this);
  }
}

async function loadModule() {
  vi.resetModules();
  return import('./session-channel');
}

beforeEach(() => {
  FakeChannel.open = [];
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cross-tab session events', () => {
  it('does NOT deliver a document its own announcement', async () => {
    /*
     * The regression test. Without the sender id this fires, and in the real app
     * the handler is a hard navigation — so the tab reloads, announces again on
     * the next load, and never stops.
     */
    const { announceSessionEvent, onSessionEvent } = await loadModule();

    const heard = vi.fn();
    onSessionEvent(heard);
    announceSessionEvent('signed-out');

    expect(heard).not.toHaveBeenCalled();
  });

  it('DOES deliver an announcement from another document', async () => {
    /*
     * The other half, and it is what stops the guard above from being satisfied
     * by a module that simply never delivers anything. A second module instance
     * is a second document: its SENDER_ID differs, so the listener acts.
     */
    const listening = await loadModule();
    const otherTab = await loadModule();

    const heard = vi.fn();
    listening.onSessionEvent(heard);
    otherTab.announceSessionEvent('signed-out');

    expect(heard).toHaveBeenCalledWith('signed-out');
  });

  it('ignores anything that is not a session message', async () => {
    // The channel name is shared by everything on the origin. A stray message —
    // a browser extension, a future feature reusing the name — must not be read
    // as "your session ended" and sign an operator out mid-task.
    const { onSessionEvent } = await loadModule();

    const heard = vi.fn();
    onSessionEvent(heard);

    const stray = new FakeChannel('oxshare-crm-admin-session');
    stray.postMessage('signed-out');
    stray.postMessage({ event: 'nonsense', from: 'x' });
    stray.postMessage(null);

    expect(heard).not.toHaveBeenCalled();
  });

  it('stops delivering once unsubscribed', async () => {
    const listening = await loadModule();
    const otherTab = await loadModule();

    const heard = vi.fn();
    const stop = listening.onSessionEvent(heard);
    stop();
    otherTab.announceSessionEvent('signed-out');

    expect(heard).not.toHaveBeenCalled();
  });

  it('degrades to a no-op where BroadcastChannel does not exist', async () => {
    // The only acceptable failure for a shim: a browser that cannot coordinate
    // must behave exactly as it did before this module existed, not throw on the
    // sign-out path.
    vi.stubGlobal('BroadcastChannel', undefined);
    const { announceSessionEvent, onSessionEvent } = await loadModule();

    expect(() => announceSessionEvent('signed-out')).not.toThrow();
    const stop = onSessionEvent(vi.fn());
    expect(() => stop()).not.toThrow();
  });

  it('survives a channel constructor that throws', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('blocked by the browser');
        }
      },
    );
    const { announceSessionEvent, onSessionEvent } = await loadModule();

    expect(() => announceSessionEvent('signed-out')).not.toThrow();
    expect(() => onSessionEvent(vi.fn())()).not.toThrow();
  });
});

describe('the cross-tab refresh lock', () => {
  it('runs the callback while holding the lock', async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request } });
    const { withSessionLock } = await loadModule();

    await expect(withSessionLock(() => Promise.resolve('renewed'))).resolves.toBe('renewed');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('still refreshes where the Web Locks API is missing', async () => {
    // Serialising is an improvement, not a precondition. A browser without locks
    // must still be able to renew its session — the alternative is signing that
    // user out permanently.
    vi.stubGlobal('navigator', {});
    const { withSessionLock } = await loadModule();

    await expect(withSessionLock(() => Promise.resolve('renewed'))).resolves.toBe('renewed');
  });

  it('still refreshes when the lock request itself fails', async () => {
    vi.stubGlobal('navigator', {
      locks: {
        request: () => Promise.reject(new Error('lock unavailable')),
      },
    });
    const { withSessionLock } = await loadModule();

    await expect(withSessionLock(() => Promise.resolve('renewed'))).resolves.toBe('renewed');
  });
});
