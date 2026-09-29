'use client';

import { clientLabel } from '@/components/clients/client-identity';
import * as React from 'react';
import { Suspense } from 'react';
import { CandlestickChart, Plus } from 'lucide-react';
import api from '@/lib/api';
import type {
  TradingAccountListResponse,
  TradingAccountRow,
  TradingAccountSortKey,
} from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { TRADING_ACCOUNT_SORT_KEYS } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { UrlSearchInput } from '@/components/url-search-input';
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
import { t } from '@/lib/i18n';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { RowActions } from '@/components/row-actions';
import { OpenAccountModal } from '@/components/trading/open-account-modal';
import { tradingAccountColumns } from '@/components/trading/trading-account-columns';
import { useAccountFunding } from '@/components/trading/use-account-funding';
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
  /*
   * SEARCH, not an id — see the wallets desk, which had the identical defect.
   * The Owner column shows a name and an email; this filter read `userId`, a
   * uuid printed nowhere on the page. `userId` is still honoured so the row
   * menu's "see this client's accounts" and any saved link keep working.
   */
  const q = useDebounced(url.get('q').trim());
  const userId = useDebounced(url.get('userId').trim());

  const sortKey = TRADING_ACCOUNT_SORT_KEYS.includes(url.sort.key as TradingAccountSortKey)
    ? (url.sort.key as TradingAccountSortKey)
    : undefined;

  const params = {
    limit: pageSize,
    page,
    userId: userId || undefined,
    q: q || undefined,
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
  // The money control — see `useAccountFunding`.
  const funding = useAccountFunding();

  const [openFor, setOpenFor] = React.useState<{ userId: ClientRef; label: string } | null>(null);

  const query = useResource<TradingAccountListResponse>(
    keys.tradingAccounts.list(params),
    (signal) => api.admin.getTradingAccounts(params, signal),
  );

  const rows = query.data?.items ?? [];

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
    ...(q ? { q } : {}),
    ...(environment ? { environment } : {}),
    ...(status ? { status } : {}),
  });

  const columns: Column<TradingAccountRow>[] = tradingAccountColumns();

  const isFiltered = Boolean(userId || environment || status);

  /*
   * Appended rather than written into the array literal above, so the column
   * only exists for an operator who can act. A row menu that renders empty is
   * a control that looks broken rather than absent.
   */
  if (funding.canMoveMoney) {
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
          items={funding.canFund(a) ? [funding.action(a)] : []}
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
        <UrlSearchInput
          value={url.get('q')}
          label={t('tradingAccounts.filterClient')}
          placeholder={t('tradingAccounts.filterClientPlaceholder')}
          title={t('tradingAccounts.filterClientHint')}
          // Wider than the default box: the placeholder names four things the
          // search takes, and a clipped placeholder reads as a broken one.
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline sm:w-80"
          // Filter and page written together, so narrowing always lands on page
          // one rather than past the end of the new result set.
          onChange={(next) => url.set({ q: next || undefined, page: undefined })}
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
                // Was falling through to `userId` — the uuid, which is never
                // shown in this console. Portal ID is the identifier that
                // survives every mask.
                label: rows[0] ? clientLabel(rows[0].user) : userId,
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

      {funding.dialog}
    </div>
  );
}
