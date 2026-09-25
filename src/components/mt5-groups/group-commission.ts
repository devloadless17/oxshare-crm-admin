import Decimal from 'decimal.js';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

/**
 * MT5's own commission rules on a group, in words an operator can act on.
 *
 * These are what the trading SERVER takes from a client's deals, set by the
 * broker in MT5. They are separate from the CRM's commission types, which pay
 * partners and never touch the client's balance. A fresh $1,000 account that
 * reads $997 after its first trade is this, not the CRM.
 *
 * The bridge sends MetaQuotes' enums as fixed lower-case words (see the
 * bridge's `GroupSummaryReader`), so every word maps to a message here and an
 * unknown one says so rather than guessing.
 */
export interface GroupCommissionTier {
  mode: string;
  type: string;
  value: string;
  currency?: string | null;
  minimal?: string | null;
  maximal?: string | null;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}

export interface GroupCommission {
  name: string;
  description: string;
  symbolPath: string;
  mode: string;
  rangeMode: string;
  chargeMode: string;
  entryMode: string;
  tiers: GroupCommissionTier[];
}

const PER: Record<string, MessageKey> = {
  per_lot: 'mt5Groups.perLot',
  per_deal: 'mt5Groups.perDeal',
};

const ENTRY: Record<string, MessageKey> = {
  in: 'mt5Groups.entryIn',
  out: 'mt5Groups.entryOut',
  all: 'mt5Groups.entryAll',
};

const CHARGE: Record<string, MessageKey> = {
  instant: 'mt5Groups.chargeInstant',
  daily: 'mt5Groups.chargeDaily',
  monthly: 'mt5Groups.chargeMonthly',
};

/** A decimal string with trailing zeros dropped: `'3.50000000'` → `'3.5'`. */
function plain(value: string): string {
  try {
    return new Decimal(value).toString();
  } catch {
    return value;
  }
}

/** One tier's value in its own unit: `$3.00`, `3 points`, `0.002%`. */
export function tierValue(tier: GroupCommissionTier, groupCurrency: string): string {
  switch (tier.mode) {
    case 'deposit_currency':
      return formatMoney(tier.value, groupCurrency);
    case 'specified_currency':
      return formatMoney(tier.value, tier.currency ?? groupCurrency);
    case 'points':
      return t('mt5Groups.unitPoints', { value: plain(tier.value) });
    case 'percent':
      return t('mt5Groups.unitPercent', { value: plain(tier.value) });
    case 'base_currency':
      return t('mt5Groups.unitBase', { value: plain(tier.value) });
    case 'profit_currency':
      return t('mt5Groups.unitProfit', { value: plain(tier.value) });
    case 'margin_currency':
      return t('mt5Groups.unitMargin', { value: plain(tier.value) });
    default:
      return t('mt5Groups.unitUnknown', { value: plain(tier.value) });
  }
}

/** `per lot` / `per deal`, or nothing for a word this screen does not know. */
function per(tier: GroupCommissionTier): string {
  const key = PER[tier.type];
  return key ? ` ${t(key)}` : '';
}

/** One tier in a line: `$3.00 per lot`. */
export function tierLine(tier: GroupCommissionTier, groupCurrency: string): string {
  return `${tierValue(tier, groupCurrency)}${per(tier)}`;
}

/**
 * A tier's minimum and maximum charge, `$1.00 / $50.00`, or null when neither
 * is set. MT5 stores "no bound" as ZERO, so a zero is shown as no bound.
 */
export function tierBounds(tier: GroupCommissionTier, groupCurrency: string): string | null {
  const bound = (value: string | null | undefined) =>
    value && !isZeroMoney(value) ? tierValue({ ...tier, value }, groupCurrency) : null;
  const min = bound(tier.minimal);
  const max = bound(tier.maximal);
  if (min === null && max === null) return null;
  return `${min ?? '—'} / ${max ?? '—'}`;
}

/**
 * One rule in a line: `$3.00 per lot, on opening deals`.
 *
 * A tiered rule gives its first tier and says it is tiered; the expanded row
 * lists every tier. An agent rule says it is paid to an agent, because it does
 * not come out of the client's balance at all.
 */
export function commissionSummary(rule: GroupCommission, groupCurrency: string): string {
  const [first] = rule.tiers;
  if (!first) return t('mt5Groups.noTiers');

  const parts = [tierLine(first, groupCurrency)];
  const entry = ENTRY[rule.entryMode];
  if (entry) parts.push(t(entry));
  if (rule.tiers.length > 1)
    parts.push(t('mt5Groups.tiered', { count: String(rule.tiers.length) }));
  if (rule.mode === 'agent') parts.push(t('mt5Groups.agentPaid'));
  return parts.join(', ');
}

/** When the server takes it, or null for a word this screen does not know. */
export function chargeLabel(rule: GroupCommission): string | null {
  const key = CHARGE[rule.chargeMode];
  return key ? t(key) : null;
}

/** A tier's volume or turnover band, `0 – 10`, or `10 and above` when open-ended. */
export function tierRange(tier: GroupCommissionTier): string | null {
  const from = tier.rangeFrom ? plain(tier.rangeFrom) : null;
  const to = tier.rangeTo ? plain(tier.rangeTo) : null;
  if (from === null && to === null) return null;
  if (to === null) return t('mt5Groups.rangeFrom', { from: from ?? '0' });
  return t('mt5Groups.rangeBetween', { from: from ?? '0', to });
}

/**
 * The margin call and stop-out levels together: `100% / 50%`, or in money when
 * the group measures stop-out in equity.
 */
export function marginLevels(
  marginCall: string | null | undefined,
  stopOut: string | null | undefined,
  mode: string | null | undefined,
  groupCurrency: string,
): string | null {
  if (!marginCall && !stopOut) return null;
  const show = (value: string | null | undefined) => {
    if (!value) return '—';
    return mode === 'money' ? formatMoney(value, groupCurrency) : `${plain(value)}%`;
  };
  return `${show(marginCall)} / ${show(stopOut)}`;
}
