import Decimal from 'decimal.js';

/**
 * Money formatting for display. Strings in, strings out — never a JS number.
 *
 * ARCHITECTURE §6.1: monetary values are NUMERIC(28,8) in Postgres, decimal.js
 * in code, and serialized as strings across every API boundary. The backend
 * holds up its end (`money()` in wallet/money.ts returns a fixed-scale string),
 * so the only way to lose precision on this side is to convert.
 *
 * That is exactly what `Number(balance).toFixed(2)` and
 * `balance.toLocaleString()` do, and it is why neither appears here:
 * `Number('12345678901234567.89')` is already wrong before formatting starts.
 * `Intl.NumberFormat` is also out — it takes a number.
 *
 * TWIN FILE — byte-identical in oxshare-crm-admin and oxshare-crm-client, and
 * `check:twins` compares them. Behaviour changes belong in both. (The console
 * renders money on the withdrawals queue, the ledger and the commission screens;
 * `floorToScale` came from the portal's "use max" buttons and is here for both.)
 */

/**
 * Display scale. The stored scale is 8; we round for humans, never for maths.
 *
 * Exported as the FALLBACK for `floorToScale` when the currency catalogue has
 * not loaded — every currency this platform holds declares 2, so falling back
 * to it offers the right figure in practice and, when it is ever wrong, offers
 * slightly LESS rather than an amount the server would refuse.
 */
export const DISPLAY_SCALE = 2;

const SYMBOLS: Record<string, string> = { USD: '$' };

/**
 * `'1234.5'` → `'$1,234.50'`, `'1234.5'` + `USDT` → `'1,234.50 USDT'`.
 *
 * Rounds half-up at 2dp for display only. An unparseable value returns the
 * `fallback` rather than `NaN` or a thrown error — a balance card must not take
 * the page down, but it must not invent a number either.
 */
export function formatMoney(value: string, currency: string, fallback = '—'): string {
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    return fallback;
  }
  if (!amount.isFinite()) return fallback;

  const fixed = amount.toFixed(DISPLAY_SCALE, Decimal.ROUND_HALF_UP);
  const negative = fixed.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const magnitude = fraction ? `${grouped}.${fraction}` : grouped;

  const symbol = SYMBOLS[currency];
  const body = symbol ? `${symbol}${magnitude}` : `${magnitude} ${currency}`;
  return negative ? `-${body}` : body;
}

/**
 * True when a monetary string is exactly zero.
 *
 * Exists so callers never reach for `parseFloat(value) !== 0` or
 * `value !== '0.00000000'` — the first coerces money to a float, and the second
 * is a string comparison that breaks the moment the API returns `'0'` or
 * `'0.0'` instead of the current fixed 8dp shape.
 */
/**
 * The largest value at `scale` that is not MORE than `value` — floor, never round.
 *
 * For "use max" buttons. A wallet holds NUMERIC(28,8) and commission and rebates
 * are percentages, so a balance can legitimately carry sub-cent value that no
 * payout rail can send: the API refuses an amount with more decimal places than
 * the currency declares (D-77), so offering the raw balance would produce a
 * server refusal the client cannot explain — the exact failure the "use max"
 * comment on the withdraw screen already warns about, reached a second way.
 *
 * DOWN, always. Rounding up offers money the client does not have and trades one
 * refusal for another.
 *
 * Returns the input unchanged if it will not parse: this feeds a convenience
 * button, and a button that silently produces "0" is worse than one that
 * produces what the server will judge for itself.
 */
export function floorToScale(value: string, scale: number): string {
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) return value;
    return d.toDecimalPlaces(scale, Decimal.ROUND_DOWN).toFixed(scale);
  } catch {
    return value;
  }
}

export function isZeroMoney(value: string): boolean {
  try {
    return new Decimal(value).isZero();
  } catch {
    return false;
  }
}

/**
 * Order two monetary strings: negative when `a < b`, matching `Array.sort`.
 *
 * Exists because sorting money is where the coercion ban is easiest to forget.
 * The two obvious alternatives are both wrong:
 *
 *  - `Number(a) - Number(b)` loses precision before the comparison happens —
 *    `Number('12345678901234567.89')` is already inexact, and it is a lint error
 *    on money paths for that reason.
 *  - `a.localeCompare(b)` compares text, so '9.00000000' sorts ABOVE
 *    '100.00000000'. That is the specific bug admin's `sortType: 'money'` was
 *    added to close, and a client sorting their own transactions by amount would
 *    hit it on the first list containing both single- and triple-digit values.
 *
 * An unparseable value falls back to a text comparison rather than throwing: a
 * bad row is a data problem, and it must not take down a render — the same
 * choice `formatMoney` makes with its fallback.
 */
export function compareMoney(a: string, b: string): number {
  try {
    return new Decimal(a).comparedTo(new Decimal(b));
  } catch {
    return a.localeCompare(b);
  }
}

/**
 * `'157.4200000000'` → `'157.42'`, `'12345.5'` → `'12,345.5'`.
 *
 * A decimal string made readable WITHOUT pretending to be money: no symbol, no
 * currency suffix, and no fixed scale.
 *
 * ## Why this is not `formatMoney`
 *
 * `formatMoney` rounds to two places and appends a currency, which is right for
 * a balance and wrong for everything else on a trading row. A price is not
 * money — a JPY pair quotes to three places and most others to five, so a fixed
 * 2dp would round `1.08337` to `1.08` and hide the digits somebody is reading
 * the row for. Lots are not money either.
 *
 * So: keep every significant digit, drop the trailing zeros that are storage
 * scale rather than information, and group the thousands. `157.4200000000` is
 * `NUMERIC(28,10)` doing its job; it is not a number to put in front of a
 * person.
 *
 * ## Still never coerced
 *
 * decimal.js parses it, exactly as `formatMoney` does — §6.1 applies to every
 * decimal string on these paths, not only the ones denominated in a currency.
 * An unparseable value returns the fallback rather than `NaN`.
 */
export function formatDecimal(value: string, fallback = '—'): string {
  let parsed: Decimal;
  try {
    parsed = new Decimal(value);
  } catch {
    return fallback;
  }
  if (!parsed.isFinite()) return fallback;

  // `toFixed()` with no argument keeps the value exactly, without exponent
  // notation — `toString()` would render 1e-8 for a small enough figure.
  const exact = parsed.toFixed();
  const negative = exact.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? exact.slice(1) : exact).split('.');

  const trimmed = fraction.replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = trimmed ? `${grouped}.${trimmed}` : grouped;

  return negative ? `-${body}` : body;
}
