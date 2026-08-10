import { beforeEach, describe, expect, it, vi } from 'vitest';
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
