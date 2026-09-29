'use client';

import * as React from 'react';
import { CandlestickChart, Eye, Users } from 'lucide-react';
import { SearchField } from '@/components/ui/search-field';
import api from '@/lib/api';
import type {
  ClientListResponse,
  ClientSortKey,
  TradingAccountListResponse,
  TradingAccountRow,
  TradingAccountSortKey,
} from '@/lib/api/admin';
import { CLIENT_SORT_KEYS, TRADING_ACCOUNT_SORT_KEYS } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { PermittedLink } from '@/components/permitted-link';
import { RowActions, actionsColumn, type RowAction } from '@/components/row-actions';
import { clientColumns } from '@/components/clients/client-columns';
import { useClientStatusToggle } from '@/components/clients/use-client-status-toggle';
import { tradingAccountColumns } from '@/components/trading/trading-account-columns';
import { useAccountFunding } from '@/components/trading/use-account-funding';
import { TabPanel } from '@/components/ui/tabs';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * A PARTNER'S BOOK, as two tables on their profile (owner, 26 Sep 2026): the
 * clients they introduced, and those clients' trading accounts — each with the
 * actions an operator takes from the matching desk.
 *
 * The Network tab draws the tree, which answers "who is under whom" and is
 * capped at one screen's worth of each branch. These answer "what is in this
 * partner's book" in full: paged, searchable and sortable by the server, and
 * reading the same endpoints as the Clients and Trading accounts desks with
 * `referredBy` set — so a number here and a number there cannot disagree, and
 * both are scoped to the reader's territory by the API.
 */

/**
 * The two tabs' panels, for the profile page to mount beside its others. Each
 * is given its tab value, or none when the reader may not see it.
 */
export function ReferredTabPanels({
  activeTab,
  partnerPortalId,
  clients,
  accounts,
}: {
  activeTab: string;
  partnerPortalId: number;
  clients?: string;
  accounts?: string;
}) {
  return (
    <>
      {clients && (
        <TabPanel
          value={clients}
          activeValue={activeTab}
          idPrefix="client-profile"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ReferredClientsPanel partnerPortalId={partnerPortalId} />
        </TabPanel>
      )}
      {accounts && (
        <TabPanel
          value={accounts}
          activeValue={activeTab}
          idPrefix="client-profile"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ReferredAccountsPanel partnerPortalId={partnerPortalId} />
        </TabPanel>
      )}
    </>
  );
}

/** The tables' own search box — the page's filters live in the URL; these are local. */
function TableSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <SearchField
      value={value}
      onChange={onChange}
      label={label}
      placeholder={placeholder}
      className="w-full sm:w-80"
    />
  );
}

/** Page, size, sort and search for one table — reset to page one on any change. */
function useTableState<K extends string>(allowed: readonly K[]) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<{ key?: K; order: 'asc' | 'desc' }>({ order: 'desc' });
  const q = useDebounced(search.trim());

  return {
    page,
    pageSize,
    search,
    q,
    sort,
    setPage,
    setSearch: (next: string) => {
      setSearch(next);
      setPage(1);
    },
    // One of the pager's four sizes, whatever the control hands back.
    setPageSize: (size: number) => {
      setPageSize(PAGE_SIZES.find((allowed) => allowed === size) ?? DEFAULT_PAGE_SIZE);
      setPage(1);
    },
    // The page is dropped with the sort: reordering renumbers every page.
    setSort: (key: string | null, order: 'asc' | 'desc' | null) => {
      const known = allowed.find((candidate) => candidate === key);
      setSort({ key: known, order: order ?? 'desc' });
      setPage(1);
    },
  };
}

/* ── Clients ─────────────────────────────────────────────────────────────── */

export function ReferredClientsPanel({ partnerPortalId }: { partnerPortalId: number }) {
  const { admin } = useAdmin();
  const canSuspend = hasPermission(admin, 'clients.suspend');
  const canViewTags = hasPermission(admin, 'tags.view') || hasPermission(admin, 'clients.view');
  const table = useTableState<ClientSortKey>(CLIENT_SORT_KEYS);
  const status = useClientStatusToggle();

  const params = {
    limit: table.pageSize,
    page: table.page,
    withTotal: true,
    q: table.q || undefined,
    referredBy: String(partnerPortalId),
    sort: table.sort.key,
    order: table.sort.key ? table.sort.order : undefined,
  };
  const query = useResource<ClientListResponse>(keys.clients.list(params), (signal) =>
    api.admin.getClients(params, signal),
  );

  /*
   * The directory's columns and row menu — View profile, Suspend/Reactivate.
   * NOT the commission-level change: moving a partner's terms is not offered
   * from a profile (owner, 26 Sep 2026); the Partners desk keeps it.
   */
  const columns = clientColumns({
    canSuspend,
    canViewTags,
    canEditPartners: false,
    maskedFields: query.data?.maskedFields ?? [],
    actingId: status.actingId,
    onToggleStatus: (client) => void status.toggle(client),
    onChangeProgram: () => undefined,
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <TableSearch
          value={table.search}
          onChange={table.setSearch}
          label={t('clientProfile.referredClientsSearch')}
          placeholder={t('clientProfile.referredClientsSearchPlaceholder')}
        />
        {/* The directory, filtered the same way — where the export lives. */}
        <PermittedLink
          href={`/clients?referredBy=${partnerPortalId}`}
          className="text-xs font-semibold text-link hover:underline focus-outline"
        >
          {t('clientProfile.referredClientsOpenList')}
        </PermittedLink>
      </div>
      <AsyncBoundary
        status={query.status}
        label={t('clientProfile.referredClientsLoading')}
        endpoints={['GET /admin/clients?referredBy']}
        onRetry={query.refetch}
        errorMessage={t('clientProfile.referredClientsLoadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('clientProfile.referredClientsTitle')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(client) => String(client.id)}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={Users}
              message={
                table.q
                  ? t('clientProfile.referredClientsNoMatch')
                  : t('clientProfile.referredClientsEmpty')
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
            noun: [t('clients.nounOne'), t('clients.nounMany')],
          }}
        />
      </AsyncBoundary>
    </section>
  );
}

/* ── Accounts ────────────────────────────────────────────────────────────── */

export function ReferredAccountsPanel({ partnerPortalId }: { partnerPortalId: number }) {
  const table = useTableState<TradingAccountSortKey>(TRADING_ACCOUNT_SORT_KEYS);
  const funding = useAccountFunding();

  const params = {
    limit: table.pageSize,
    page: table.page,
    referredBy: String(partnerPortalId),
    q: table.q || undefined,
    sort: table.sort.key,
    order: table.sort.key ? table.sort.order : undefined,
  };
  const query = useResource<TradingAccountListResponse>(
    keys.tradingAccounts.list(params),
    (signal) => api.admin.getTradingAccounts(params, signal),
  );

  /*
   * The Trading accounts desk's columns, and a row menu: the owner's profile —
   * always — and moving money on the account where the reader may and the
   * account can take it (live, active, with a login).
   */
  const columns: Column<TradingAccountRow>[] = [
    ...tradingAccountColumns(),
    actionsColumn<TradingAccountRow>((account) => {
      const items: RowAction[] = [
        {
          label: t('clientProfile.referredAccountsViewOwner'),
          icon: Eye,
          href: `/clients/${account.user.portalId}`,
        },
        ...(funding.canMoveMoney && funding.canFund(account)
          ? [{ ...funding.action(account), separatorBefore: true }]
          : []),
      ];
      return (
        <RowActions
          label={t('tradingAccounts.rowActions', { login: account.login ?? account.id })}
          items={items}
        />
      );
    }),
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <TableSearch
          value={table.search}
          onChange={table.setSearch}
          label={t('clientProfile.referredAccountsSearch')}
          placeholder={t('tradingAccounts.filterClientPlaceholder')}
        />
      </div>
      <AsyncBoundary
        status={query.status}
        label={t('clientProfile.referredAccountsLoading')}
        endpoints={['GET /admin/trading-accounts?referredBy']}
        onRetry={query.refetch}
        errorMessage={t('clientProfile.referredAccountsLoadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('clientProfile.referredAccountsTitle')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(account) => account.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={CandlestickChart}
              message={
                table.q
                  ? t('clientProfile.referredAccountsNoMatch')
                  : t('clientProfile.referredAccountsEmpty')
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
            noun: [t('tradingAccounts.noun'), t('tradingAccounts.nounPlural')],
          }}
        />
      </AsyncBoundary>
      {funding.dialog}
    </section>
  );
}
