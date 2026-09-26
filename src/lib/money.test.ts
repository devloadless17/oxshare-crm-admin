import { describe, expect, it } from 'vitest';
import { compareMoney, floorToScale, formatDecimal, formatMoney, isZeroMoney } from './money';

describe('formatMoney', () => {
  it('formats USD with a leading symbol and USDT as a trailing code', () => {
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatMoney('1234.5', 'USDT')).toBe('1,234.50 USDT');
  });

  it('renders the backend fixed-scale string shape', () => {
    // What `money()` actually returns from the API: 8dp, zero-padded.
    expect(formatMoney('0.00000000', 'USD')).toBe('$0.00');
    expect(formatMoney('250.00000000', 'USD')).toBe('$250.00');
  });

  it('groups thousands at every boundary', () => {
    expect(formatMoney('1000', 'USD')).toBe('$1,000.00');
    expect(formatMoney('1234567.89012345', 'USD')).toBe('$1,234,567.89');
    expect(formatMoney('999.999', 'USD')).toBe('$1,000.00');
  });

  it('keeps precision that Number() would have destroyed', () => {
    // Number('12345678901234567.89') === 12345678901234568 — wrong before
    // formatting even begins. This is the whole reason the helper exists.
    expect(formatMoney('12345678901234567.89', 'USD')).toBe('$12,345,678,901,234,567.89');
    expect(formatMoney('0.30000001', 'USD')).toBe('$0.30');
  });

  it('rounds half-up for display only', () => {
    expect(formatMoney('0.005', 'USD')).toBe('$0.01');
    expect(formatMoney('0.004', 'USD')).toBe('$0.00');
  });

  it('signs negatives outside the currency symbol', () => {
    expect(formatMoney('-42.5', 'USD')).toBe('-$42.50');
    expect(formatMoney('-42.5', 'USDT')).toBe('-42.50 USDT');
  });

  it('falls back rather than rendering NaN on an unusable value', () => {
    expect(formatMoney('', 'USD')).toBe('—');
    expect(formatMoney('not-a-number', 'USD')).toBe('—');
    expect(formatMoney('Infinity', 'USD')).toBe('—');
    expect(formatMoney('', 'USD', 'unavailable')).toBe('unavailable');
  });
});

describe('isZeroMoney', () => {
  it('recognises zero across every string shape the API might send', () => {
    expect(isZeroMoney('0.00000000')).toBe(true);
    expect(isZeroMoney('0')).toBe(true);
    expect(isZeroMoney('0.0')).toBe(true);
    expect(isZeroMoney('-0')).toBe(true);
  });

  it('does not treat a small non-zero balance as zero', () => {
    // The bug a `=== '0.00000000'` comparison would have: one satoshi-scale
    // unit of on-hold money silently reported as nothing held.
    expect(isZeroMoney('0.00000001')).toBe(false);
    expect(isZeroMoney('250.00000000')).toBe(false);
  });

  it('treats an unparseable value as non-zero rather than claiming it is empty', () => {
    expect(isZeroMoney('nonsense')).toBe(false);
  });
});

/**
 * `formatDecimal` — the numbers that are NOT money.
 *
 * Prices, lots and rates were rendered raw, so a trading row showed
 * `157.4200000000` and a P/L column showed `0.00000000`. That is
 * `NUMERIC(28,10)` doing its job; it is not a number to put in front of a
 * person. The same precision rule applies — decimal.js, never `Number()` —
 * which is why these live beside the money cases rather than in their own file.
 */
describe('formatDecimal — prices, lots and rates', () => {
  it('drops the trailing zeros that are scale rather than information', () => {
    expect(formatDecimal('157.4200000000')).toBe('157.42');
    expect(formatDecimal('0.00000000')).toBe('0');
    expect(formatDecimal('70.0000')).toBe('70');
    expect(formatDecimal('0.2000')).toBe('0.2');
  });

  it('groups thousands', () => {
    expect(formatDecimal('12345.5')).toBe('12,345.5');
    expect(formatDecimal('1234567.89')).toBe('1,234,567.89');
    expect(formatDecimal('1000')).toBe('1,000');
  });

  it('keeps EVERY significant decimal, unlike formatMoney', () => {
    /*
     * A price is not money. A JPY pair quotes to three places and most others
     * to five, so a fixed 2dp would round 1.08337 to 1.08 and hide the digits
     * somebody is reading the row for.
     */
    expect(formatDecimal('1.08337')).toBe('1.08337');
    expect(formatMoney('1.08337', 'USD')).toBe('$1.08');
  });

  it('carries the sign', () => {
    expect(formatDecimal('-7.2500')).toBe('-7.25');
    expect(formatDecimal('-1234.5')).toBe('-1,234.5');
  });

  it('never renders exponent notation', () => {
    // `toString()` on a small enough Decimal gives '1e-8', which is not a
    // figure anybody reading a trading row wants to decode.
    expect(formatDecimal('0.00000001')).toBe('0.00000001');
    expect(formatDecimal('0.00000001')).not.toContain('e');
  });

  it('survives a value larger than a double holds exactly', () => {
    expect(formatDecimal('12345678901234567.89')).toBe('12,345,678,901,234,567.89');
  });

  it('falls back rather than rendering NaN', () => {
    expect(formatDecimal('not-a-number')).toBe('—');
    expect(formatDecimal('abc', 'n/a')).toBe('n/a');
  });
});

describe('compareMoney — what replaced Number() on the P/L column', () => {
  it('orders by value, not as text', () => {
    // '9' sorts above '100' when compared as strings.
    expect(compareMoney('100.00000000', '9.00000000')).toBeGreaterThan(0);
    expect(compareMoney('-1', '1')).toBeLessThan(0);
    expect(compareMoney('1.10', '1.1')).toBe(0);
  });

  it('holds above 2^53, where a float stops being exact', () => {
    expect(compareMoney('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
  });
});

describe('floorToScale — what a "use max" button may offer', () => {
  it('floors, never rounds up', () => {
    // Rounding up would offer money the client does not have, trading a
    // precision refusal for an insufficient-balance one.
    expect(floorToScale('50.129', 2)).toBe('50.12');
    expect(floorToScale('50.999', 2)).toBe('50.99');
    expect(floorToScale('0.009', 2)).toBe('0.00');
  });

  it('pads to the scale, so the value reads as money', () => {
    expect(floorToScale('50', 2)).toBe('50.00');
    expect(floorToScale('50.1', 2)).toBe('50.10');
  });

  it('handles the shape a wallet actually returns', () => {
    // NUMERIC(28,8) comes back with all eight places; the trailing zeros carry
    // no precision and must not change the answer.
    expect(floorToScale('5248.25000000', 2)).toBe('5248.25');
    // Sub-cent value a commission accrual can legitimately leave behind.
    expect(floorToScale('100.12345678', 2)).toBe('100.12');
  });

  it('honours a scale other than 2, because the operator sets it', () => {
    expect(floorToScale('1.23456789', 4)).toBe('1.2345');
    expect(floorToScale('1.23456789', 0)).toBe('1');
  });

  it('keeps precision that a float would destroy', () => {
    expect(floorToScale('12345678901234567.891', 2)).toBe('12345678901234567.89');
  });

  it('returns the input unchanged when it cannot be read', () => {
    // This feeds a convenience button. Silently producing '0.00' would offer a
    // withdrawal of nothing; handing the value back lets the server judge it.
    expect(floorToScale('abc', 2)).toBe('abc');
    expect(floorToScale('', 2)).toBe('');
  });
});
