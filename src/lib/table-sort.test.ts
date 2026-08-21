import { describe, expect, it } from 'vitest';
import { compareValues } from './table-sort';

/**
 * The table sort comparators — and the money one exists because the default was
 * WRONG.
 *
 * ## The bug this file is the memory of
 *
 * The comparator used to be `if (valA < valB)` on `unknown`. On strings that is
 * a LEXICOGRAPHIC comparison, and amounts arrive from the API as fixed-8dp
 * decimal strings (§6.1) — so `'100.00000000' < '9.00000000'` was true. Sorting
 * the payout queue by amount descending put 9.00 above 100.00, on the screen
 * used to triage payouts, with nothing on it suggesting the order was wrong.
 *
 * `table-sort.ts` is a TWIN FILE — this spec exists in both the admin console
 * and the client portal, and behaviour changes belong in both.
 */
describe('sorting money', () => {
  /* ⚠️ The original defect, in one assertion. */
  it('orders by value, not alphabetically', () => {
    expect(compareValues('100.00000000', '9.00000000', 'money')).toBeGreaterThan(0);
    // What the old lexicographic comparator answered, kept as the counter-case.
    expect('100.00000000' < '9.00000000').toBe(true);
  });

  it('sorts a mixed-magnitude column into the right order', () => {
    const amounts = ['9.00000000', '100.00000000', '25.50000000', '1000.00000000'];
    const sorted = [...amounts].sort((a, b) => compareValues(a, b, 'money'));

    expect(sorted).toEqual(['9.00000000', '25.50000000', '100.00000000', '1000.00000000']);
  });

  /*
   * Decimal all the way through, never Number(): these are NUMERIC(28,8)
   * values, and two amounts a double would collapse onto one another must stay
   * distinguishable.
   */
  it('separates two amounts a float would collapse into one', () => {
    const a = '12345678901234567.89000000';
    const b = '12345678901234567.90000000';

    expect(Number(a) === Number(b)).toBe(true); // the float's answer: identical
    expect(compareValues(a, b, 'money')).toBeLessThan(0); // decimal's: distinct
  });

  it('treats equal amounts written differently as equal', () => {
    expect(compareValues('10', '10.00000000', 'money')).toBe(0);
  });

  it('orders negatives below zero', () => {
    expect(compareValues('-0.00000001', '0', 'money')).toBeLessThan(0);
  });

  /*
   * An unparseable amount is a data problem, not a reason to throw inside a
   * render — the table still has to draw.
   */
  it('falls back to text instead of throwing on an unparseable amount', () => {
    expect(() => compareValues('not-a-number', '10.00', 'money')).not.toThrow();
  });
});

describe('missing values', () => {
  /*
   * An empty cell is not "smaller", it is UNKNOWN. Burying it is the useful
   * default, and it must behave the same whatever the column type — otherwise
   * one column's blanks lead and another's trail, on the same screen.
   */
  it('sorts a missing value last in ascending order, whatever the type', () => {
    for (const type of ['text', 'money', 'number', 'date'] as const) {
      expect(compareValues(null, 'anything', type)).toBeGreaterThan(0);
      expect(compareValues(undefined, 'anything', type)).toBeGreaterThan(0);
      expect(compareValues('', 'anything', type)).toBeGreaterThan(0);
      expect(compareValues('anything', null, type)).toBeLessThan(0);
    }
  });

  it('treats two missing values as equal', () => {
    expect(compareValues(null, undefined, 'money')).toBe(0);
    expect(compareValues('', null, 'text')).toBe(0);
  });

  /* Zero is a VALUE, not a blank — it must not be buried with the empties. */
  it('does not treat a zero amount as missing', () => {
    expect(compareValues('0.00000000', '5.00000000', 'money')).toBeLessThan(0);
  });
});

describe('sorting text', () => {
  /*
   * localeCompare, not `<`. Raw `<` orders by code unit, so 'Z' sorts before
   * 'a' and a client list reads as though it were shuffled.
   */
  it('does not put every capital letter ahead of every lowercase one', () => {
    expect(compareValues('apple', 'Zebra', 'text')).toBeLessThan(0);
    expect('Zebra' < 'apple').toBe(true); // what `<` would have answered
  });

  /*
   * `String(unknown)` yields '[object Object]' for anything non-primitive,
   * which sorts every such row into one indistinguishable clump. Cell values
   * are primitives in practice; this makes the assumption explicit.
   */
  it('does not clump objects under one stringified label', () => {
    expect(compareValues({ a: 1 }, { b: 2 }, 'text')).toBe(0);
  });

  it('orders booleans and numbers as their text', () => {
    expect(compareValues(true, false, 'text')).toBeGreaterThan(0);
  });
});

describe('sorting numbers and dates', () => {
  it('orders numbers numerically', () => {
    expect(compareValues(9, 100, 'number')).toBeLessThan(0);
    expect(compareValues(100, 100, 'number')).toBe(0);
  });

  it('falls back to text when a number cannot be read', () => {
    expect(() => compareValues('abc', 5, 'number')).not.toThrow();
  });

  it('orders dates chronologically, not as strings', () => {
    expect(
      compareValues('2026-01-02T00:00:00.000Z', '2026-01-10T00:00:00.000Z', 'date'),
    ).toBeLessThan(0);
  });

  it('falls back to text on an unreadable date rather than throwing', () => {
    expect(() => compareValues('not-a-date', '2026-01-01', 'date')).not.toThrow();
  });
});
