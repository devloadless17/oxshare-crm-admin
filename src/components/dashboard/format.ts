/**
 * Formatting shared by the dashboard's charts and tiles.
 *
 * Nothing here touches money — a monetary value is formatted by
 * `lib/money.ts` and by nothing else. These are dates and plain counts.
 */

/** Y-axis tick target. Four or five gridlines is enough to read a count off. */
export const tickCount = 4;

/**
 * `'2026-08-01'` → `'Aug 1'`, for an axis tick.
 *
 * Parsed by hand rather than with `new Date(value)`. The API sends a UTC
 * CALENDAR day with no time part, and `new Date('2026-08-01')` is midnight UTC
 * — which is the 31st of July anywhere west of Greenwich. An admin in New York
 * would see every point on this chart labelled with the previous day.
 */
export function axisDate(value: string): string {
  const parts = value.split('-');
  const year = Number.parseInt(parts[0] ?? '', 10);
  const month = Number.parseInt(parts[1] ?? '', 10);
  const day = Number.parseInt(parts[2] ?? '', 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return value;
  // `Date.UTC` + a UTC-pinned formatter: constructed and read in the same
  // timezone, so the calendar day survives the round trip.
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The same day, spelled out for a tooltip heading: `'Sat, Aug 1, 2026'`. */
export function longDate(value: string): string {
  const parts = value.split('-');
  const year = Number.parseInt(parts[0] ?? '', 10);
  const month = Number.parseInt(parts[1] ?? '', 10);
  const day = Number.parseInt(parts[2] ?? '', 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return value;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A COUNT with thousands separators. Not for money.
 *
 * `toLocaleString` is fine here and banned on money: these are integers counted
 * by Postgres and delivered as JSON numbers, so there is no string to truncate
 * and no precision to lose. The rule that makes `Intl` wrong for a balance —
 * that it takes a number — is exactly why it is right for a client count.
 */
export function formatCount(value: number): string {
  return value.toLocaleString();
}
