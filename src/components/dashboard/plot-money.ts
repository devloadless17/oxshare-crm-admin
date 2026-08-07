import Decimal from 'decimal.js';

/**
 * THE PLOTTING BOUNDARY — the one place a monetary string becomes a number,
 * and the reason it is allowed to.
 *
 * ARCHITECTURE §6.1 says monetary values are NUMERIC(28,8) at rest, decimal.js
 * in code and strings across every API boundary, and that `Number(amount)` /
 * `parseFloat(amount)` are errors because they truncate past 2^53 before any
 * formatting starts. That rule holds everywhere in this app.
 *
 * A chart is the single genuine exception, and it is worth being precise about
 * why rather than treating it as a loophole. An SVG bar is positioned by a
 * float: Recharts scales a value to pixels through IEEE-754 arithmetic, and
 * there is no string-based alternative — a y-axis is a continuous geometric
 * mapping, not a computation over money. So the choice is not "exact or
 * approximate", it is "approximate in a named function, or approximate in
 * fifteen scattered call sites".
 *
 * What makes it safe is the boundary being one-way:
 *
 *  - **Nothing that comes out of here is ever displayed.** The number returned
 *    is a bar height and nothing else. Every value a reader sees — the tooltip,
 *    the axis label, the total under the chart — is rendered from the ORIGINAL
 *    string through `formatMoney`, which uses decimal.js. `plotAmount` and the
 *    displayed value are computed from the same source and never from each
 *    other.
 *  - **Nothing computed from these numbers is ever displayed either.** A total
 *    is summed with `sumAmounts` below, in Decimal, and formatted from that
 *    Decimal's string. Summing the plot values and showing the result is the
 *    mistake this file exists to make unavailable.
 *  - **`Decimal.toNumber()`, not `Number()`.** For a value past 2^53 both lose
 *    precision — that is unavoidable in a float — but `Decimal` parses the full
 *    string first and rounds once, deliberately, at the end. `Number()` on a
 *    long numeric string is the same lossy step performed by accident, and it
 *    is what the lint rule bans. A pixel is roughly 1/300th of the plot area,
 *    so a rounding error at the 15th significant digit cannot move a bar.
 *
 * Keeping the conversion here also keeps it greppable: `plotAmount` is the
 * complete list of places money is turned into a float in this app.
 */

/**
 * A monetary string as a plottable number. For GEOMETRY ONLY — never display
 * the return value, and never format it.
 *
 * An unparseable amount plots as 0 rather than `NaN`: `NaN` silently removes
 * the point from the line, which reads as "no withdrawals that day" — a
 * different and much worse lie than a flat segment.
 */
export function plotAmount(value: string): number {
  try {
    const amount = new Decimal(value);
    return amount.isFinite() ? amount.toNumber() : 0;
  } catch {
    return 0;
  }
}

/**
 * Sum monetary strings and return a STRING, for display.
 *
 * The counterpart to `plotAmount`: totals a chart shows underneath itself go
 * through this, so the headline figure is exact even though the bars above it
 * were positioned with floats.
 */
export function sumAmounts(values: readonly string[]): string {
  let total = new Decimal(0);
  for (const value of values) {
    try {
      const amount = new Decimal(value);
      if (amount.isFinite()) total = total.plus(amount);
    } catch {
      // A malformed amount contributes nothing rather than poisoning the total
      // with NaN. It cannot be silently treated as zero anywhere it matters —
      // this is a chart caption, not a ledger.
      continue;
    }
  }
  return total.toString();
}
