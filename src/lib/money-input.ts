import { isZeroMoney } from '@/lib/money';

/**
 * The readiness gate shared by the console's money-entry dialogs (fund an MT5
 * account, credit a wallet), so both refuse the same input before a round trip.
 *
 * The same shape the API's validator enforces: a positive decimal STRING with
 * up to twenty integer digits and eight places. Never parsed to a JS number
 * (§6.1) — zero is judged by decimal.js.
 */
const MONEY_INPUT = /^\d{1,20}(\.\d{1,8})?$/;

export function isPositiveMoneyInput(value: string): boolean {
  const trimmed = value.trim();
  return MONEY_INPUT.test(trimmed) && !isZeroMoney(trimmed);
}

/** The reason length both money dialogs (and the API) require. */
export const MONEY_REASON_MIN = 3;

export function isMoneyReasonReady(reason: string): boolean {
  return reason.trim().length >= MONEY_REASON_MIN;
}
