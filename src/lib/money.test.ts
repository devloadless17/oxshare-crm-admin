import { describe, expect, it } from 'vitest';
import { formatMoney, isZeroMoney } from './money';

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
