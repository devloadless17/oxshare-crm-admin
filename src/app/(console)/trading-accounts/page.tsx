'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, CandlestickChart, Plus } from 'lucide-react';
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
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
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
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { RowActions } from '@/components/row-actions';
import { OpenAccountModal } from '@/components/trading/open-account-modal';
import { FundAccountModal } from '@/components/trading/fund-account-modal';
import { relativeTime } from '@/lib/relative-time';
import { formatMoney } from '@/lib/money';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { keys } from '@/lib/query-keys';

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
   * The rows-per-page selector, in the URL beside the page number.
   *
   * It rendered and did nothing: the pager drew the control but no
   * `onPageSizeChange` was passed and the limit was a constant. `limitParam`
   * clamps to the four sizes the pager offers, so a hand-edited `?limit=5000`
   * cannot become a request the API rejects — it caps at 100.
   */
  const pageSize = limitParam(url.get('limit'));

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
    limit: pageSize,
    page,
    userId: userId || undefined,
    environment,
    status,
    sort: sortKey,
    // Withheld when nothing is sorted — `order` alone describes an ordering of
    // no column, and sending it would cache one result set under two keys.
    order: sortKey ? url.sort.order : undefined,
  };

  /*
   * Three separate keys, checked separately, because they are three different
   * powers — see the permissions catalogue. An operator who onboards clients
   * needs `trading.create` and neither of the money ones.
   *
   * This is UX, not security: the API enforces each independently. Hiding a
   * control the caller cannot use is what stops the console offering an action
   * that always 403s.
   */
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'trading.create');
  const canDeposit = hasPermission(admin, 'trading.deposit');
  const canWithdraw = hasPermission(admin, 'trading.withdraw');
  /*
   * ── The money control, and the two keys are NOT symmetric ────────────────
   *
   * A DEPOSIT mints balance into a wallet and then moves it onto the account,
   * so it needs `wallets.credit` (the key that governs minting) as well as
   * `trading.deposit`. A WITHDRAWAL mints nothing — it moves money the client
   * already has off their account into their own wallet — so `trading.withdraw`
   * alone is the right gate, and requiring `wallets.credit` for it would mean
   * granting the power to create money in order to take some away.
   *
   * The service asserts the same pair. This only decides whether to offer a
   * control that would otherwise always 403.
   */
  const canFundIn = hasPermission(admin, 'wallets.credit') && canDeposit;
  const canFundOut = canWithdraw;
  const canMoveMoney = canFundIn || canFundOut;

  const [openFor, setOpenFor] = React.useState<{ userId: string; label: string } | null>(null);
  const [funding, setFunding] = React.useState<TradingAccountRow | null>(null);
  const [fundError, setFundError] = React.useState<string | undefined>(undefined);

  const query = useResource<TradingAccountListResponse>(
    keys.tradingAccounts.list(params),
    (signal) => api.admin.getTradingAccounts(params, signal),
  );

  const rows = query.data?.items ?? [];

  const queryClient = useQueryClient();

  /*
   * Funding writes a DEPOSIT and a TRANSFER, so it moves rather more than this
   * page shows: the wallet balance, the client's transaction history, the
   * ledger, and the account's own cached balance column.
   */
  const fund = useMutation({
    mutationFn: (values: { amount: string; reason: string; direction: 'deposit' | 'withdraw' }) =>
      api.admin.fundTradingAccount(
        funding!.id,
        values,
        /*
         * ONE key per intended funding, minted from the row rather than per
         * attempt — the account id plus its current cached balance, so a retry
         * of the same submission reuses it while a second, deliberate funding
         * gets a new one (the balance has moved).
         *
         * The server stores it as the deposit's `provider_ref`, so this is what
         * makes a double-click credit once in the DATABASE rather than only in
         * a cache.
         */
        `fund:${funding!.id}:${values.direction}:${funding!.balance ?? '0'}`,
      ),
    onSuccess: (result, values) => {
      const account = funding;
      setFunding(null);
      setFundError(undefined);

      void queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
      void queryClient.invalidateQueries({ queryKey: keys.transactions.all() });
      void queryClient.invalidateQueries({ queryKey: keys.ledger.all() });
      void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
      void queryClient.invalidateQueries({ queryKey: keys.clients.all() });

      /*
       * THE HALF-DONE CASE GETS ITS OWN MESSAGE, and it is not an error toast.
       *
       * A failed onward transfer does NOT unwind the deposit, so the money is
       * genuinely in the client's wallet. Reporting a bare failure here would
       * send the operator to fund it a second time — which would work, and
       * would leave the client credited twice.
       */
      if (result.transferError) {
        toastSuccess(
          t('tradingAccounts.fundPartial', {
            amount: `${values.amount} ${account?.currency ?? ''}`,
            error: result.transferError,
          }),
        );
        return;
      }

      toastSuccess(
        t(values.direction === 'deposit' ? 'tradingAccounts.funded' : 'tradingAccounts.withdrawn', {
          amount: `${values.amount} ${account?.currency ?? ''}`,
          login: account?.login ?? '',
        }),
        // Worth surfacing rather than hiding: the key replayed an earlier
        // funding, so the operator's click moved no money. "Already added" and
        // "just added" look identical otherwise.
        result.replayed ? t('tradingAccounts.fundReplayed') : undefined,
      );
    },
    onError: (e: unknown) => setFundError(apiErrorMessage(e, t('tradingAccounts.fundFailed'))),
  });

  /*
   * The BALANCE COLUMN IS A CACHE, and nothing writes to it except a console
   * deposit. A client's own trading moves the real figure every second and MT5
   * never tells us, so the column is not merely stale — it is confidently
   * wrong, and it looks authoritative.
   *
   * That is not hypothetical. This screen showed ten accounts at $0.00, which
   * was the honest content of a column nobody had ever written to.
   *
   * The balance column reads the MIRROR, and no longer calls MT5 at all.
   *
   * It used to fetch live balances for every row on the page — one bridge call
   * each, up to twenty-five. Every MT5 call is serialised behind the bridge's
   * single session lock, so rendering this table queued twenty-five acquisitions
   * and starved the connection supervisor, which needs that same lock to rebuild
   * a dropped session. The screen showing the estate was the reason the estate
   * could not reconnect — and it fired whether or not anybody cared about any of
   * those numbers.
   *
   * `balance` is now refreshed by the bridge's own sweep and served from the
   * database, with `balanceSyncedAt` beside it so the age is visible rather than
   * implied. A live figure — with equity and margin, which are deliberately not
   * mirrored — is one click away on the account detail page, where somebody is
   * looking at one account on purpose.
   */

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
      /*
       * FORMATTED through decimal.js, never coerced (§6.1).
       *
       * A list an operator SCANS to compare accounts, so it follows the wallets
       * screen: two places and thousands separators instead of a raw
       * `1000.00000000`. Deliberately not the withdrawals queue's rule — there
       * the exact string is kept, because authorising one specific payout is a
       * different job from comparing a column of balances.
       */
      /*
       * Live where MT5 answered, the cached column otherwise — and the two are
       * VISUALLY DISTINCT, because a number nobody can date is worse than no
       * number. An account MT5 would not answer for is absent from the map
       * rather than null, which is what makes the fallback detectable.
       */
      cell: (a) => (
        <span
          title={
            a.balanceSyncedAt
              ? t('tradingAccounts.syncedHint', { when: relativeTime(a.balanceSyncedAt) })
              : a.login
                ? t('tradingAccounts.neverSyncedHint')
                : t('tradingAccounts.noLoginHint')
          }
        >
          {formatMoney(a.balance, a.currency)}
          {/*
            The AGE, on its own line and never omitted.
            
            A mirrored number rendered bare is indistinguishable from a live one,
            which is worse than either — it invites an operator to act on a figure
            whose vintage they cannot see. "Never" is its own answer and reads
            differently from "4 minutes ago": it means MT5 has not confirmed this
            account at all, not that the balance is old.
          */}
          <span className="block text-[11px] text-muted-foreground">
            {a.balanceSyncedAt ? relativeTime(a.balanceSyncedAt) : t('tradingAccounts.neverSynced')}
          </span>
        </span>
      ),
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

  /*
   * Appended rather than written into the array literal above, so the column
   * only exists for an operator who can act. A row menu that renders empty is
   * a control that looks broken rather than absent.
   */
  if (canMoveMoney) {
    columns.push({
      header: '',
      cell: (a) => (
        <RowActions
          label={t('tradingAccounts.rowActions', { login: a.login ?? a.id })}
          /*
           * OMITTED, not disabled.
           *
           * This is the row's only action, so a disabled item made the whole
           * menu a dead entry — and Radix strips the title from a disabled
           * item, so the reason (no MT5 login yet, or the account is not
           * active) appeared nowhere on screen. `RowActions` already states
           * the rule for the empty case in its own docstring: "a control that
           * only ever explains why it cannot be used is worse than its
           * absence". An account awaiting provisioning has no login, which is
           * the normal state for a freshly created row — and the Login and
           * Status columns beside this one already say so.
           */
          /*
           * ONE money action, and it used to be two.
           *
           * "Adjust balance on MT5" sat beside this and moved the MT5 figure
           * with no wallet leg and no ledger entry. Two menu items that both
           * moved money on the same account, differing only in whether anything
           * was written down, is not a choice an operator can make correctly —
           * and the unrecorded one moved money that no statement or ledger
           * could afterwards explain. It is gone; this one records both ways.
           *
           * LIVE accounts only, in both directions. A demo account trades
           * practice money against no wallet, so there is nothing to move or
           * record — the server refuses it, and a client tops up their own demo
           * account from the portal.
           */
          items={
            a.login && a.status === 'active' && a.environment === 'live'
              ? [
                  {
                    label: t('tradingAccounts.fundAction'),
                    icon: Banknote,
                    onSelect: () => {
                      setFundError(undefined);
                      setFunding(a);
                    },
                  },
                ]
              : []
          }
        />
      ),
    });
  }

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
          className="h-9 w-64 rounded-lg border border-input bg-card px-3 font-mono text-xs focus-outline"
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

        {canCreate && userId && (
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={() =>
              setOpenFor({
                userId,
                label:
                  [rows[0]?.user.firstName, rows[0]?.user.lastName].filter(Boolean).join(' ') ||
                  rows[0]?.user.email ||
                  userId,
              })
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('tradingAccounts.openTitle')}
          </Button>
        )}

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
            pageSize,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            // The size and the page are written together, and the page is
            // dropped: page 4 at 25 a page is past the end at 100 a page, which
            // renders as an empty table and reads as "no accounts" rather than
            // as an overshoot.
            onPageSizeChange: (size) =>
              url.set({
                limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              }),
            noun: [t('tradingAccounts.noun'), t('tradingAccounts.nounPlural')],
          }}
        />
        {/*
          The asterisk needs a key, or it is decoration. Shown only when at
          least one row actually fell back, so a page of live figures carries no
          caveat it does not need.
        */}
        {/*
          Shown whenever any row has never been confirmed, which is a state an
          operator should chase rather than squint at: it means the bridge has not
          delivered a balance for that account — not that the account is empty.
        */}
        {rows.some((a) => a.login && !a.balanceSyncedAt) && (
          <p className="px-1 pt-2 text-[11px] text-muted-foreground">
            {t('tradingAccounts.neverSyncedFootnote')}
          </p>
        )}
      </AsyncBoundary>

      {/*
        Rendered once for the page rather than per row: a modal inside a table
        cell unmounts when the row does, which on a background refetch closes
        the dialog under the operator's hands.
      */}
      {openFor && (
        <OpenAccountModal
          open
          onClose={() => setOpenFor(null)}
          userId={openFor.userId}
          clientLabel={openFor.label}
        />
      )}

      {funding && (
        <FundAccountModal
          open
          onClose={() => {
            setFunding(null);
            setFundError(undefined);
          }}
          login={funding.login ?? ''}
          currency={funding.currency}
          canDeposit={canFundIn}
          canWithdraw={canFundOut}
          saving={fund.isPending}
          error={fundError}
          onSubmit={(values) => fund.mutate(values)}
        />
      )}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
