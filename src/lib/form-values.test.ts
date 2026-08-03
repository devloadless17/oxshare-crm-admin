import { describe, expect, it } from 'vitest';
import { firstError, parseIntegerField, parseMoneyField } from './form-values';

describe('parseIntegerField', () => {
  it('accepts a plain whole number', () => {
    expect(parseIntegerField('3', 'Position')).toEqual({ ok: true, value: 3 });
    expect(parseIntegerField('  12  ', 'Position')).toEqual({ ok: true, value: 12 });
  });

  it('rejects the input that used to become a silent default', () => {
    // `Number('abc') || 1` was 1: a typo saved a commission plan at position 1.
    expect(parseIntegerField('abc', 'Position').ok).toBe(false);
    expect(parseIntegerField('', 'Position').ok).toBe(false);
    expect(parseIntegerField('12px', 'Position').ok).toBe(false);
  });

  it('rejects forms Number() would have silently accepted', () => {
    // Number('1e3') is 1000 and Number('0x10') is 16 — never what a user meant.
    expect(parseIntegerField('1e3', 'Position').ok).toBe(false);
    expect(parseIntegerField('0x10', 'Position').ok).toBe(false);
    expect(parseIntegerField('1.5', 'Position').ok).toBe(false);
  });

  it('enforces bounds', () => {
    expect(parseIntegerField('-1', 'Window', { min: 0 }).ok).toBe(false);
    expect(parseIntegerField('0', 'Window', { min: 0 })).toEqual({ ok: true, value: 0 });
  });

  it('rejects an unsafe integer rather than losing precision', () => {
    expect(parseIntegerField('9007199254740993', 'Position').ok).toBe(false);
  });
});

describe('parseMoneyField', () => {
  it('returns the value as the string it was typed as', () => {
    expect(parseMoneyField('12.50', 'Commission')).toEqual({ ok: true, value: '12.50' });
    expect(parseMoneyField('0', 'Commission')).toEqual({ ok: true, value: '0' });
  });

  it('never converts to a number, so long values survive intact', () => {
    const long = '12345678901234567.89012345';
    expect(parseMoneyField(long, 'Commission')).toEqual({ ok: true, value: long });
  });

  it('rejects non-numeric and negative input', () => {
    expect(parseMoneyField('abc', 'Commission').ok).toBe(false);
    expect(parseMoneyField('', 'Commission').ok).toBe(false);
    expect(parseMoneyField('-5', 'Commission').ok).toBe(false);
    expect(parseMoneyField('-5', 'Adjustment', { allowNegative: true })).toEqual({
      ok: true,
      value: '-5',
    });
  });

  it('rejects more precision than NUMERIC(28,8) can store', () => {
    expect(parseMoneyField('1.123456789', 'Commission').ok).toBe(false);
    expect(parseMoneyField('1.12345678', 'Commission').ok).toBe(true);
  });
});

describe('firstError', () => {
  it('returns null when everything parsed', () => {
    expect(firstError(parseIntegerField('1', 'A'), parseMoneyField('2', 'B'))).toBeNull();
  });

  it('returns the first failure in order', () => {
    expect(firstError(parseIntegerField('x', 'A'), parseMoneyField('y', 'B'))).toBe(
      'A must be a whole number.',
    );
  });
});
