import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, groupByDay } from './day-groups';

/**
 * The day headings in the notification feed. Every case here has a wrong
 * answer that renders perfectly: a UTC key moves an evening task into
 * tomorrow's group, and a daylight-saving day is 23 hours long.
 */

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe('dayKey', () => {
  it('keys by the LOCAL date, even late in the evening', () => {
    // 23:30 local is still today, whatever the UTC date is by then.
    expect(dayKey(at(2026, 9, 25, 23, 30))).toBe('2026-09-25');
    expect(dayKey(at(2026, 9, 25, 0, 5))).toBe('2026-09-25');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 25, 10, 0); // Fri 25 Sep 2026, local

  it('says Today and Yesterday', () => {
    expect(dayLabel('2026-09-25', now)).toBe('Today');
    expect(dayLabel('2026-09-24', now)).toBe('Yesterday');
  });

  it('names the weekday inside the last week, a date before that', () => {
    expect(dayLabel('2026-09-21', now)).toMatch(/monday/i);
    const older = dayLabel('2026-09-10', now);
    expect(older).toMatch(/10/);
    expect(older).not.toMatch(/2026/); // same year: no year printed
    expect(dayLabel('2025-12-30', now)).toMatch(/2025/);
  });
});

describe('groupByDay', () => {
  it('keeps the feed order and starts a group when the day changes', () => {
    const now = new Date(2026, 8, 25, 10, 0);
    const groups = groupByDay(
      [
        { id: 'a', createdAt: at(2026, 9, 25, 9) },
        { id: 'b', createdAt: at(2026, 9, 25, 8) },
        { id: 'c', createdAt: at(2026, 9, 24, 17) },
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for nothing', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
