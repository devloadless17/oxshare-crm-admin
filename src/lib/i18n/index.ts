import { messages, type MessageKey } from './messages';
import { readStoredLocale } from './locale-storage';

/**
 * The translation seam — `docs/CLAUDE.md` "Designed for change", seam 4.
 *
 * TWIN FILE — an identical copy lives at the same path in `oxshare-crm-client`.
 * Only `./messages.ts` differs between the two.
 *
 * There is one locale today. That is deliberate: the same instruction that asks
 * for strings to be externalised says "do not build the language switcher yet".
 * What matters now is that every string passes through ONE function, so adding
 * Arabic later is a new catalogue plus a locale resolver — not an edit to every
 * component in the app.
 */

export type Locale = 'en' | 'ar';

/** Locales that read right-to-left. FSD §10 names Arabic specifically. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

/** The language used when nothing is stored, and on the server. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The active locale.
 *
 * A FUNCTION rather than an exported constant, so call sites are written against
 * "ask for the locale" instead of "read the locale" — the difference between
 * adding a switcher later and rewriting every consumer.
 *
 * On the server this is always `DEFAULT_LOCALE`. It has to be: the server has no
 * access to the browser's stored preference, and rendering one language on the
 * server and another on the client is a hydration mismatch. `LocaleDirection`
 * resolves the stored value on the client and corrects `<html lang>`/`<html dir>`
 * before paint — the same shape next-themes uses for the theme class, and the
 * reason `<html>` already carries `suppressHydrationWarning`.
 */
export function currentLocale(): Locale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

/**
 * Writing direction for a locale, for the `dir` attribute on `<html>`.
 *
 * RTL is not a translation problem, it is a layout problem: every `left-3`,
 * `pl-9`, `ml-auto` and `text-left` in the app has to become a logical property
 * (`start-3`, `ps-9`, `ms-auto`, `text-start`) before Arabic renders correctly.
 * That work is proportional to the number of components and cannot be deferred
 * into a translation pass. Exposing `dir` now means the sweep can be done and
 * VERIFIED incrementally — set the locale to 'ar' locally and the layout either
 * mirrors or it does not — instead of being discovered all at once at the end.
 */
export function direction(locale: Locale = currentLocale()): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/** Values substituted into a message's `{placeholders}`. */
/**
 * `undefined` is ALLOWED, and is the documented failure mode below: a var the
 * caller could not supply leaves its `{placeholder}` visible rather than
 * rendering an empty gap. The type says so because `t()` already implements it.
 */
export type MessageVars = Record<string, string | number | undefined>;

/**
 * Look up a message and fill in its placeholders.
 *
 * Keys are typed, so a mistyped key does not compile. Placeholders are
 * `{named}` rather than positional, because word order changes between
 * languages and a positional argument silently ends up in the wrong slot.
 *
 * An unknown placeholder is left as-is rather than replaced with `undefined`:
 * seeing `{amount}` in the UI is an obvious bug, while "on hold: undefined" is
 * one someone screenshots and asks about.
 */
export function t(key: MessageKey, vars?: MessageVars): string {
  const template: string = messages[key];
  if (!vars) return template;

  const filled = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });

  /*
   * PLURALS — `{count:network|networks}` picks by the var: the singular for
   * exactly 1, the plural otherwise (0 networks, 2 networks). It replaced the
   * "network(s)" shorthand, which reads as a form letter in the one place an
   * operator is being told something is wrong.
   *
   * Applied AFTER the plain fill, so a branch may itself say `{count}`
   * (`{count:The wallet|All {count} wallets}`). A var the caller did not supply
   * leaves the selector visible, for the same reason as a plain placeholder.
   * Compared as text, not `Number()`: a count arrives as either type.
   */
  return filled.replace(
    /\{(\w+):([^|{}]*)\|([^{}]*)\}/g,
    (whole, name: string, one: string, other: string) => {
      const value = vars[name];
      if (value === undefined) return whole;
      return String(value) === '1' ? one : other;
    },
  );
}

/**
 * Hook form, for components that will later need to re-render on a locale change.
 *
 * It returns `t` unchanged today. It exists so components are already written as
 * `const { t } = useTranslation()` — the shape every i18n library uses — which
 * means introducing one later does not touch the call sites.
 */
export function useTranslation(): { t: typeof t; locale: Locale; dir: 'ltr' | 'rtl' } {
  const locale = currentLocale();
  return { t, locale, dir: direction(locale) };
}

export { messages, type MessageKey };
export { LOCALE_STORAGE_KEY, readStoredLocale, storeLocale } from './locale-storage';
