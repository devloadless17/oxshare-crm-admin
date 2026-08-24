'use client';

import { Activity, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { StatTile } from '@/components/dashboard/stat-tile';
import { formatCount } from '@/components/dashboard/format';
import type { TransactionsSummary } from '@/lib/api/admin';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The Financial page's headline tiles: deposits, withdrawals, and the whole
 * filtered set, each with the SERVER's money total as the hint.
 *
 * The honest-tiles rule, stated once: every figure here is either a count the
 * API computed (`directionCounts`) or a decimal string the API summed
 * (`summary.directions`). Nothing in this component adds amounts — a
 * multi-currency filter produces one formatted total PER CURRENCY, joined
 * into the hint, because a sum across currencies is not a number.
 */

function directionHint(summary: TransactionsSummary | undefined, direction: string): string {
  const totals = (summary?.directions ?? []).filter((row) => row.direction === direction);
  if (totals.length === 0) return t('financial.tileHintNone');
  return totals.map((row) => formatMoney(row.total, row.currency)).join(' · ');
}

export function TransactionSummary({
  directionCounts,
  summary,
  loading,
}: {
  /** From the list response — per-direction sizes over the filtered set. */
  directionCounts: Record<string, number>;
  /** From GET /admin/transactions/summary — may lag the list by a beat. */
  summary: TransactionsSummary | undefined;
  loading: boolean;
}) {
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
      <StatTile
        label={t('financial.tileDeposits')}
        value={formatCount(directionCounts['deposit'] ?? 0)}
        hint={directionHint(summary, 'deposit')}
        icon={ArrowDownToLine}
        loading={loading}
      />
      <StatTile
        label={t('financial.tileWithdrawals')}
        value={formatCount(directionCounts['withdrawal'] ?? 0)}
        hint={directionHint(summary, 'withdrawal')}
        icon={ArrowUpFromLine}
        loading={loading}
      />
      <StatTile
        label={t('financial.tileMovements')}
        value={formatCount(directionCounts['all'] ?? 0)}
        hint={t('financial.tileMovementsHint')}
        icon={Activity}
        loading={loading}
      />
    </div>
  );
}
