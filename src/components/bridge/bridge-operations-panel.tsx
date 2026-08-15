'use client';

import * as React from 'react';
import { Banknote } from 'lucide-react';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import type { BridgeOperations } from '@/lib/api/admin';
import { formatDecimal } from '@/lib/money';
import { t } from '@/lib/i18n';
import { StatCard, StatusBanner } from '@/app/(console)/bridge/page';

type OperationRow = BridgeOperations['rows'][number];

/**
 * Balance operations the bridge has run against MT5 — and the ones it never got
 * an answer to.
 *
 * ## The unresolved rows are the entire point
 *
 * A row with no `completedAt` is one where the bridge told MT5 to move money and
 * never learned whether it did. That is not "failed" and not "pending": the
 * money MAY have moved. MT5's balance operation is not idempotent, so the bridge
 * claims the key before calling and only releases it on a confirmed outcome —
 * which means an unresolved row stays unresolved until a person checks MT5's own
 * deal history.
 *
 * The copy never rounds that off in either direction. "Failed" would be a guess
 * in the safe direction and invite a retry that double-credits; "pending" would
 * be a guess in the dangerous one and invite waiting for something that will
 * never arrive on its own.
 *
 * ## No retry button, deliberately
 *
 * The one action a screen like this invites is exactly the one that must not be
 * one click away. Resolving an unresolved operation means reading MT5 first.
 *
 * ## Amounts are decimal strings, and deliberately UNLABELLED
 *
 * §6.1 all the way down — the string the bridge stored, never a float, on a
 * screen an operator checks a client's balance against.
 *
 * No currency symbol, because the bridge does not record one: MT5 takes the
 * amount in whatever the account is denominated in. See the amount column.
 */
export function BridgeOperationsPanel({
  data,
  dimmed,
  stuckOnly,
  onStuckOnlyChange,
}: {
  data: BridgeOperations | undefined;
  dimmed: boolean;
  stuckOnly: boolean;
  onStuckOnlyChange: (value: boolean) => void;
}) {
  const columns = React.useMemo(() => buildColumns(), []);

  if (!data) return null;

  const { summary, rows } = data;
  const healthy = summary.stuck === 0;

  return (
    <div className="flex flex-col gap-4">
      {/*
        The banner is shown ONLY when something is unresolved. A permanent green
        "all clear" on a money screen trains the eye to skip the banner, which is
        the one element that must be read on the day it turns red.
      */}
      {!healthy && (
        <StatusBanner
          healthy={false}
          message={t('bridge.operations.stuckWarning', { count: summary.stuck })}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t('bridge.operations.total')} value={summary.total} />
        <StatCard label={t('bridge.operations.completed')} value={summary.completed} tone="good" />
        <StatCard
          label={t('bridge.operations.stuck')}
          value={summary.stuck}
          tone={summary.stuck > 0 ? 'bad' : 'neutral'}
        />
      </div>

      <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={stuckOnly}
          onChange={(event) => onStuckOnlyChange(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-border"
        />
        {t('bridge.operations.stuckOnly')}
      </label>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.idempotencyKey}
        dimmed={dimmed}
        empty={
          <EmptyState
            icon={Banknote}
            message={stuckOnly ? t('bridge.operations.emptyStuck') : t('bridge.operations.empty')}
          />
        }
        clientPagination={{ pageSize: 25, noun: ['operation', 'operations'] }}
      />
    </div>
  );
}

function buildColumns(): Column<OperationRow>[] {
  return [
    {
      header: t('bridge.col.started'),
      sortable: true,
      sortKey: 'startedAt',
      sortType: 'date',
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">{formatTime(row.startedAt)}</span>
      ),
    },
    {
      header: t('bridge.col.login'),
      cell: (row) => <span className="font-mono text-xs tabular-nums">{row.login}</span>,
    },
    {
      header: t('bridge.col.amount'),
      align: 'right',
      sortable: true,
      sortKey: 'amount',
      // decimal.js ordering. Text sorting puts '9.00' above '100.00', which any
      // mixed-magnitude list hits on its first sort.
      sortType: 'money',
      /*
       * ── UNLABELLED, and that is the honest rendering ───────────────────────
       *
       * The bridge's `balance_operations` table has no currency column — it
       * stores the login, the amount and the type, because MT5 takes the amount
       * in whatever the account is denominated in and the bridge never needs to
       * know which. So there is nothing here to label it with.
       *
       * `formatMoney(amount, 'USD')` would print `$1,000.00` for an operation on
       * a EUR account. A currency symbol is a claim, and this is the screen
       * where somebody checks whether a client's money moved — the wrong symbol
       * beside a real figure is the expensive kind of wrong.
       *
       * `formatDecimal` gives the digits at full precision with no symbol, which
       * says exactly what is known. The account's own currency is one click away
       * on /trading-accounts, keyed by the login in the column beside this one.
       *
       * NOT signed or coloured either: this shows what was SENT, and the
       * direction lives in MT5's own sign on the amount rather than in a ledger
       * movement this row does not describe.
       */
      cell: (row) => (
        <span className="font-mono font-semibold tabular-nums">{formatDecimal(row.amount)}</span>
      ),
    },
    {
      header: t('bridge.col.type'),
      /*
       * `balance` and `credit` are NOT the same and the distinction is money:
       * credit is broker funds the client cannot withdraw. Shown raw rather than
       * prettified, so it matches what MT5 and the bridge logs call it.
       */
      cell: (row) => <span className="text-muted-foreground">{row.type}</span>,
    },
    {
      header: t('bridge.col.outcome'),
      sortable: true,
      sortKey: 'completedAt',
      sortType: 'date',
      /*
       * The MT5 ticket is the proof the operation landed, so it is the outcome
       * worth printing — a bare "done" would make an operator go and look it up
       * anyway. An unresolved row says so in the destructive colour: it is the
       * one state on this table that needs somebody.
       */
      cell: (row) =>
        row.completedAt ? (
          <span className="flex flex-col">
            <span className="font-mono text-xs tabular-nums">{row.dealId}</span>
            <span className="text-[11px] text-muted-foreground">{formatTime(row.completedAt)}</span>
          </span>
        ) : (
          <span className="font-semibold text-destructive">{t('bridge.value.unresolved')}</span>
        ),
    },
    {
      header: t('bridge.col.key'),
      /*
       * The CRM's own transfer id, in full and not truncated: it is the only
       * value that joins this row back to the transaction it came from, and a
       * shortened uuid cannot be searched for.
       */
      cell: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">{row.idempotencyKey}</span>
      ),
    },
  ];
}

/** 24-hour local time — see the note in `bridge-outbox-panel`. */
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t('bridge.value.none')
    : date.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
}
