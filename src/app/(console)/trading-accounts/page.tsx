'use client';

import { Suspense } from 'react';
import { CandlestickChart } from 'lucide-react';
import api from '@/lib/api';
import type {
  TradingAccountEnvironment,
  TradingAccountListResponse,
  TradingAccountRow,
  TradingAccountSortKey,
  TradingAccountStatus,
} from '@/lib/api/admin';
import { TRADING_ACCOUNT_SORT_KEYS } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { pageParam } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { PageLoader } from '@/components/ui/loader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * Client trading accounts — `GET /admin/trading-accounts`.
 *
 * ## MONEY RULE (ARCHITECTURE §6.1)
 *
 * `balance` is a decimal STRING and reaches the DOM as one. No `Number()`, no
 * `parseFloat`, no `Intl.NumberFormat`. It is CRM-owned until the MT5 bridge
 * lands, at which point it becomes a mirror of MetaTrader's own figure — which
 * is all the more reason not to reformat it here.
 *
 * ## `login` is a STRING and is nullable
 *
 * MetaTrader issues it, and leading zeros are significant to the bridge — so it
 * is rendered, never parsed, and never right-aligned as though it were a
 * number. NULL means MT5 has not assigned one yet, which is a state rather than
 * a missing value, so the cell says so rather than showing an em-dash that
 * reads as a rendering fault.
 *
 * ## Sorting is server-side
 *
 * Every sortable header maps to a key in `TRADING_ACCOUNT_SORT_KEYS`, mirroring
 * the endpoint's allowlist. `login` is in it and pins NULLS LAST in both
 * directions, so unassigned accounts group at the end rather than interleaving.
 * `tier`, `leverage` and `mt5Group` are NOT, so those columns declare
 * `sortable: false` — R-2.5 makes an unrecognised sort a 400 rather than a
 * silent fallback.
 */
const PAGE_SIZE = 25;

const ENVIRONMENT_LABELS: Record<TradingAccountEnvironment, MessageKey> = {
  live: 'tradingAccounts.envLive',
  demo: 'tradingAccounts.envDemo',
};

/** Label and tone per account state, keyed off the API's own enum. */
const STATUS_META: Record<TradingAccountStatus, { labelKey: MessageKey; classes: string }> = {
  active: {
    labelKey: 'tradingAccounts.statusActive',
    classes: 'bg-success/10 text-success border-success/20',
  },
  suspended: {
    labelKey: 'tradingAccounts.statusSuspended',
    classes: 'bg-warning/10 text-warning border-warning/20',
  },
  closed: {
    labelKey: 'tradingAccounts.statusClosed',
    classes: 'bg-muted text-muted-foreground border-border',
  },
};

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: TradingAccountSortKey) => ({ sortable: true as const, sortKey: key });

/*
 * `useSearchParams()` requires a Suspense boundary at prerender or
 * `npm run build` fails — and `next dev` does NOT, so CI is where you find out.
 * Same shape as `clients/page.tsx`.
 */
export default function TradingAccountsPage() {
  return (
    <Suspense fallback={<PageLoader label={t('tradingAccounts.loading')} />}>
      <TradingAccountsPageContent />
    </Suspense>
  );
}

function TradingAccountsPageContent() {
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));

  /*
   * Read back through the API's own unions rather than passed as bare strings.
   *
   * A hand-edited `?environment=production` would otherwise reach the endpoint
   * and come back a 400, on a URL an operator may have pasted from somewhere.
   * Narrowing here means an unrecognised value is simply not a filter.
   */
  const environment = (['live', 'demo'] as const).find((e) => e === url.get('environment'));
  const status = (['active', 'suspended', 'closed'] as const).find((s) => s === url.get('status'));
  // Debounced for the same reason as the wallets screen's: it is a free-text
  // box, and the API matches the id exactly rather than searching.
  const userId = useDebounced(url.get('userId').trim());

  const sortKey = TRADING_ACCOUNT_SORT_KEYS.includes(url.sort.key as TradingAccountSortKey)
    ? (url.sort.key as TradingAccountSortKey)
    : undefined;

  const params = {
    limit: PAGE_SIZE,
    page,
    userId: userId || undefined,
    environment,
    status,
    sort: sortKey,
    // Withheld when nothing is sorted — `order` alone describes an ordering of
    // no column, and sending it would cache one result set under two keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<TradingAccountListResponse>(
    ['admin', 'trading-accounts', params],
    (signal) => api.admin.getTradingAccounts(params, signal),
  );

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  /*
   * The export carries the FILTERS, not the page — `fetchExport` strips paging
   * itself. The sort is deliberately absent: an export is defined by which rows
   * it holds, not the order they arrive in. The endpoint accepts exactly these
   * three.
   */
  const exportFilters = new URLSearchParams({
    ...(userId ? { userId } : {}),
    ...(environment ? { environment } : {}),
    ...(status ? { status } : {}),
  });

  const columns: Column<TradingAccountRow>[] = [
    {
      header: t('tradingAccounts.colOwner'),
      // Sorts by EMAIL — the key the endpoint orders on, and the unique,
      // always-present field. Grouping by it puts one client's accounts
      // together, which is the reason to sort this column.
      ...sortableBy('userEmail'),
      cell: (a) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {[a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="truncate text-xs text-muted-foreground">{a.user.email}</div>
        </div>
      ),
    },
    {
      header: t('tradingAccounts.colLogin'),
      // Sortable, and the endpoint pins NULLS LAST in both directions — see the
      // note at the top of this file.
      ...sortableBy('login'),
      cell: (a) =>
        a.login ? (
          // Left-aligned and monospaced: it is an identifier, not a quantity.
          <span className="font-mono font-semibold">{a.login}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('tradingAccounts.noLogin')}</span>
        ),
    },
    {
      header: t('tradingAccounts.colEnvironment'),
      ...sortableBy('environment'),
      cell: (a) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            // Demo is deliberately muted and live is not. An operator scanning
            // this column is looking for the accounts that hold real money.
            a.environment === 'live'
              ? 'border-info/20 bg-info/10 text-info'
              : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {t(ENVIRONMENT_LABELS[a.environment])}
        </span>
      ),
    },
    {
      header: t('tradingAccounts.colCurrency'),
      ...sortableBy('currency'),
      cell: (a) => <span className="font-mono text-xs font-semibold">{a.currency}</span>,
    },
    {
      header: t('tradingAccounts.colBalance'),
      align: 'right',
      // Sortable because the SERVER orders it, on the NUMERIC column. No
      // `sortType: 'money'` — that comparator drives the client-side fallback,
      // which `onSortChange` switches off.
      ...sortableBy('balance'),
      // Rendered VERBATIM. §6.1 — see the file header.
      cell: (a) => a.balance,
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap tabular',
    },
    {
      header: t('tradingAccounts.colLeverage'),
      align: 'right',
      /*
       * NOT sortable — `leverage` is absent from the endpoint's allowlist.
       *
       * It is also the one number on this row that is genuinely a number: a
       * ratio the bridge sets, not money, so rendering it as `1:500` is
       * formatting rather than a coercion of a decimal string.
       */
      sortable: false,
      cell: (a) =>
        a.leverage ? (
          <span className="tabular">1:{a.leverage}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('tradingAccounts.noLeverage')}</span>
        ),
      cellClassName: 'whitespace-nowrap',
    },
    {
      header: t('tradingAccounts.colStatus'),
      ...sortableBy('status'),
      cell: (a) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[a.status].classes}`}
        >
          {t(STATUS_META[a.status].labelKey)}
        </span>
      ),
    },
    {
      header: t('tradingAccounts.colOpened'),
      ...sortableBy('createdAt'),
      cell: (a) => formatDate(a.createdAt),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    /*
     * NO ACTIONS COLUMN, deliberately.
     *
     * `AdminHoldingsController` exposes reads only. MetaTrader is the system of
     * record for logins, groups and leverage (ARCHITECTURE §1), and there is no
     * endpoint here that suspends, closes or repoints an account — so a
     * three-dot menu would have to invent its entries.
     */
  ];

  const isFiltered = Boolean(userId || environment || status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('tradingAccounts.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('tradingAccounts.subtitle')}</p>
        </div>
        <ExportButton resource="trading-accounts" filters={exportFilters} disabled={total === 0} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label={t('tradingAccounts.filterClient')}
          placeholder={t('tradingAccounts.filterClientPlaceholder')}
          title={t('tradingAccounts.filterClientHint')}
          value={url.get('userId')}
          onChange={(e) => {
            // Filter and page written together, so narrowing always lands on
            // page one rather than past the end of the new result set.
            url.set({ userId: e.target.value, page: undefined });
          }}
          className="h-9 w-64 rounded-lg border border-input bg-background px-3 font-mono text-xs focus-outline"
        />

        <Select
          value={environment ?? 'all'}
          onValueChange={(value) =>
            url.set({ environment: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label={t('tradingAccounts.filterEnvironment')}>
            <SelectValue placeholder={t('tradingAccounts.filterEnvironmentAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tradingAccounts.filterEnvironmentAll')}</SelectItem>
            <SelectItem value="live">{t('tradingAccounts.envLive')}</SelectItem>
            <SelectItem value="demo">{t('tradingAccounts.envDemo')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={status ?? 'all'}
          onValueChange={(value) =>
            url.set({ status: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label={t('tradingAccounts.filterStatus')}>
            <SelectValue placeholder={t('tradingAccounts.filterStatusAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tradingAccounts.filterStatusAll')}</SelectItem>
            <SelectItem value="active">{t('tradingAccounts.statusActive')}</SelectItem>
            <SelectItem value="suspended">{t('tradingAccounts.statusSuspended')}</SelectItem>
            <SelectItem value="closed">{t('tradingAccounts.statusClosed')}</SelectItem>
          </SelectContent>
        </Select>

        {isFiltered && (
          <button
            type="button"
            onClick={() => url.clear()}
            className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted focus-outline"
          >
            {t('tradingAccounts.clearFilters')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('tradingAccounts.loading')}
        endpoints={['GET /admin/trading-accounts?userId&environment&status&page&limit&sort&order']}
        onRetry={query.refetch}
        errorMessage={t('tradingAccounts.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('tradingAccounts.caption')}
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={CandlestickChart}
              message={isFiltered ? t('tradingAccounts.emptyFiltered') : t('tradingAccounts.empty')}
            />
          }
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * Server-side. The page is dropped with the sort: reordering
           * renumbers every page, so position 26–50 after a sort holds
           * different accounts than it did before. `key` is `null` on the third
           * click — the cycle back to unsorted — and both params come out of the
           * URL together.
           */
          onSortChange={(key, order) => {
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined });
          }}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            noun: [t('tradingAccounts.noun'), t('tradingAccounts.nounPlural')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
