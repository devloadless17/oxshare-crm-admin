import { describe, expect, it } from 'vitest';
import { customBounds, presetBounds, resolveRange } from './date-presets';

/**
 * The period boundaries decide which money rows a reader sees. An off-by-one
 * here hides a deposit without a trace, so every preset is pinned on a fixed
 * clock, including month and year edges.
 */
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = local(2026, 3, 1, 9, 30); // 1 March, morning — a month edge after a short February

describe('presetBounds — [start, end), the viewer’s local days', () => {
  it.each([
    ['today', local(2026, 3, 1), local(2026, 3, 2)],
    ['yesterday', local(2026, 2, 28), local(2026, 3, 1)],
    ['7d', local(2026, 2, 23), local(2026, 3, 2)],
    ['30d', local(2026, 1, 31), local(2026, 3, 2)],
    ['thisMonth', local(2026, 3, 1), local(2026, 3, 2)],
    ['lastMonth', local(2026, 2, 1), local(2026, 3, 1)],
    ['3m', local(2025, 12, 1), local(2026, 3, 2)],
    ['thisYear', local(2026, 1, 1), local(2026, 3, 2)],
    ['12m', local(2025, 3, 1), local(2026, 3, 2)],
  ] as const)('%s', (preset, start, end) => {
    expect(presetBounds(preset, NOW)).toEqual([start, end]);
  });

  it('all time has no bounds, so nothing is sent', () => {
    expect(presetBounds('all', NOW)).toBeUndefined();
    expect(resolveRange('all', undefined, NOW)).toEqual({});
  });

  it('last month across a year boundary', () => {
    expect(presetBounds('lastMonth', local(2026, 1, 15))).toEqual([
      local(2025, 12, 1),
      local(2026, 1, 1),
    ]);
  });
});

describe('customBounds — both ends inclusive as typed', () => {
  it('a date-only end covers that whole day', () => {
    expect(customBounds('2026-10-01', '2026-10-06')).toEqual({
      start: local(2026, 10, 1),
      end: local(2026, 10, 7),
    });
  });

  it('a timed end covers that whole minute', () => {
    expect(customBounds('2026-10-06T08:00', '2026-10-06T17:30')).toEqual({
      start: local(2026, 10, 6, 8, 0),
      end: local(2026, 10, 6, 17, 31),
    });
  });

  it('sends instants WITH their offset, so the server never guesses the zone', () => {
    const { from, to } = resolveRange('today', undefined, NOW);
    expect(from).toMatch(/^2026-03-01T00:00:00([+-]\d{2}:\d{2}|Z)$/);
    expect(to).toMatch(/^2026-03-02T00:00:00([+-]\d{2}:\d{2}|Z)$/);
  });

  it('a malformed bound is no bound, never an Invalid Date sent to the API', () => {
    expect(resolveRange('custom', { from: 'garbage', to: '' }, NOW)).toEqual({});
  });
});
