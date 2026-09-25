/**
 * The bell's sound, synthesised rather than fetched.
 *
 * ## Why no audio file
 *
 * A two-note chime is about forty lines of Web Audio and zero bytes over the
 * network. An `.mp3` would mean a public asset, a `media-src` entry in the CSP
 * (which is `'self'`-only and deliberately tight), a request that can fail,
 * and a decision about licensing. None of that buys a better sound at this
 * length.
 *
 * ## Autoplay policy is a fact, not a bug
 *
 * Browsers refuse audio until the user has interacted with the page, so a
 * notification arriving before the reader has touched anything is silent — and
 * there is nothing to be done about that, correctly: it is what stops pages
 * screaming at people.
 *
 * What IS done about it is `primeNotificationSound`, which builds and resumes
 * the context on the first click, keypress or tap rather than waiting for the
 * first notification to need it. Without that the first chime was inaudible
 * even long after the gesture requirement was satisfied, because `resume()` is
 * asynchronous and the oscillators were already scheduled — so the sound
 * appeared to start working only from the second notification onward.
 *
 * A refusal is swallowed either way: a bell that throws because it could not
 * make a noise is worse than a quiet bell.
 *
 * ## Sound is never the only signal
 *
 * The badge, the row and the unread marker all render regardless. This is an
 * addition for someone looking elsewhere, not a channel anything depends on —
 * which is what makes it safe for it to be silently unavailable.
 *
 * TWIN FILE with the portal's `lib/notification-sound.ts` (registered in
 * check-twins). Only the DEFAULT differs, and that lives in the config block
 * below rather than in the logic.
 */

// ─── twin:config:start ────────────────────────────────────────────────────────
/*
 * Operators sit on this console watching work queues, so an audible ping is
 * the point of it.
 *
 * The portal's copy now defaults to ON as well, so only the storage key below
 * actually differs between the twins. It used to default to OFF on the
 * reasoning that a client has the tab open incidentally; what changed is the
 * observation that the portal's events are ones a client is explicitly waiting
 * on — see the note in that file.
 */
const DEFAULT_ENABLED = true;
const STORAGE_KEY = 'oxshare.admin.notificationSound';
// ─── twin:config:end ──────────────────────────────────────────────────────────

/** The two notes, in Hz — a rising minor third, which reads as "attention". */
const NOTES = [660, 880] as const;
const NOTE_MS = 90;
/** Quiet on purpose. This shares a room with other people. */
const PEAK_GAIN = 0.05;

let context: AudioContext | null = null;

/**
 * Whether the reader wants sound. Server-safe: renders assume the default.
 *
 * `localStorage` is reached through a try/catch, exactly as
 * `lib/i18n/locale-storage.ts` does, and here it is not merely defensive: this
 * function is the `getSnapshot` of a `useSyncExternalStore`, and the bell is
 * mounted on every authenticated page. A browser that blocks storage — Safari
 * with "block all cookies", or any partitioned third-party context — throws a
 * SecurityError on ACCESS, which would land during render and take every
 * screen in the app to the error boundary because a preference could not be
 * read.
 */
export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return DEFAULT_ENABLED;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_ENABLED;
    return stored === 'on';
  } catch {
    return DEFAULT_ENABLED;
  }
}

/** Subscribers in THIS tab. `storage` only fires in the others. */
const listeners = new Set<() => void>();

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private browsing, blocked storage, or a full quota. The toggle still
    // works for this page; it just will not be remembered. Not worth an error.
  }
  // Notified either way, so the control reflects the click rather than
  // appearing stuck because the write failed.
  listeners.forEach((notify) => notify());
}

/**
 * The preference, as a React value.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, for two reasons
 * that are really the same one: it is the API for reading a store React does
 * not own, and it takes an explicit SERVER snapshot — so the markup rendered
 * on the server and the first client render agree, instead of the toggle
 * flipping after hydration.
 *
 * The `storage` event makes the preference tab-wide: muting the bell in one
 * tab mutes it in the others, which is what somebody silencing a noise in an
 * open-plan office actually means.
 */
export function subscribeToSoundPreference(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The snapshot a server render sees — always the default, never storage. */
export function soundEnabledOnServer(): boolean {
  return DEFAULT_ENABLED;
}

/** Whether the gesture listeners are already attached, app-wide. */
let primed = false;

/**
 * Build and resume the AudioContext on the reader's FIRST interaction with the
 * page, so the first real notification is audible.
 *
 * ## What this fixes
 *
 * Autoplay policy is still a fact and this does not defeat it. The problem it
 * solves is one of TIMING. A context created inside `playNotificationSound`
 * starts `suspended`, and `resume()` is asynchronous — so the very first chime
 * would schedule its oscillators against a context that is not running yet and
 * be inaudible, even for a reader who had been clicking around the app for
 * twenty minutes and whose gesture requirement was long since satisfied. The
 * sound then worked from the SECOND notification onward, which is indelicate to
 * notice and reads as "it's unreliable".
 *
 * Doing it on a real gesture instead means the context is `running` before
 * anything needs it, and the first notification sounds like the rest.
 *
 * ## It deliberately makes no sound
 *
 * A silent warm-up, not a test tone. Playing something on first click would be
 * a noise the reader did not ask for, at the moment they are least expecting
 * one.
 *
 * Registered regardless of the sound PREFERENCE: somebody who enables the
 * toggle later has, by clicking the toggle, already interacted — but the
 * context has to exist for that click to help, and building it here costs one
 * suspended context and no audio.
 *
 * Safe to call from several components; the listeners attach once. Returns a
 * cleanup for the caller's effect.
 */
/**
 * Whether the browser counts the reader as having interacted — `now` (inside a
 * gesture) or `ever` (at any point on this page). A browser without
 * `navigator.userActivation` cannot say, and is assumed to, which is how this
 * behaved before it asked.
 */
function hasUserActivation(when: 'now' | 'ever'): boolean {
  const activation = (
    navigator as { userActivation?: { isActive: boolean; hasBeenActive: boolean } }
  ).userActivation;
  if (!activation) return true;
  return when === 'now' ? activation.isActive : activation.hasBeenActive;
}

export function primeNotificationSound(): () => void {
  if (typeof window === 'undefined' || primed) return () => undefined;
  primed = true;

  /*
   * Events that CAN carry a user gesture. `touchstart` never does — a tap
   * activates the page on its END, which is why `pointerup` and `touchend` are
   * here — and a key press may not: a lone Ctrl or Shift (the start of the
   * shortcut that opens DevTools) is no gesture at all.
   */
  const events = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;

  const unlock = () => {
    /*
     * Only once the browser COUNTS this as a gesture. Built before that, an
     * AudioContext is refused and Chrome logs "The AudioContext was not allowed
     * to start" (reported from local testing) — and the listeners were already
     * gone, so the first chime stayed silent anyway. Not yet? Keep listening.
     */
    if (!hasUserActivation('now')) return;
    for (const event of events) window.removeEventListener(event, unlock);
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (context?.state === 'closed') context = null;
      context ??= new Ctor();
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    } catch {
      // Same swallow as `playNotificationSound`: a browser that refuses to
      // build an AudioContext is one where the bell is silent, which is a
      // degradation and not an error.
    }
  };

  // Passive: this never calls `preventDefault`, and saying so keeps it off the
  // critical path of the scroll or tap that triggers it.
  for (const event of events) window.addEventListener(event, unlock, { passive: true });

  return () => {
    for (const event of events) window.removeEventListener(event, unlock);
    primed = false;
  };
}

/**
 * Play the chime, if the reader wants it and the browser allows it.
 *
 * Never throws and never rejects: every failure here is "no sound happened",
 * which the caller cannot act on and the reader will not notice.
 */
export function playNotificationSound(): void {
  if (!soundEnabled() || typeof window === 'undefined') return;

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    /*
     * Reused, but replaced once CLOSED. A browser may close an AudioContext on
     * its own (resource pressure, a backgrounded tab), and a closed context
     * throws on `createOscillator` — so caching one forever would silence the
     * bell for the rest of the page's life, with the catch below swallowing the
     * reason.
     */
    if (context?.state === 'closed') context = null;
    // Nothing the reader has done yet counts as a gesture, so the browser would
    // refuse the context and say so in the console. Silence is the honest
    // outcome: the chime could not have played.
    if (!context && !hasUserActivation('ever')) return;
    context ??= new Ctor();
    // Created before any interaction, a context starts suspended. Resuming is
    // a no-op once it is running, and is refused (harmlessly) before.
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    const start = context.currentTime;
    NOTES.forEach((frequency, index) => {
      const at = start + (index * NOTE_MS) / 1000;
      const oscillator = (context as AudioContext).createOscillator();
      const gain = (context as AudioContext).createGain();

      // A sine with an envelope. A bare square wave at this length is a click,
      // and a gain that stops abruptly pops on most hardware.
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_MS / 1000);

      oscillator.connect(gain).connect((context as AudioContext).destination);
      oscillator.start(at);
      oscillator.stop(at + NOTE_MS / 1000);
    });
  } catch {
    // Autoplay refused, no audio device, a locked-down browser — all of them
    // mean the same thing here, and none of them is worth a console error on
    // every notification.
  }
}
