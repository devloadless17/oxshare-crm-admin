import { currentLocale } from '@/lib/i18n';

/**
 * "3 minutes ago" — the unit a reader thinks in when scanning a recency list.
 *
 * `Intl.RelativeTimeFormat` rather than a date library — it is built in, and it
 * localises. It is fed `currentLocale()` rather than left to the browser: every
 * other string on screen renders through the i18n seam, and a timestamp in the
 * browser's own language inside an app pinned to another reads as a glitch.
 * Note this is NOT a money path: `Intl` is banned there (see lib/money.ts)
 * because it rounds, which is irrelevant for a timestamp and fatal for a
 * balance.
 *
 * The unit check runs on the ROUNDED value — checking the raw one lets 59.8
 * minutes pass the `< 60` gate and then round up to a rendered "60 minutes
 * ago", which is a sentence no person says.
 *
 * TWIN FILE with the sibling repo's `lib/relative-time.ts` (registered in
 * check-twins) — behaviour changes belong in both.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const seconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Infinity],
  ];

  let value = seconds;
  for (const [unit, step] of units) {
    const rounded = Math.round(value);
    if (Math.abs(rounded) < step) {
      // Arabic words with WESTERN digits (`-u-nu-latn`), as every other figure
      // in the app: plain 'ar' would print "قبل ٥ دقائق" in Eastern digits.
      const locale = currentLocale();
      return new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
        numeric: 'auto',
      }).format(rounded, unit);
    }
    value /= step;
  }
  return iso;
}
