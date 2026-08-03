/**
 * Parsing form text into values that are safe to send.
 *
 * The bug this replaces: `position: Number(state.position) || 1` on the
 * commission-plan form. `Number('abc')` is NaN, `NaN || 1` is 1 — so a typo in
 * the ordering field silently became a valid value and the plan saved with
 * settings the admin never chose. `Number(x) || 0` on a settlement window is the
 * same shape, and both sit on the form that configures how partners get paid.
 *
 * These return a discriminated result rather than throwing or coercing, so the
 * caller must decide what to show the user.
 */

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A whole number, for things like ordering and hour windows.
 *
 * Rejects empty input, non-numeric text, decimals and (optionally) negatives,
 * instead of folding all of them into a fallback.
 */
export function parseIntegerField(
  raw: string,
  field: string,
  options?: { min?: number; max?: number },
): FieldResult<number> {
  const text = raw.trim();
  if (text === '') return { ok: false, error: `${field} is required.` };

  // Deliberately strict: Number(' 12 ') is 12 and Number('12px') is NaN, but
  // Number('1e3') is 1000 and Number('0x10') is 16 — none of which a user means
  // to type into an ordering field.
  if (!/^-?\d+$/.test(text)) {
    return { ok: false, error: `${field} must be a whole number.` };
  }

  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: `${field} is too large.` };
  }
  const min = options?.min;
  const max = options?.max;
  if (min !== undefined && value < min) {
    return { ok: false, error: `${field} must be at least ${min}.` };
  }
  if (max !== undefined && value > max) {
    return { ok: false, error: `${field} must be at most ${max}.` };
  }
  return { ok: true, value };
}

/**
 * A monetary or percentage value, returned as the **string** it was typed as.
 *
 * Money crosses the API as a decimal string (ARCHITECTURE §6.1) and the backend
 * validates it with `@IsNumberString`, so this validates the shape without ever
 * converting to a number — converting is the thing §6.1 exists to prevent.
 */
export function parseMoneyField(
  raw: string,
  field: string,
  options?: { allowNegative?: boolean },
): FieldResult<string> {
  const text = raw.trim();
  if (text === '') return { ok: false, error: `${field} is required.` };

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: `${field} must be a number, e.g. 12.50.` };
  }
  if (!options?.allowNegative && text.startsWith('-')) {
    return { ok: false, error: `${field} cannot be negative.` };
  }
  // Stored scale is NUMERIC(28,8); more precision than that would be silently
  // rounded server-side, so say so instead.
  const [, fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > 8) {
    return { ok: false, error: `${field} supports at most 8 decimal places.` };
  }
  return { ok: true, value: text };
}

/** Collects field results, returning the first error or all unwrapped values. */
export function firstError(...results: FieldResult<unknown>[]): string | null {
  for (const r of results) {
    if (!r.ok) return r.error;
  }
  return null;
}
