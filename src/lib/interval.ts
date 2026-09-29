/**
 * A duration in SECONDS, edited as a number and a unit ("15 minutes"), for the
 * Scheduled jobs settings. Nobody thinks of how often a job runs as "900".
 */
export type IntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export const UNIT_SECONDS: Record<IntervalUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

/** Seconds → the largest unit that divides them exactly (3600 reads "1 hour"). */
export function splitInterval(seconds: number): { value: number; unit: IntervalUnit } {
  for (const unit of ['days', 'hours', 'minutes'] as const) {
    if (seconds >= UNIT_SECONDS[unit] && seconds % UNIT_SECONDS[unit] === 0) {
      return { value: seconds / UNIT_SECONDS[unit], unit };
    }
  }
  return { value: seconds, unit: 'seconds' };
}

/**
 * The typed whole number and its unit → seconds, or null for anything that is
 * not a whole number — never a guessed value (the rule every numeric control
 * here follows: a typo must not become a plausible number nobody typed).
 */
export function intervalSeconds(value: string, unit: IntervalUnit): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10) * UNIT_SECONDS[unit];
}
