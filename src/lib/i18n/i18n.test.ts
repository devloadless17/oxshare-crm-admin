import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

describe('t() — plurals', () => {
  /*
   * `{count:one|other}` replaced the "field(s)" shorthand across both apps. The
   * rule is small and easy to get subtly wrong: exactly 1 is singular, and 0 is
   * PLURAL ("0 fields hidden", never "0 field hidden").
   */
  it('picks the singular for exactly one', () => {
    expect(t('roles.maskSummary', { count: 1 })).toBe('1 field hidden');
  });

  it('picks the plural for zero and for many', () => {
    expect(t('roles.maskSummary', { count: 0 })).toBe('0 fields hidden');
    expect(t('roles.maskSummary', { count: 3 })).toBe('3 fields hidden');
  });

  it('treats a count sent as text the same as a number', () => {
    expect(t('roles.maskSummary', { count: '1' })).toBe('1 field hidden');
  });

  it('lets a branch carry the count itself', () => {
    expect(t('ipAllowlist.enforcing', { count: 1 })).toBe(
      'Enforcing. Only the network below can reach the administration API.',
    );
    expect(t('ipAllowlist.enforcing', { count: 4 })).toBe(
      'Enforcing. Only the 4 networks below can reach the administration API.',
    );
  });

  it('agrees the verb with the noun, not just the noun', () => {
    expect(t('bridge.outbox.unhealthy', { count: 1 })).toMatch(/^1 deal has been attempted/);
    expect(t('bridge.outbox.unhealthy', { count: 2 })).toMatch(/^2 deals have been attempted/);
  });

  it('leaves the selector visible when the count was not supplied', () => {
    expect(t('roles.maskSummary', {})).toBe('{count} {count:field|fields} hidden');
  });

  it('no message still says "(s)"', () => {
    const shorthand = Object.entries(messages).filter(([, text]) => String(text).includes('(s)'));
    expect(shorthand.map(([key]) => key)).toEqual([]);
  });

  it('the reconciliation line claims only what the job checks', () => {
    // It used to add "and every confirmed accrual has been credited" — a check
    // that left with the commission engine. The one sentence that tells an
    // operator the money adds up must not promise more than was verified.
    expect(t('reconciliation.ok.body', { count: 3 })).not.toMatch(/accrual has been credited/);
    expect(t('reconciliation.ok.body', { count: 3 })).toMatch(/^All 3 wallets agree/);
    expect(t('reconciliation.ok.body', { count: 1 })).toMatch(/^The wallet agrees with its ledger/);
  });
});

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
    expect(t('common.requestId')).toBe('Reference: {id}');
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

describe('call sites — every placeholder message is actually interpolated', () => {
  /*
   * The catalogue tests above check the MESSAGES. Nothing checked the CALLS, and
   * that is where this shipped from: `cursor-pagination.tsx` rendered
   * `{t('pagination.page')} {pageNumber}` — the key without its interpolation
   * object, with the number concatenated beside it. Every paginated screen in
   * the admin app read "Page {number} 1" in its footer.
   *
   * It is invisible to every other gate. It type-checks (the second argument is
   * optional), it lints, and it renders — `t()` deliberately returns the template
   * verbatim so a missing value is visible rather than "undefined", which is the
   * right behaviour and precisely why the failure is silent to a machine.
   *
   * So the guard is a scan: if a message contains `{placeholder}`, no call site
   * may invoke it without arguments.
   */
  const withPlaceholders = new Set(
    (Object.entries(messages) as [MessageKey, string][])
      .filter(([, value]) => /\{[a-zA-Z_][a-zA-Z0-9_]*\}/.test(value))
      .map(([key]) => key),
  );

  /** Comments are stripped: a note ABOUT the bug must not read as the bug. */
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const sourceFiles = (): string[] => {
    const root = join(__dirname, '..', '..');
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.test\.tsx?$/.test(entry.name) &&
          entry.name !== 'messages.ts' &&
          entry.name !== 'types.gen.ts'
        ) {
          out.push(full);
        }
      }
    };
    walk(root);
    return out;
  };

  it('finds no t(key) call that drops a required value', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = stripComments(readFileSync(file, 'utf8'));
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/\bt\(\s*'([a-zA-Z0-9._]+)'\s*\)/g)) {
          const key = match[1] as MessageKey;
          if (withPlaceholders.has(key)) {
            offenders.push(`${file.split('/src/')[1]}:${index + 1} — t('${key}')`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('scans a meaningful number of files, so it cannot pass vacuously', () => {
    // A walker that silently matched nothing would make the test above green
    // forever — the same trap the dispatcher's "found no repo" guard exists for.
    expect(sourceFiles().length).toBeGreaterThan(20);
    expect(withPlaceholders.size).toBeGreaterThan(5);
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
