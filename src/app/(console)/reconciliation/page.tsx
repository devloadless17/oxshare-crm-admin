'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Scale } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import api from '@/lib/api';
import type { WalletDiscrepancy } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

/**
 * Does the money add up — the §12.2 reconciliation, on screen.
 *
 * The check itself has run hourly for a while and had NOWHERE to surface. A
 * discrepancy reached a log line carrying `"alert": true` and an admin API
 * endpoint nothing called, so in practice the only way to learn the ledger had
 * drifted was to already suspect it. That is the wrong shape for a control whose
 * entire purpose is telling you about a problem you do not know you have.
 *
 * ## What it compares
 *
 * Every wallet's `balance` column against the sum of that wallet's own ledger
 * entries. The ledger is the truth and the balance is a cached projection of it
 * (§6.2), which is fast and means two numbers must agree forever. This is the
 * check that they do.
 *
 * ## Read-only, deliberately
 *
 * There is no "fix this" button and there should not be. An automatic
 * correction writes a compensating entry for a cause nobody has diagnosed —
 * turning a detectable discrepancy into a permanent one that looks deliberate.
 * A mismatch here is the beginning of an investigation, not something to clear.
 *
 * ## Master admin only
 *
 * `permissions.ts` gates the route, matching the backend. The report names
 * clients and cannot be scoped: a reconciliation reporting "balanced" over a
 * subset is the opposite of what a reconciliation is for.
 */
export default function ReconciliationPage() {
  const query = useResource(['reconciliation'], (signal) => api.admin.getReconciliation(signal));

  const report = query.data;
  const discrepancies = report?.walletDiscrepancies ?? [];

  const columns: Array<Column<WalletDiscrepancy>> = React.useMemo(
    () => [
      {
        key: 'userId',
        header: t('reconciliation.column.client'),
        cell: (row) => <span className="font-mono text-xs">{row.userId}</span>,
      },
      {
        key: 'walletId',
        header: t('reconciliation.column.wallet'),
        cell: (row) => <span className="font-mono text-xs">{row.walletId}</span>,
      },
      {
        key: 'currency',
        header: t('reconciliation.column.currency'),
        cell: (row) => row.currency,
      },
      {
        key: 'balance',
        header: t('reconciliation.column.balance'),
        /*
         * FORMATTED, with the exact string on `title`.
         *
         * These two are the SIDES of the comparison and they are read to see
         * roughly what the wallet holds; the `difference` column below is the
         * finding, and that one stays exact. Hover gives the stored value on
         * either side when the tail matters.
         */
        cell: (row) => (
          <span className="font-mono text-xs tabular-nums" title={row.balance}>
            {formatMoney(row.balance, row.currency)}
          </span>
        ),
      },
      {
        key: 'ledgerSum',
        header: t('reconciliation.column.ledgerSum'),
        cell: (row) => (
          <span className="font-mono text-xs tabular-nums" title={row.ledgerSum}>
            {formatMoney(row.ledgerSum, row.currency)}
          </span>
        ),
      },
      {
        /*
         * ⚠️ THE ONE MONEY FIGURE IN THE CONSOLE THAT IS NOT ROUNDED, and the
         * exception is deliberate.
         *
         * Every other amount an operator reads is formatted to two places,
         * because eight decimal places of trailing zeros is noise. This column
         * is the opposite case: it is the exact figure by which the books are
         * wrong, and rounding it would render a real 0.00000001 drift as `$0.00`
         * — reporting "balanced" for precisely the condition this screen exists
         * to catch.
         *
         * The two columns it is derived from ARE formatted, with the exact value
         * on hover, so the row stays readable while the finding stays true.
         */
        key: 'difference',
        header: t('reconciliation.column.difference'),
        cell: (row) => (
          <span className="font-mono text-xs font-semibold tabular-nums text-destructive">
            {row.difference}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('reconciliation.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('reconciliation.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="focus-outline inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-accent disabled:opacity-60"
        >
          {/*
            The refresh mark while idle, the shared `Spinner` while in flight.

            This was a `RefreshCw` carrying `animate-spin` only sometimes —
            named in ui/loader.tsx as one of the spellings of "please wait" that
            file replaced. It froze mid-rotation for anyone with reduce-motion
            on, because globals.css cuts every animation to 0.001ms and
            `animate-spin` obeys it; `loader-spin`, which the shared Spinner
            uses, re-asserts the rotation past that rule.
          */}
          {query.isFetching ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {query.isFetching ? t('reconciliation.running') : t('reconciliation.runNow')}
        </button>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('reconciliation.loading')}
        endpoints={['GET /admin/reconciliation']}
        onRetry={query.refetch}
        errorMessage={t('reconciliation.loadFailed')}
        error={query.error}
        fill
      >
        <div className="flex h-full flex-col gap-4">
          {/*
           * The verdict, before the table.
           *
           * `report.balanced` is read rather than `discrepancies.length === 0`:
           * it is the field the service decides, and a future check (the unpaid
           * confirmed accruals one, when the commission engine returns) can make
           * it false without adding a single wallet row. Testing the array would
           * quietly show "all balanced" for that case.
           */}
          {report?.balanced ? (
            <div
              className="shrink-0 rounded-lg border border-success/30 bg-success/10 p-4"
              role="status"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-success">
                    {t('reconciliation.ok.title')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('reconciliation.ok.body', { count: report.walletsChecked })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            report && (
              <div
                className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      {t('reconciliation.mismatch.title')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('reconciliation.mismatch.body')}
                    </p>
                  </div>
                </div>
              </div>
            )
          )}

          <p className="shrink-0 text-xs text-muted-foreground">
            {t('reconciliation.checkedAt', {
              count: report?.walletsChecked ?? 0,
              at: report ? new Date(report.checkedAt).toLocaleString() : '—',
            })}
          </p>

          <DataTable
            fill
            caption={t('reconciliation.caption')}
            columns={columns}
            rows={discrepancies}
            rowKey={(row) => row.walletId}
            dimmed={query.isFetching}
            empty={<EmptyState icon={Scale} message={t('reconciliation.empty')} />}
          />
        </div>
      </AsyncBoundary>
    </div>
  );
}
