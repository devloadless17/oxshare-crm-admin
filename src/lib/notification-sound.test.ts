import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  playNotificationSound,
  setSoundEnabled,
  soundEnabled,
  soundEnabledOnServer,
  subscribeToSoundPreference,
} from './notification-sound';

/**
 * The bell's sound.
 *
 * Two of these pin properties that are cheap to break and expensive to notice:
 * that a browser refusing audio is SILENT rather than throwing, and that the
 * server snapshot never reads storage. The rest pin the preference itself,
 * which is the only part a reader interacts with.
 */

const STORAGE_KEY = 'oxshare.admin.notificationSound';

/**
 * Install a fake `AudioContext` ON `window`, which is what the module reads.
 *
 * `vi.stubGlobal` alone does not reach `window.AudioContext` under jsdom, and
 * that mattered: with the constructor undefined the module returns early, so
 * the "no sound when muted" and "never throws" cases below both PASSED while
 * exercising nothing. A test that cannot fail is worse than no test, so the
 * stub is installed explicitly and asserted against.
 */
function stubAudioContext(implementation: () => unknown): ReturnType<typeof vi.fn> {
  /*
   * A real `function`, not an arrow.
   *
   * The module calls `new Ctor()`, and an arrow cannot be constructed — the
   * TypeError lands in the module's catch, which swallows everything by
   * design, so the test saw silence and no error. `vi.fn` wrapping a
   * `function` is constructible, and returning an object from a constructor
   * makes that object the result.
   */
  const ctor = vi.fn(function (this: unknown) {
    return implementation();
  });
  Object.defineProperty(window, 'AudioContext', {
    value: ctor,
    configurable: true,
    writable: true,
  });
  return ctor;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'AudioContext');
});

describe('the preference', () => {
  it('defaults to ON for the console — operators watch these queues', () => {
    expect(soundEnabled()).toBe(true);
  });

  it('round-trips a choice through storage', () => {
    setSoundEnabled(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('off');
    expect(soundEnabled()).toBe(false);

    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
  });

  it('reports the DEFAULT as the server snapshot, never storage', () => {
    // The value a server render must produce. Reading storage here is what
    // makes the toggle flip after hydration — a mismatch React warns about and
    // a reader sees as a flicker.
    setSoundEnabled(false);
    expect(soundEnabledOnServer()).toBe(true);
  });

  it('notifies subscribers in THIS tab, and unsubscribes cleanly', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToSoundPreference(onChange);

    setSoundEnabled(false);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    setSoundEnabled(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('follows a change made in ANOTHER tab', () => {
    // Muting the bell in one tab must mute it in the others — that is what
    // somebody silencing a noise in an open-plan office actually means.
    const onChange = vi.fn();
    const unsubscribe = subscribeToSoundPreference(onChange);

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(onChange).toHaveBeenCalledTimes(1);

    // An unrelated key must not wake it.
    window.dispatchEvent(new StorageEvent('storage', { key: 'something.else' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('playing', () => {
  it('makes no sound at all when the reader has muted it', () => {
    const AudioContextSpy = stubAudioContext(() => ({}));

    setSoundEnabled(false);
    playNotificationSound();

    // Not merely inaudible — no audio context is even constructed.
    expect(AudioContextSpy).not.toHaveBeenCalled();
  });

  it('NEVER throws when the browser refuses audio', () => {
    /*
     * The property that matters most here. Autoplay policy, a locked-down
     * browser and a machine with no audio device all surface as an exception
     * from this constructor, and every one of them means "no sound happened" —
     * which the caller cannot act on. A bell that throws because it could not
     * make a noise would take the notification handler down with it, so the
     * row would not refresh either.
     */
    const ctor = stubAudioContext(() => {
      throw new Error('play() failed because the user did not interact first');
    });

    setSoundEnabled(true);
    expect(() => playNotificationSound()).not.toThrow();
    // Asserted so this cannot pass by the constructor never being reached —
    // which is exactly how it passed before the stub was fixed.
    expect(ctor).toHaveBeenCalled();
  });

  it('builds a two-note chime through a gain envelope', () => {
    const oscillator = {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const context = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      resume: vi.fn(),
    };
    stubAudioContext(() => context);

    setSoundEnabled(true);
    playNotificationSound();

    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    // The envelope is what stops a 90ms tone being a click and a pop.
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });
});

describe('where storage is unavailable', () => {
  const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    // Restored, or every later test inherits a throwing localStorage.
    if (realStorage) Object.defineProperty(window, 'localStorage', realStorage);
  });

  /**
   * A browser that BLOCKS storage throws on access rather than returning null —
   * Safari's "block all cookies" and any partitioned third-party context do
   * this. `soundEnabled` is the `getSnapshot` of a `useSyncExternalStore` and
   * the bell is mounted on every authenticated page, so a throw here does not
   * mute the bell: it lands during render and takes the whole app to the error
   * boundary, because a preference could not be read.
   */
  function blockStorage() {
    const denied = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({ getItem: denied, setItem: denied, removeItem: denied }),
    });
  }

  it('falls back to the default instead of throwing on read', () => {
    blockStorage();

    expect(() => soundEnabled()).not.toThrow();
    // `soundEnabledOnServer` IS the default, so this holds in both twins.
    expect(soundEnabled()).toBe(soundEnabledOnServer());
  });

  it('does not throw when the preference cannot be saved', () => {
    // The toggle still works for this page; it just is not remembered.
    blockStorage();

    expect(() => setSoundEnabled(true)).not.toThrow();
  });

  it('keeps playNotificationSound to its never-throws contract', () => {
    // The call sits inside the socket handler. A throw here would take the
    // React Query invalidation down with it, so the bell would stop updating.
    blockStorage();

    expect(() => playNotificationSound()).not.toThrow();
  });
});

describe('a context the browser closed', () => {
  it('is replaced rather than reused forever', async () => {
    /*
     * A browser may close an AudioContext on its own under resource pressure
     * or in a backgrounded tab, and a closed context THROWS on
     * `createOscillator`. Caching one forever would silence the bell for the
     * rest of the page's life, with the module's own catch hiding the reason.
     *
     * Imported FRESH: the cached context is module state, so without this the
     * test would inherit whatever an earlier test left behind and pass or fail
     * on file ordering rather than on behaviour.
     */
    vi.resetModules();
    const sound = await import('./notification-sound');

    const makeContext = (state: string) => ({
      state,
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { value: 0 },
        // Chainable: the module writes `osc.connect(gain).connect(dest)`, and a
        // fake returning undefined throws into the module's catch — which
        // silently ends the loop after ONE note.
        connect: vi.fn(() => ({ connect: vi.fn() })),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      resume: vi.fn(),
    });

    const first = makeContext('running');
    const replacement = makeContext('running');
    const contexts = [first, replacement];
    stubAudioContext(() => contexts.shift() ?? replacement);

    sound.setSoundEnabled(true);
    sound.playNotificationSound();
    expect(first.createOscillator).toHaveBeenCalledTimes(2); // two notes

    // The browser closes it underneath us — the case this guards.
    first.state = 'closed';
    sound.playNotificationSound();

    // A fresh context did the work; the closed one was not touched again.
    expect(first.createOscillator).toHaveBeenCalledTimes(2);
    expect(replacement.createOscillator).toHaveBeenCalledTimes(2);
  });
});
