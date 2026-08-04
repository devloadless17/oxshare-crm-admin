import type { Locale } from './index';

/**
 * Where the chosen language is remembered.
 *
 * TWIN FILE — an identical copy lives at the same path in `oxshare-crm-client`.
 *
 * The convention is the one every i18n stack uses and the one this platform's
 * reference CRM uses: a single localStorage key holding the language tag
 * (`i18nextLng` there), read on boot, written when the user chooses. Ours is
 * namespaced to match the theme key already in use (`oxshare-*-theme` via
 * next-themes) so one app's preferences cannot collide with another OxShare
 * site's on a shared registrable domain — the same reasoning that drove the
 * cookie names in the backend's session-cookies.ts.
 *
 * WHY THIS EXISTS BEFORE THE SWITCHER DOES
 *
 * `docs/CLAUDE.md` says not to build the language switcher yet, and this is not
 * one — there is no UI here. What it buys is that RTL becomes TESTABLE: set the
 * key in devtools, reload, and the layout either mirrors correctly or it does
 * not. Without it, `direction()` is a function nobody can exercise and the
 * Arabic layout sweep stays theoretical until the day it is urgent.
 *
 * `localStorage`, not a cookie: this is a display preference, it is not sent to
 * the API, and it should outlive the session — the same lifetime `theme-mode`
 * already has. It is deliberately NOT in the session cookie jar, which holds
 * credentials.
 */

// ─── twin:config:start ────────────────────────────────────────────────────────
// The ONLY part of this file that differs from its twin. Everything below the
// end marker must stay identical in both apps; scripts/check-twins.sh enforces
// that by excluding this block and comparing the rest.
//
// Namespaced PER APP so two OxShare properties on one registrable domain cannot
// overwrite each other's preference — the same reasoning as the backend's
// oxshare_crm_<surface>_* cookie names. A bare `locale` or `i18nextLng` is
// exactly what another team would also pick.
export const LOCALE_STORAGE_KEY = 'oxshare-admin-locale';
// ─── twin:config:end ──────────────────────────────────────────────────────────

const SUPPORTED: readonly Locale[] = ['en', 'ar'];

function isSupported(value: string | null): value is Locale {
  return value !== null && (SUPPORTED as readonly string[]).includes(value);
}

/**
 * The stored language, or `null` when there is none or it is unusable.
 *
 * Returns null rather than throwing on every failure path — private browsing
 * denies localStorage entirely, an unknown value may be left by an older build,
 * and none of that is a reason to fail a page render. The caller falls back to
 * the default locale, which is always a valid answer.
 */
export function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Remember a language choice. Silently a no-op where storage is unavailable. */
export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private browsing, or a full quota. A preference that cannot be saved is
    // not worth breaking the page over.
  }
}
