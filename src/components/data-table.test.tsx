import { describe, expect, it } from 'vitest';
import { compareValues } from './data-table';

/**
 * The table sorted money as text, and that is a money bug.
 *
 * The comparator was `if (valA < valB)` on `unknown`. For strings that is a
 * LEXICOGRAPHIC comparison, and amounts arrive from the API as fixed-8dp decimal
 * strings (ARCHITECTURE §6.1 — money crosses every boundary as a string). So on
 * the withdrawals queue, sorting by amount descending put `9.00000000` above
 * `100.00000000`: an admin triaging payouts by size was shown the wrong order,
 * with nothing in the UI to suggest it.
 *
 * PLATFORM-CONVENTIONS R-2.5 flagged this table for sorting within a page. It
 * did not catch that the ordering was also wrong WITHIN that page, which is the
 * more serious half — a page-scoped sort is at least correct about what it
 * holds.
 *
 * These are unit tests on the comparator rather than screen tests, because the
 * defect is entirely in the comparison and this is where a regression would
 * reappear.
 */

describe('compareValues — money is compared as a decimal, never as text', () => {
  it('orders amounts by value, not by leading character', () => {
    // THE regression. Lexicographically '1' < '9', so the old comparator put
    // 100 before 9 ascending — and above it descending, on the payout queue.
    expect(compareValues('100.00000000', '9.00000000', 'money')).toBeGreaterThan(0);
    expect(compareValues('9.00000000', '100.00000000', 'money')).toBeLessThan(0);
  });

  it('handles the full 8-decimal scale the API sends', () => {
    expect(compareValues('0.00000002', '0.00000001', 'money')).toBeGreaterThan(0);
    expect(compareValues('0.00000001', '0.00000001', 'money')).toBe(0);
  });

  it('stays exact past the precision a float would lose', () => {
    // Number('12345678901234567.89') is already wrong before any comparison —
    // which is why this path uses decimal.js and why Number() is lint-banned on
    // the money screens.
    expect(compareValues('12345678901234567.89', '12345678901234567.88', 'money')).toBeGreaterThan(
      0,
    );
  });

  it('orders negatives correctly', () => {
    // Ledger entries are signed: debits are negative.
    expect(compareValues('-50.00000000', '10.00000000', 'money')).toBeLessThan(0);
    expect(compareValues('-100.00000000', '-9.00000000', 'money')).toBeLessThan(0);
  });

  it('falls back to text rather than throwing on an unparseable amount', () => {
    // A data problem must not take the table down mid-render.
    expect(() => compareValues('not-a-number', '10.00', 'money')).not.toThrow();
  });
});

describe('compareValues — the other column types', () => {
  it('orders dates chronologically, not as strings', () => {
    expect(compareValues('2026-08-04T09:00:00Z', '2026-08-04T10:00:00Z', 'date')).toBeLessThan(0);
  });

  it('orders numbers numerically', () => {
    expect(compareValues(9, 100, 'number')).toBeLessThan(0);
    expect(compareValues('9', '100', 'number')).toBeLessThan(0);
  });

  it('orders text with localeCompare, so case does not split the alphabet', () => {
    // `<` compares code units, so 'Z' < 'a' and every capital sorts before
    // every lower-case letter — which looks like a broken sort to a user.
    expect(compareValues('apple', 'Banana', 'text')).toBeLessThan(0);
  });
});

describe('compareValues — missing values', () => {
  it('sorts blanks last ascending, whatever the type', () => {
    // An empty cell is not "smaller", it is unknown. Burying it is the useful
    // default on a queue where the populated rows are the actionable ones.
    for (const type of ['text', 'money', 'number', 'date'] as const) {
      expect(compareValues(null, '1', type)).toBeGreaterThan(0);
      expect(compareValues(undefined, '1', type)).toBeGreaterThan(0);
      expect(compareValues('', '1', type)).toBeGreaterThan(0);
      expect(compareValues('1', null, type)).toBeLessThan(0);
    }
  });

  it('treats two blanks as equal', () => {
    expect(compareValues(null, undefined, 'money')).toBe(0);
  });
});
