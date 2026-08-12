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
 * Browsers refuse audio until the user has interacted with the page, so the
 * first notification after a cold load may be silent — and there is nothing to
 * be done about that, correctly: it is what stops pages screaming at people.
 * The context is created lazily on the first play attempt and resumed if it is
 * suspended, so sound starts working from the first click, keypress or scroll
 * onward. A refusal is swallowed: a bell that throws because it could not make
 * a noise is worse than a quiet bell.
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
 * the point of it. The portal's copy defaults to OFF: a client has the tab
 * open incidentally, and an unexpected noise from a page nobody was looking at
 * is what gets a feature muted permanently on day one.
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
