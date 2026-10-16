'use client';

import * as React from 'react';
import { Archive, ArchiveRestore, Boxes, CandlestickChart, Link2, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  ClientRef,
  TradingAccountListResponse,
  TradingAccountRow,
  TradingAccountSortKey,
} from '@/lib/api/admin';
import { TRADING_ACCOUNT_SORT_KEYS } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { tradingAccountColumns } from '@/components/trading/trading-account-columns';
import { useAccountFunding } from '@/components/trading/use-account-funding';
import { OpenAccountModal } from '@/components/trading/open-account-modal';
import { LinkAccountDialog, type LinkTarget } from '@/components/trading/link-account-dialog';
import { SetProductDialog } from '@/components/trading/set-product-dialog';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { ChoiceFilter, TableSearch, useTableState } from './table-state';

/**
 * The client's MT5 trading accounts — the profile's Accounts tab (owner,
 * 29 Sep 2026), beside Wallets: this person's accounts and nobody else's.
 *
 * `GET /admin/trading-accounts?userId=` — the Trading accounts desk's own list,
 * filtered to one client, so it sorts, pages and searches on the server exactly
 * as the desk does, with the desk's columns minus Client (it is this client on
 * every row). Opening an account and moving money on one are the desk's own
 * actions, offered where the reader holds them.
 */
export function ClientAccountsPanel({
  userId,
  clientName,
  client,
}: {
  userId: ClientRef;
  /** For the Open account dialog's title. */
  clientName: string;
  /** For "Link existing account" — the client is filled in, only the login is asked. */
  client: LinkTarget;
}) {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'trading.create');
  const canArchive = hasPermission(admin, 'trading.archive');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const table = useTableState<TradingAccountSortKey>(TRADING_ACCOUNT_SORT_KEYS);
  const funding = useAccountFunding();
  const [environment, setEnvironment] = React.useState('');
  const [status, setStatus] = React.useState('');
  // Opens on what the client sees in the portal (backend 0225).
  const [visibility, setVisibility] = React.useState('exclude');
  const [opening, setOpening] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [productFor, setProductFor] = React.useState<TradingAccountRow | null>(null);

  const params = {
    limit: table.pageSize,
    page: table.page,
    withTotal: true,
    userId,
    q: table.q || undefined,
    environment: (environment || undefined) as 'live' | 'demo' | undefined,
    status: (status || undefined) as 'active' | 'suspended' | 'closed' | undefined,
    archived: (visibility || undefined) as 'exclude' | 'only' | undefined,
    sort: table.sort.key,
    order: table.sort.key ? table.sort.order : undefined,
  };
  const query = useResource<TradingAccountListResponse>(
    keys.tradingAccounts.list(params),
    (signal) => api.admin.getTradingAccounts(params, signal),
  );

  /**
   * Archive hides the account from the client; nothing changes on MT5. The
   * server refuses an account holding money or open positions, and its sentence
   * is what the toast shows.
   */
  const setArchived = async (account: TradingAccountRow, archived: boolean) => {
    const login = account.login ?? account.id;
    if (
      archived &&
      !(await confirm({
        title: t('tradingAccounts.archiveTitle', { login }),
        description: t('tradingAccounts.archiveDescription'),
        confirmLabel: t('tradingAccounts.archiveConfirm'),
      }))
    ) {
      return;
    }
    try {
      await api.admin.setTradingAccountArchived(account.id, archived);
      toastSuccess(
        t(archived ? 'tradingAccounts.archived.toast' : 'tradingAccounts.restored.toast', {
          login,
        }),
      );
      await queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
    } catch (err) {
      toastError(
        err,
        t(archived ? 'tradingAccounts.archiveFailed' : 'tradingAccounts.restoreFailed'),
      );
    }
  };

  const columns: Column<TradingAccountRow>[] = [
    // Every row is this client — the Client column would repeat their name.
    ...tradingAccountColumns().filter((column) => column.header !== t('tradingAccounts.colOwner')),
    ...(funding.canMoveMoney || canCreate || canArchive
      ? [
          actionsColumn<TradingAccountRow>((account) => (
            <RowActions
              label={t('tradingAccounts.rowActions', { login: account.login ?? account.id })}
              items={[
                ...(funding.canMoveMoney && funding.canFund(account)
                  ? [funding.action(account)]
                  : []),
                ...(canCreate
                  ? [
                      {
                        label: t('setProduct.action'),
                        icon: Boxes,
                        onSelect: () => setProductFor(account),
                      },
                    ]
                  : []),
                ...(canArchive
                  ? [
                      account.archivedAt
                        ? {
                            label: t('tradingAccounts.restoreAction'),
                            icon: ArchiveRestore,
                            onSelect: () => void setArchived(account, false),
                          }
                        : {
                            label: t('tradingAccounts.archiveAction'),
                            icon: Archive,
                            onSelect: () => void setArchived(account, true),
                          },
                    ]
                  : []),
              ]}
            />
          )),
        ]
      : []),
  ];

  const filtered = Boolean(table.q || environment || status || visibility === 'only');

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <TableSearch
          value={table.search}
          onChange={table.setSearch}
          label={t('clientProfile.accountsSearch')}
          placeholder={t('clientProfile.accountsSearchPlaceholder')}
        />
        <ChoiceFilter
          label={t('tradingAccounts.filterEnvironment')}
          allLabel={t('tradingAccounts.filterEnvironmentAll')}
          value={environment}
          options={[
            { value: 'live', label: t('tradingAccounts.envLive') },
            { value: 'demo', label: t('tradingAccounts.envDemo') },
          ]}
          onChange={(next) => {
            setEnvironment(next);
            table.setPage(1);
          }}
        />
        <ChoiceFilter
          label={t('tradingAccounts.filterStatus')}
          allLabel={t('tradingAccounts.filterStatusAll')}
          value={status}
          options={[
            { value: 'active', label: t('tradingAccounts.statusActive') },
            { value: 'suspended', label: t('tradingAccounts.statusSuspended') },
            { value: 'closed', label: t('tradingAccounts.statusClosed') },
          ]}
          onChange={(next) => {
            setStatus(next);
            table.setPage(1);
          }}
        />
        <ChoiceFilter
          label={t('tradingAccounts.filterVisibility')}
          allLabel={t('tradingAccounts.filterVisibilityAll')}
          value={visibility}
          options={[
            { value: 'exclude', label: t('tradingAccounts.visibilityShown') },
            { value: 'only', label: t('tradingAccounts.visibilityArchived') },
          ]}
          onChange={(next) => {
            setVisibility(next);
            table.setPage(1);
          }}
        />
        {canCreate && (
          <div className="flex gap-2 sm:ms-auto">
            <Button type="button" size="sm" variant="outline" onClick={() => setLinking(true)}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {t('clientProfile.accountsLinkExisting')}
            </Button>
            <Button type="button" size="sm" onClick={() => setOpening(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('clientProfile.accountsOpen')}
            </Button>
          </div>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('clientProfile.accountsLoading')}
        endpoints={['GET /admin/trading-accounts?userId']}
        onRetry={query.refetch}
        errorMessage={t('clientProfile.accountsLoadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('clientProfile.accountsTitle')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(account) => account.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={CandlestickChart}
              message={
                filtered ? t('clientProfile.accountsNoMatch') : t('clientProfile.accountsEmpty')
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
      <LinkAccountDialog open={linking} onClose={() => setLinking(false)} client={client} />
      <SetProductDialog account={productFor} onClose={() => setProductFor(null)} />
      {opening && (
        <OpenAccountModal
          open
          onClose={() => setOpening(false)}
          userId={userId}
          clientLabel={clientName}
        />
      )}
    </section>
  );
}
