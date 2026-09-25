import { currentLocale, t } from '@/lib/i18n';

/**
 * Tasks grouped by the LOCAL day they arrived — Today, Yesterday, a weekday
 * inside the last week, a date before that.
 *
 * Local, never UTC: `toISOString().slice(0, 10)` puts an evening task in
 * tomorrow's group east of Greenwich and a morning one in yesterday's to the
 * west — the date-range bug the portal already paid for once. The key is built
 * from local getters for that reason.
 */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** The local midnight a `dayKey` names. */
function dateOfKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(y, m - 1, d);
}

/** Whole local days from `key` to `now`'s day — 0 today, 1 yesterday. */
function daysAgo(key: string, now: Date): number {
  const then = dateOfKey(key);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounded: a daylight-saving change makes one day 23 or 25 hours long.
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

export function dayLabel(key: string, now: Date = new Date()): string {
  const ago = daysAgo(key, now);
  if (ago === 0) return t('notifications.groupToday');
  if (ago === 1) return t('notifications.groupYesterday');
  const date = dateOfKey(key);
  if (ago > 1 && ago < 7) {
    return new Intl.DateTimeFormat(currentLocale(), { weekday: 'long' }).format(date);
  }
  return new Intl.DateTimeFormat(currentLocale(), {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Consecutive runs of the same day, in the order given (the feed is newest first). */
export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(key, now), items: [item] });
  }
  return groups;
}
