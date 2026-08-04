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
 * TWIN FILE — an identical copy lives at the same path in oxshare-crm-client,
 * and `check:twins` compares them. Behaviour changes belong in both.
 *
 * Why it exists here too: the admin app renders money on the withdrawals queue,
 * the ledger view and the commission-plan screens, and it had no helper at all —
 * so the easy thing to reach for was `Number(a) + Number(b)`, which is wrong past
 * the eighth decimal place and silent about it. The lint bans below it stop the
 * coercion; this file is what makes the correct alternative available.
 */

/** Display scale. The stored scale is 8; we round for humans, never for maths. */
const DISPLAY_SCALE = 2;

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
export function isZeroMoney(value: string): boolean {
  try {
    return new Decimal(value).isZero();
  } catch {
    return false;
  }
}
