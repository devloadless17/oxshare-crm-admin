import { describe, expect, it } from 'vitest';
import { waitingLabel } from './waiting';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;

describe('waitingLabel', () => {
  it('says under an hour, rather than "0d", for a submission just made', () => {
    expect(waitingLabel(ago(5 * 60_000), NOW)).toBe('waiting <1h');
  });

  it('counts hours below a day — this morning is not the same as a minute ago', () => {
    expect(waitingLabel(ago(HOUR), NOW)).toBe('waiting 1h');
    expect(waitingLabel(ago(23 * HOUR + 59 * 60_000), NOW)).toBe('waiting 23h');
  });

  it('counts whole days from a day on', () => {
    expect(waitingLabel(ago(24 * HOUR), NOW)).toBe('waiting 1d');
    expect(waitingLabel(ago(3 * 24 * HOUR + 5 * HOUR), NOW)).toBe('waiting 3d');
  });

  it('never reads negative for a clock slightly ahead of this one', () => {
    expect(waitingLabel(new Date(NOW + 60_000).toISOString(), NOW)).toBe('waiting <1h');
  });
});
