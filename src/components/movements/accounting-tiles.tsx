'use client';

import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Scale } from 'lucide-react';
import { StatTile } from '@/components/dashboard/stat-tile';
import { formatCount } from '@/components/dashboard/format';
import type { TransactionsSummary } from '@/lib/api/admin';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { effectLabel } from './movement-vocabulary';

/** Money still moving, each amount named by its effect: "Money in $10.00 · Money out $5.00". */
function movingHint(rows: { effect: string; total: string; currency: string }[]): string {
  return rows.length
    ? rows
        .map((row) => `${effectLabel(row.effect)} ${formatMoney(row.total, row.currency)}`)
        .join(' · ')
    : t('movement.tile.inProgressHint');
}

/**
 * ACCOUNTING TILES (16 Oct 2026) — what money came IN, went OUT and moved INSIDE the platform over
 * the filtered set, per currency, SETTLED only; what is still moving, apart; and the net.
 *
 * The tiles they replace counted by the wallet's side across every kind and every state, so a
 * wallet → MT5 transfer read as a withdrawal and a rejected deposit's amount sat in "Deposits".
 * Every figure here is the SERVER's (`summary.effects`, `summary.net`, `summary.accounting`):
 * this component formats strings and never adds one — a sum across currencies is not a number,
 * and decimal arithmetic belongs to the server.
 */
export function AccountingTiles({
  summary,
  loading,
}: {
  summary: TransactionsSummary | undefined;
  loading: boolean;
}) {
  const effect = (name: string, bucket: string) =>
    (summary?.effects ?? []).filter((row) => row.effect === name && row.bucket === bucket);
  const money = (rows: { total: string; currency: string }[]) =>
    rows.length ? rows.map((row) => formatMoney(row.total, row.currency)).join(' · ') : '—';
  const count = (rows: { count: number }[]) =>
    formatCount(rows.reduce((n, row) => n + row.count, 0));
  const deskPart = (type: string) => {
    const desk = (summary?.accounting ?? []).filter(
      (line) => line.type === type && line.bucket === 'settled',
    );
    return desk.length ? t('movement.tile.deskPart', { amount: money(desk) }) : undefined;
  };
  const inProgress = (summary?.effects ?? []).filter((row) => row.bucket === 'inProgress');

  const settledIn = effect('in', 'settled');
  const settledOut = effect('out', 'settled');
  const settledInternal = effect('internal', 'settled');

  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
      <StatTile
        label={t('movement.tile.in')}
        value={money(settledIn)}
        hint={[t('movement.tile.inHint'), deskPart('desk_credit')].filter(Boolean).join(' · ')}
        icon={ArrowDownToLine}
        loading={loading}
      />
      <StatTile
        label={t('movement.tile.out')}
        value={money(settledOut)}
        hint={[t('movement.tile.outHint'), deskPart('desk_debit')].filter(Boolean).join(' · ')}
        icon={ArrowUpFromLine}
        loading={loading}
      />
      <StatTile
        label={t('movement.tile.internal')}
        value={money(settledInternal)}
        hint={t('movement.tile.internalHint')}
        icon={ArrowLeftRight}
        loading={loading}
      />
      <StatTile
        label={t('movement.tile.inProgress')}
        value={count(inProgress)}
        hint={movingHint(inProgress)}
        icon={Activity}
        loading={loading}
      />
      <StatTile
        label={t('movement.tile.net')}
        value={money(summary?.net ?? [])}
        hint={t('movement.tile.netHint')}
        icon={Scale}
        loading={loading}
      />
    </div>
  );
}

/** The Transfers page's tiles: each internal type, settled, per currency — and what is moving. */
export function TransferTiles({
  summary,
  loading,
}: {
  summary: TransactionsSummary | undefined;
  loading: boolean;
}) {
  const lines = (type: string, bucket: string) =>
    (summary?.accounting ?? []).filter((line) => line.type === type && line.bucket === bucket);
  const money = (rows: { total: string; currency: string }[]) =>
    rows.length ? rows.map((row) => formatMoney(row.total, row.currency)).join(' · ') : '—';
  const inProgress = (summary?.effects ?? []).filter((row) => row.bucket === 'inProgress');
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
      <StatTile
        label={t('transfers.tile.toAccounts')}
        value={money(lines('transfer_to_account', 'settled'))}
        hint={t('transfers.tile.settledHint')}
        icon={ArrowUpFromLine}
        loading={loading}
      />
      <StatTile
        label={t('transfers.tile.toWallets')}
        value={money(lines('transfer_to_wallet', 'settled'))}
        hint={t('transfers.tile.settledHint')}
        icon={ArrowDownToLine}
        loading={loading}
      />
      <StatTile
        label={t('transfers.tile.commission')}
        value={money(lines('commission_to_wallet', 'settled'))}
        hint={t('transfers.tile.settledHint')}
        icon={ArrowLeftRight}
        loading={loading}
      />
      <StatTile
        label={t('movement.tile.inProgress')}
        value={formatCount(inProgress.reduce((n, row) => n + row.count, 0))}
        hint={movingHint(inProgress)}
        icon={Activity}
        loading={loading}
      />
    </div>
  );
}
