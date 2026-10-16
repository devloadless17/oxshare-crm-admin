'use client';

import { Suspense, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import api from '@/lib/api';
import {
  TRANSACTION_SORT_KEYS,
  TRANSACTION_STATES,
  TRANSFER_ORIGINS,
  type Currency,
  type MovementType,
  type StuckTransfers,
  type TransactionListParams,
  type TransactionListResponse,
  type TransactionRow,
  type TransactionSortKey,
  type TransactionState,
  type TransactionsSummary,
  type TransferOrigin,
} from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useUrlSearch } from '@/hooks/use-url-search';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { useListPaging } from '@/hooks/use-list-paging';
import { useDateRange } from '@/hooks/use-date-range';
import { RecordSheet, useOpenedRecord } from '@/components/record-sheet';
import { transactionActions, transactionColumns } from '@/components/financial/transaction-columns';
import { TxStateBadge, stateLabel } from '@/components/financial/transaction-badges';
import { AbandonTransferDialog } from '@/components/financial/abandon-transfer-dialog';
import { movementDetailFields } from '@/components/movements/movement-detail-fields';
import { TransferTiles } from '@/components/movements/accounting-tiles';
import { originLabel, typeLabel } from '@/components/movements/movement-vocabulary';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { PageLoader } from '@/components/ui/loader';
import { QueueToolbar } from '@/components/queue-toolbar';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { DateRangePicker, PeriodWiden } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { maskedFieldLabels } from '@/lib/masking';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { StatusBanner } from '@/app/(console)/bridge/page';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/** RBAC-03 — the hidden client fields, named once above the table (Financial's labels). */
const FIELD_LABELS: Record<string, string> = {
  'financial.user.email': t('financial.maskedLabelEmail'),
  'financial.user.firstName': t('financial.maskedLabelName'),
  'financial.user.lastName': t('financial.maskedLabelName'),
};

/** The tabs: each internal accounting type, by what the movement does. */
const TABS = [
  'transfer_to_account',
  'transfer_to_wallet',
  'commission_to_wallet',
] as const satisfies readonly MovementType[];

/**
 * TRANSFERS — Finance → Transfers (16 Oct 2026), the buyer's "Transactions → Transfer".
 *
 * Every move between a client's OWN accounts: wallet ⇄ trading account, and a partner's commission
 * wallet → main wallet, each row saying from where to where (a wallet by its number, an account by
 * its MT5 login), where the money came from (the client, a deposit sent straight to the account,
 * or the desk — who, and why), and its state. `GET /admin/transfers`, on its own key
 * (`transfers.view`); the server forces the transfer kinds, so this page can never list a payment.
 *
 * Built from Financial's own parts — the same columns, record panel, release-hold dialog and stuck
 * banner — so the two pages cannot describe one transfer two ways.
 */
export default function TransfersPage() {
  return (
    <Suspense fallback={<PageLoader label={t('transfers.loading')} />}>
      <TransfersPageContent />
    </Suspense>
  );
}

function member<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function TransfersPageContent() {
  const url = useTableQueryState();
  const paging = useListPaging(url, 'transfers');
  const { search, setSearch, term: q } = useUrlSearch(url);
  // The buyer's rule: a busy book never loads its whole history by default.
  const period = useDateRange(url, 'today');

  const tab = member<(typeof TABS)[number]>(url.get('type'), TABS);
  const origin = member<TransferOrigin>(url.get('origin'), TRANSFER_ORIGINS);
  const state = member<TransactionState>(url.get('state'), TRANSACTION_STATES);
  const currency = url.get('currency');
  // One account — the "View transfers" link on an account carries its MT5 login.
  const account = url.get('account');
  const userId = url.get('userId');
  const sortKey = member<TransactionSortKey>(url.sort.key ?? '', TRANSACTION_SORT_KEYS);

  const filterParams = {
    type: tab,
    origin,
    state,
    account: account || undefined,
    userId: userId || undefined,
    currency: currency || undefined,
    q: q || undefined,
    from: period.range.from,
    to: period.range.to,
  };
  const params: TransactionListParams = {
    ...filterParams,
    ...paging.params,
    facet: 'type',
    sort: sortKey,
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<TransactionListResponse>(
    keys.transactions.transfers(params),
    (signal) => api.admin.getTransfers(params, signal),
  );
  // The tiles keep their totals while the tabs change, like Financial's.
  const summaryParams = { ...filterParams, type: undefined };
  const summaryQuery = useResource<TransactionsSummary>(
    keys.transactions.transfersSummary(summaryParams),
    (signal) => api.admin.getTransfersSummary(summaryParams, signal),
  );
  const currenciesQuery = useResource<Currency[]>(keys.currencies.all(), (signal) =>
    api.admin.getCurrencies(signal),
  );
  const stuckQuery = useResource<StuckTransfers>(keys.transactions.stuck(), (signal) =>
    api.admin.getStuckTransfers(signal),
  );
  const opened = useOpenedRecord(keys.transactions.transfers, (p, signal) =>
    api.admin.getTransfers(p, signal),
  );
  const openedRow = opened.query.data?.items[0];

  const { admin } = useAdmin();
  const canAbandon = hasPermission(admin, 'transfers.abandon');
  const [abandonTarget, setAbandonTarget] = useState<TransactionRow | null>(null);

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const typeCounts = query.data?.typeCounts ?? {};
  const capped = query.data?.countsCapped ?? [];
  const maskedFields = query.data?.maskedFields ?? [];
  const stuck = stuckQuery.data;

  const columns = transactionColumns({
    maskedFields,
    onAbandon: canAbandon ? setAbandonTarget : undefined,
  });
  const title = (row: TransactionRow) =>
    t('records.movement', {
      kind: typeLabel(row.type),
      amount: formatMoney(row.amount, row.currency),
    });

  const isFiltered = Boolean(
    tab ||
    origin ||
    state ||
    currency ||
    account ||
    userId ||
    url.get('q') ||
    period.choice !== period.defaultChoice,
  );
  const exportFilters = new URLSearchParams();
  for (const [key, value] of Object.entries(filterParams)) {
    if (value) exportFilters.set(key, String(value));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('transfers.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('transfers.subtitle')}</p>
        </div>
        <ExportButton resource="transfers" filters={exportFilters} disabled={total === 0} />
      </div>

      {stuck && stuck.count > 0 && (
        <StatusBanner
          healthy={false}
          message={t(stuck.count === 1 ? 'financial.stuckBannerOne' : 'financial.stuckBanner', {
            count: stuck.count,
            minutes: stuck.thresholdMinutes,
          })}
        />
      )}

      <RecordSheet
        open={opened}
        row={openedRow}
        rowKey={(row) => row.id}
        subjectKind="transfer"
        title={title}
        status={(row) => <TxStateBadge state={row.state} />}
        omit={[t('financial.colAmount')]}
        extraFields={(row) => movementDetailFields(row)}
        columns={columns}
        actions={(row) =>
          transactionActions(row, { onAbandon: canAbandon ? setAbandonTarget : undefined })
        }
      />

      <MaskedFieldsNotice labels={maskedFieldLabels(maskedFields, FIELD_LABELS)} />

      <TransferTiles summary={summaryQuery.data} loading={summaryQuery.status === 'loading'} />

      <QueueToolbar
        filters={[
          {
            value: '',
            label: t('transfers.tabAll'),
            count: typeCounts['all'],
            capped: capped.includes('all'),
          },
          ...TABS.map((value) => ({
            value,
            label: typeLabel(value),
            count: typeCounts[value],
            capped: capped.includes(value),
          })),
        ]}
        active={tab ?? ''}
        onFilterChange={(value) => url.set({ type: value || undefined, page: undefined })}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('transfers.searchPlaceholder')}
        searchAriaLabel={t('transfers.searchAria')}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Select
          value={origin ?? 'all'}
          onValueChange={(value) =>
            url.set({ origin: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-48" aria-label={t('movement.filterOrigin')}>
            <SelectValue placeholder={t('movement.originAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('movement.originAll')}</SelectItem>
            {TRANSFER_ORIGINS.map((value) => (
              <SelectItem key={value} value={value}>
                {originLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state ?? 'all'}
          onValueChange={(value) =>
            url.set({ state: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label={t('financial.filterState')}>
            <SelectValue placeholder={t('financial.stateAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('financial.stateAll')}</SelectItem>
            {/* A transfer only ever settles or fails: no approved, no rejected. */}
            {(['pending', 'success', 'failure'] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {stateLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={currency || 'all'}
          onValueChange={(value) =>
            url.set({ currency: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-36" aria-label={t('financial.filterCurrency')}>
            <SelectValue placeholder={t('financial.filterCurrencyAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('financial.filterCurrencyAll')}</SelectItem>
            {(currenciesQuery.data ?? []).map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          choice={period.choice}
          custom={period.custom}
          defaultChoice={period.defaultChoice}
          onChange={period.set}
        />
        {account && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => url.set({ account: undefined, page: undefined })}
            aria-label={t('transfers.accountChipClear')}
          >
            {t('transfers.accountChip', { login: account })}
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {isFiltered && (
          <Button type="button" size="sm" variant="ghost" onClick={() => url.clear()}>
            {t('financial.clearFilters')}
          </Button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('transfers.loading')}
        endpoints={['GET /admin/transfers?type&origin&account&state&q&userId&currency&from&to']}
        onRetry={query.refetch}
        errorMessage={t('transfers.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('transfers.caption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => opened.open(row.id)}
          activeRowKey={opened.openId}
          rowLabel={(row) => t('records.openRow', { name: title(row) })}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={ArrowLeftRight}
              message={isFiltered ? t('transfers.emptyFiltered') : t('transfers.empty')}
              action={<PeriodWiden choice={period.choice} onChange={period.set} />}
            />
          }
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          onSortChange={(key, order) => {
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined });
          }}
          cursorPagination={paging.pager(query.data, rows.length, [
            t('transfers.noun'),
            t('transfers.nounPlural'),
          ])}
        />
      </AsyncBoundary>

      <AbandonTransferDialog
        target={abandonTarget}
        onClose={() => setAbandonTarget(null)}
        onDone={async () => {
          await Promise.all([query.refetch(), summaryQuery.refetch(), stuckQuery.refetch()]);
        }}
      />
    </div>
  );
}
