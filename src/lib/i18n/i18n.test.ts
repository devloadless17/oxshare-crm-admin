import { beforeEach, describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY, currentLocale, direction, messages, storeLocale, t } from './index';
import type { MessageKey } from './messages';

/**
 * The translation seam — `docs/CLAUDE.md` "Designed for change", seam 4.
 *
 * What is worth pinning here is not "does a lookup work" but the properties that
 * make the seam survive contact with a second locale:
 *
 *  - a mistyped key must not compile (checked by the type-level assertion below,
 *    not at runtime — a runtime test cannot observe a compile error),
 *  - a missing interpolation must be visible rather than render "undefined",
 *  - no message may be empty, because an empty string renders as nothing and
 *    looks like a layout bug rather than a missing translation,
 *  - `dir` must flip for Arabic, since FSD §10 names RTL specifically and the
 *    layout sweep is verified by setting the locale and looking.
 */

describe('t() — lookup and interpolation', () => {
  it('returns the message for a key', () => {
    expect(t('login.submit')).toBe('Sign in to Admin');
  });

  it('fills named placeholders', () => {
    expect(t('invite.welcome', { name: 'Ada' })).toBe('Welcome, Ada!');
  });

  it('accepts numbers as well as strings', () => {
    expect(t('common.requestId', { id: 42 })).toBe('Reference: 42');
  });

  it('leaves an unsupplied placeholder visible instead of rendering undefined', () => {
    // "on hold: undefined" is a bug someone screenshots and asks about;
    // "{total}" is a bug the developer fixes before it ships.
    expect(t('nav.comingSoonTitle')).toBe('{label} — coming soon');
  });

  it('ignores extra variables rather than throwing', () => {
    expect(t('login.submit', { unused: 'x' })).toBe('Sign in to Admin');
  });
});

describe('the catalogue itself', () => {
  const entries = Object.entries(messages) as [MessageKey, string][];

  it('has no empty message', () => {
    const empty = entries.filter(([, value]) => value.trim() === '').map(([key]) => key);
    // An empty string renders as nothing, which reads as a broken layout rather
    // than a missing translation — the hardest kind of i18n bug to spot.
    expect(empty).toEqual([]);
  });

  it('uses dotted lower-case keys throughout', () => {
    const malformed = entries.map(([key]) => key).filter((key) => !/^[a-z][\w.]*$/.test(key));
    expect(malformed).toEqual([]);
  });

  it('declares every placeholder with a name', () => {
    // `{0}` style positional placeholders are what break when word order changes
    // between languages — the exact failure this module exists to avoid.
    const positional = entries.filter(([, value]) => /\{\d+\}/.test(value)).map(([key]) => key);
    expect(positional).toEqual([]);
  });
});

describe('direction — RTL is a layout problem, and this is where it starts', () => {
  it('is ltr for English', () => {
    expect(direction('en')).toBe('ltr');
  });

  it('is rtl for Arabic, which FSD §10 names explicitly', () => {
    expect(direction('ar')).toBe('rtl');
  });

  it('defaults to the current locale', () => {
    expect(direction()).toBe(direction(currentLocale()));
  });
});

/**
 * Type-level guard, not a runtime one.
 *
 * The value of typed keys is that `t('lgoin.title')` fails to COMPILE. This
 * line documents that contract where a reader will see it; the actual
 * enforcement is `npm run type-check`, and uncommenting the second line below
 * must break the build.
 */
const _validKey: MessageKey = 'login.submit';
void _validKey;
// @ts-expect-error — a key that is not in the catalogue must not type-check.
const _invalidKey: MessageKey = 'lgoin.title';
void _invalidKey;

describe('locale persistence — what makes RTL exercisable', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to English when nothing is stored', () => {
    expect(currentLocale()).toBe('en');
    expect(direction()).toBe('ltr');
  });

  it('reads a stored language', () => {
    storeLocale('ar');
    expect(currentLocale()).toBe('ar');
    // The point of the whole exercise: flipping one stored value flips the
    // document direction, so the RTL layout sweep can be verified rather than
    // assumed. FSD §10 names Arabic explicitly.
    expect(direction()).toBe('rtl');
  });

  it('ignores a stored value that is not a supported locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon');
    // An older build, a manual edit, or a half-finished migration must not be
    // able to render the app in a language that has no catalogue.
    expect(currentLocale()).toBe('en');
  });

  it('namespaces the key, so a sibling OxShare app cannot clobber it', () => {
    // Same reasoning as the backend's oxshare_crm_* cookie names: several
    // OxShare properties share one registrable domain and one localStorage
    // origin per host, and a bare `locale` or `i18nextLng` is exactly what
    // another team would also pick.
    expect(LOCALE_STORAGE_KEY).toMatch(/^oxshare-/);
  });

  it('survives storage being unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied in private browsing');
      },
    });

    // A preference that cannot be read is not a reason to fail a page render.
    expect(() => currentLocale()).not.toThrow();
    expect(currentLocale()).toBe('en');
    expect(() => storeLocale('ar')).not.toThrow();

    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});
