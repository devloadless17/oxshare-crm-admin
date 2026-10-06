import {
  addDays,
  addMinutes,
  formatISO,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';

/**
 * THE PERIOD every list filters by — one vocabulary, one resolution.
 *
 * The buyer's demo (6 Oct 2026): every screen of movements opens on TODAY so a
 * busy book never loads its whole history, offers the periods every console
 * offers, and a custom from → to to the minute.
 *
 * "Today" is the VIEWER's today, which only the browser knows, so a preset is
 * resolved HERE to exact instants with their offset (`2026-10-06T00:00:00+03:00`)
 * and the API compares them as given (`common/date-range.ts` in the backend).
 * The upper bound is EXCLUSIVE — the start of the next day or minute — so the
 * last second of a range never falls between `23:59:59.999` and a microsecond
 * timestamp.
 *
 * The URL keeps the PRESET (`?range=today`), never its instants, so a bookmark
 * of "Today" is today tomorrow too. Only a custom period keeps its bounds
 * (`?from=2026-10-01T08:00&to=2026-10-06T17:30`, local wall time).
 */
export const DATE_PRESETS = [
  'today',
  'yesterday',
  '7d',
  '30d',
  'thisMonth',
  'lastMonth',
  '3m',
  'thisYear',
  '12m',
  'all',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export type DateRangeChoice = DatePreset | 'custom';

/** What the API is sent: instants with offset, `to` exclusive. Absent = unbounded. */
export interface ResolvedRange {
  from?: string;
  to?: string;
}

/** A custom bound as the URL holds it: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, local wall time. */
export type LocalBound = string;

const instant = (date: Date) => formatISO(date);

export function isDatePreset(value: string): value is DatePreset {
  return (DATE_PRESETS as readonly string[]).includes(value);
}

/** The preset's `[start, end)` as Dates in local time; `undefined` for All time. */
export function presetBounds(preset: DatePreset, now: Date = new Date()): [Date, Date] | undefined {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case 'today':
      return [today, tomorrow];
    case 'yesterday':
      return [subDays(today, 1), today];
    case '7d':
      return [subDays(today, 6), tomorrow];
    case '30d':
      return [subDays(today, 29), tomorrow];
    case 'thisMonth':
      return [startOfMonth(now), tomorrow];
    case 'lastMonth':
      return [startOfMonth(subMonths(now, 1)), startOfMonth(now)];
    case '3m':
      return [subMonths(today, 3), tomorrow];
    case 'thisYear':
      return [startOfYear(now), tomorrow];
    case '12m':
      return [subMonths(today, 12), tomorrow];
    case 'all':
      return undefined;
  }
}

/** A URL bound to a local Date, or undefined when it is not one. */
export function parseLocalBound(value: LocalBound): Date | undefined {
  const pattern = value.includes('T') ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd';
  const parsed = parse(value, pattern, new Date());
  return isValid(parsed) ? parsed : undefined;
}

/** A local Date as the URL holds it — with the time only when one was chosen. */
export function formatLocalBound(date: Date, withTime: boolean): LocalBound {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

/**
 * A custom `[from, to]` as the reader means it, to API instants. Both bounds
 * are INCLUSIVE as typed: a date `to` covers that whole day, a `to` of 17:30
 * covers 17:30:59 — so the exclusive end is the next day or the next minute.
 */
export function customBounds(from: LocalBound, to: LocalBound): { start?: Date; end?: Date } {
  const start = from ? parseLocalBound(from) : undefined;
  const last = to ? parseLocalBound(to) : undefined;
  const end = last
    ? to.includes('T')
      ? addMinutes(last, 1)
      : addDays(startOfDay(last), 1)
    : undefined;
  return {
    start: start && !from.includes('T') ? startOfDay(start) : start,
    end,
  };
}

/** The choice to what the API is sent. */
export function resolveRange(
  choice: DateRangeChoice,
  custom: { from: LocalBound; to: LocalBound } = { from: '', to: '' },
  now: Date = new Date(),
): ResolvedRange {
  if (choice === 'custom') {
    const { start, end } = customBounds(custom.from, custom.to);
    return {
      ...(start ? { from: instant(start) } : {}),
      ...(end ? { to: instant(end) } : {}),
    };
  }
  const bounds = presetBounds(choice, now);
  return bounds ? { from: instant(bounds[0]), to: instant(bounds[1]) } : {};
}
