'use client';

import * as React from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Eye, Receipt } from 'lucide-react';
import api from '@/lib/api';
import type {
  ClientRef,
  Currency,
  TransactionListResponse,
  TransactionRow,
  TransactionSortKey,
} from '@/lib/api/admin';
import { TRANSACTION_SORT_KEYS } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { TxStateBadge, stateLabel } from '@/components/financial/transaction-badges';
import { DateRangeFilter } from '@/components/financial/date-range-filter';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { ChoiceFilter, useTableState } from './table-state';
import { movementMethodLabel, transferDirectionLabel } from './movement-labels';
import { TransactionDetailsModal } from './transaction-details-modal';

/**
 * The client's money movements — the profile's Transactions tab (owner,
 * 29 Sep 2026), which replaced History. Three sub-tabs, because the three are
 * read for different questions: Deposits ("did their money arrive?"),
 * Withdrawals ("did we pay them?") and Transfers (wallet ⇄ trading account).
 *
 * Each reads `GET /admin/transactions` — the Financial list, filtered to this
 * client — so filtering, sorting and paging are the server's, over every
 * movement they have, never a page of them. A Details button on each row opens
 * everything about it, the deposit's receipt included.
 */

type SubTab = 'deposits' | 'withdrawals' | 'transfers';

const SUB_TABS: readonly {
  value: SubTab;
  kind: 'payment' | 'transfer';
  direction?: 'deposit' | 'withdrawal';
}[] = [
  { value: 'deposits', kind: 'payment', direction: 'deposit' },
  { value: 'withdrawals', kind: 'payment', direction: 'withdrawal' },
  { value: 'transfers', kind: 'transfer' },
];

/* A transfer is never "approved" or "rejected" — it settles or fails. */
const STATES: Record<SubTab, readonly string[]> = {
  deposits: ['pending', 'success', 'rejected', 'failure'],
  withdrawals: ['pending', 'approved', 'success', 'rejected', 'failure'],
  transfers: ['pending', 'success', 'failure'],
};

export function ClientTransactionsTab({ userId }: { userId: ClientRef }) {
  const [sub, setSub] = React.useState<SubTab>('deposits');
  const tabs: TabDefinition[] = [
    {
      value: 'deposits',
      label: t('clientProfile.txTabDeposits'),
      icon: <ArrowDownToLine className="h-3.5 w-3.5" />,
    },
    {
      value: 'withdrawals',
      label: t('clientProfile.txTabWithdrawals'),
      icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
    },
    {
      value: 'transfers',
      label: t('clientProfile.txTabTransfers'),
      icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <Tabs
          tabs={tabs}
          value={sub}
          onValueChange={(next) => setSub(next as SubTab)}
          idPrefix="client-tx"
        />
      </div>
      {SUB_TABS.map((spec) => (
        <TabPanel
          key={spec.value}
          value={spec.value}
          activeValue={sub}
          idPrefix="client-tx"
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Mounted only while shown, so each keeps its own filters and asks nothing
              until it is opened. */}
          {sub === spec.value && <MovementsTable userId={userId} spec={spec} />}
        </TabPanel>
      ))}
    </section>
  );
}

function MovementsTable({ userId, spec }: { userId: ClientRef; spec: (typeof SUB_TABS)[number] }) {
  const table = useTableState<TransactionSortKey>(TRANSACTION_SORT_KEYS);
  const [state, setState] = React.useState('');
  const [currency, setCurrency] = React.useState('');
  const [range, setRange] = React.useState<{ from?: string; to?: string }>({});
  const [details, setDetails] = React.useState<TransactionRow | null>(null);

  const currencies = useResource<Currency[]>(keys.currencies.all(), (signal) =>
    api.admin.getCurrencies(signal),
  );

  const params = {
    limit: table.pageSize,
    page: table.page,
    userId,
    kind: spec.kind,
    direction: spec.direction,
    state: (state || undefined) as TransactionRow['state'] | undefined,
    currency: currency || undefined,
    from: range.from,
    to: range.to,
    sort: table.sort.key,
    order: table.sort.key ? table.sort.order : undefined,
  };
  const query = useResource<TransactionListResponse>(keys.transactions.list(params), (signal) =>
    api.admin.getTransactions(params, signal),
  );

  const filtered = Boolean(state || currency || range.from || range.to);
  const isDeposits = spec.value === 'deposits';
  const isTransfers = spec.value === 'transfers';

  const columns: Column<TransactionRow>[] = [
    {
      header: t('clientProfile.txColDate'),
      sortable: true,
      sortKey: 'createdAt',
      cell: (row) => new Date(row.createdAt).toLocaleString(),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
    },
    ...(isTransfers
      ? [
          {
            header: t('clientProfile.txColWay'),
            sortable: false as const,
            cell: (row: TransactionRow) => transferDirectionLabel(row.direction),
          },
        ]
      : [
          {
            header: t('clientProfile.txColMethod'),
            sortable: false as const,
            cell: (row: TransactionRow) => movementMethodLabel(row),
          },
        ]),
    {
      header: t('clientProfile.txColAmount'),
      align: 'right',
      sortable: true,
      sortKey: 'amount',
      // The API's decimal string, formatted — never parsed (§6.1).
      cell: (row) => (
        <span className="tabular font-semibold">{formatMoney(row.amount, row.currency)}</span>
      ),
    },
    {
      header: t('clientProfile.txColState'),
      sortable: true,
      sortKey: 'state',
      cell: (row) => <TxStateBadge state={row.state} />,
    },
    ...(isDeposits
      ? [
          {
            header: t('clientProfile.txReceipt'),
            sortable: false as const,
            // A mark, not the file: the receipt itself opens from Details.
            cell: (row: TransactionRow) =>
              row.proofFilename ? (
                <Receipt
                  className="h-4 w-4 text-muted-foreground"
                  aria-label={t('clientProfile.txHasReceipt')}
                />
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]
      : []),
    {
      header: t('clientProfile.txColDetails'),
      sortable: false,
      align: 'right',
      cell: (row) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDetails(row)}
          aria-label={t('clientProfile.txDetailsFor', {
            amount: formatMoney(row.amount, row.currency),
          })}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {t('clientProfile.txDetails')}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ChoiceFilter
          label={t('clientProfile.txFilterState')}
          allLabel={t('clientProfile.txFilterStateAll')}
          value={state}
          options={STATES[spec.value].map((value) => ({ value, label: stateLabel(value) }))}
          onChange={(next) => {
            setState(next);
            table.setPage(1);
          }}
        />
        <ChoiceFilter
          label={t('clientProfile.txFilterCurrency')}
          allLabel={t('clientProfile.txFilterCurrencyAll')}
          value={currency}
          options={(currencies.data ?? []).map((c) => ({ value: c.code, label: c.code }))}
          onChange={(next) => {
            setCurrency(next);
            table.setPage(1);
          }}
        />
        <DateRangeFilter
          from={range.from ?? ''}
          to={range.to ?? ''}
          onChange={(next) => {
            setRange(next);
            table.setPage(1);
          }}
        />
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('clientProfile.txLoading')}
        endpoints={['GET /admin/transactions?userId&kind&direction']}
        onRetry={query.refetch}
        errorMessage={t('clientProfile.txLoadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t(`clientProfile.txTab${capitalise(spec.value)}`)}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(row) => `${row.kind}-${row.id}`}
          dimmed={query.isFetching}
          onRowDoubleClick={(row) => setDetails(row)}
          empty={
            <EmptyState
              icon={isTransfers ? ArrowLeftRight : isDeposits ? ArrowDownToLine : ArrowUpFromLine}
              message={
                filtered ? t('clientProfile.txNoMatch') : t(`clientProfile.txEmpty.${spec.value}`)
              }
            />
          }
          sortColumn={table.sort.key}
          sortDirection={table.sort.order}
          onSortChange={table.setSort}
          pagination={{
            page: table.page,
            pageSize: table.pageSize,
            total: query.data?.total ?? 0,
            onPageChange: table.setPage,
            onPageSizeChange: table.setPageSize,
            noun: [t('clientProfile.txNoun'), t('clientProfile.txNounPlural')],
          }}
        />
      </AsyncBoundary>

      <TransactionDetailsModal row={details} onClose={() => setDetails(null)} />
    </div>
  );
}

function capitalise(value: SubTab): 'Deposits' | 'Withdrawals' | 'Transfers' {
  return (value.charAt(0).toUpperCase() + value.slice(1)) as
    'Deposits' | 'Withdrawals' | 'Transfers';
}
