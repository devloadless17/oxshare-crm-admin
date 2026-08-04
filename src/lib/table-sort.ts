import Decimal from 'decimal.js';

/**
 * Table sort comparators.
 *
 * Moved out of data-table.tsx when that component hit the 400-line ratchet.
 * These are pure functions over values — no React, no DOM — so `lib/` is where
 * they belong under the layering rule (PLATFORM-CONVENTIONS R-2.5.1), and they
 * are the part of the table that most needs to be testable on its own: the
 * money comparator exists because the default one was WRONG.
 */

/**
 * How a column's values are ordered. `text` unless a column says otherwise.
 *
 * `money` exists because the default was WRONG for it, not as a nicety — see
 * `compareValues`.
 */
export type SortType = 'text' | 'money' | 'number' | 'date';

/**
 * Order two cell values.
 *
 * The comparator this replaces was `if (valA < valB)` on `unknown`, which for
 * strings is a LEXICOGRAPHIC comparison. Amounts arrive from the API as
 * fixed-8dp decimal strings (ARCHITECTURE §6.1), so on the withdrawals queue
 * that made `'100.00000000' < '9.00000000'` true: sorting by amount descending
 * put 9.00 above 100.00, on the screen an admin uses to triage payouts, with
 * nothing in the UI suggesting the order was wrong.
 *
 * decimal.js rather than Number(): a monetary string must never be coerced to a
 * float (§6.1), and the lint rules on the money screens ban exactly that. The
 * comparison is on Decimal all the way through.
 */
function asText(value: unknown): string {
  // `String(unknown)` yields '[object Object]' for anything non-primitive, which
  // sorts every such row into one indistinguishable clump. Cell values are
  // primitives in practice; this makes that assumption explicit instead of
  // silently producing a wrong order for the case where it does not hold.
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
    ? String(value)
    : '';
}

export function compareValues(a: unknown, b: unknown, type: SortType): number {
  // Missing values sort last in ascending order, whichever the type — an empty
  // cell is not "smaller", it is unknown, and burying it is the useful default.
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (type === 'money') {
    try {
      const da = new Decimal(asText(a));
      const db = new Decimal(asText(b));
      return da.comparedTo(db);
    } catch {
      // An unparseable amount is a data problem, not a reason to throw inside a
      // render. Fall through to text so the table still draws.
      return asText(a).localeCompare(asText(b));
    }
  }

  if (type === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return asText(a).localeCompare(asText(b));
    return na === nb ? 0 : na < nb ? -1 : 1;
  }

  if (type === 'date') {
    const ta = new Date(asText(a)).getTime();
    const tb = new Date(asText(b)).getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) return asText(a).localeCompare(asText(b));
    return ta === tb ? 0 : ta < tb ? -1 : 1;
  }

  // localeCompare, not `<`: `<` on strings orders by code unit, so 'Z' sorts
  // before 'a' and accented letters land in a group of their own.
  return asText(a).localeCompare(asText(b));
}
