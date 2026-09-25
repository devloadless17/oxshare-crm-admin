'use client';

import { Server } from 'lucide-react';
import api from '@/lib/api';
import type { Mt5GroupRow } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * MT5 groups — the groups the server currently reports, as the group sync
 * mirrored them.
 *
 * ## From the mirror, never live
 *
 * `GET /admin/mt5-groups` reads `mt5_groups`, the table the scheduled sync
 * fills (`MT5_GROUP_SYNC_CRON`). A reference screen that went blank whenever
 * the bridge was unreachable would fail exactly when an operator comes to look,
 * so this one always answers.
 *
 * ## What is not here, on the owner's call (25 Sep 2026)
 *
 * No "last seen" column and no removed groups. The screen lists what MT5 holds
 * today; a group the server stopped reporting stays in the mirror (so it can be
 * restored if it comes back) and is simply not shown.
 *
 * ## Nothing here writes
 *
 * Which product sells a group is edited on the product form, where the group
 * picker lives. A second place to attach groups would be two places for the
 * mapping every account-open reads to disagree.
 */
const GROUP_PAGING = { noun: ['group', 'groups'] as [string, string] };

export default function Mt5GroupsPage() {
  const query = useResource<Mt5GroupRow[]>(keys.mt5Groups.all(), (signal) =>
    api.admin.getMt5GroupMirror(signal),
  );

  const columns: Column<Mt5GroupRow>[] = [
    {
      header: t('mt5Groups.colName'),
      /* The PATH, exactly — backslashes and all. The bridge matches on it. */
      cell: (group) => <span className="font-mono text-xs font-semibold">{group.name}</span>,
      sortable: true,
      sortKey: 'name',
    },
    {
      header: t('mt5Groups.colCurrency'),
      cell: (group) => group.currency,
      sortable: true,
      sortKey: 'currency',
    },
    {
      header: t('mt5Groups.colLeverage'),
      cell: (group) =>
        group.leverageDefault === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          t('mt5Groups.leverageRatio', { ratio: String(group.leverageDefault) })
        ),
      cellClassName: 'tabular',
      align: 'right',
      sortable: true,
      sortKey: 'leverageDefault',
      sortType: 'number',
    },
    {
      header: t('mt5Groups.colProducts'),
      /*
       * EVERY product that sells the group — several since backend 0142.
       * "Not assigned" is called out: a group no product sells is one no client
       * can open an account in from the portal, which is either intended or the
       * reason somebody is on this page.
       */
      cell: (group) =>
        group.products.length === 0 ? (
          <span className="text-muted-foreground">{t('mt5Groups.notSold')}</span>
        ) : (
          group.products
            .map((product) =>
              t('mt5Groups.productEnv', {
                product: product.name,
                environment:
                  product.environment === 'live' ? t('mt5Groups.envLive') : t('mt5Groups.envDemo'),
              }),
            )
            .join(', ')
        ),
    },
    {
      header: t('mt5Groups.colAccounts'),
      cell: (group) => group.accountCount,
      cellClassName: 'tabular',
      align: 'right',
      sortable: true,
      sortKey: 'accountCount',
      sortType: 'number',
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('mt5Groups.pageTitle')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('mt5Groups.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('mt5Groups.loading')}
        endpoints={['GET /admin/mt5-groups']}
        onRetry={query.refetch}
        errorMessage={t('mt5Groups.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          caption={t('mt5Groups.pageTitle')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(group) => group.name}
          dimmed={query.isFetching}
          clientPagination={GROUP_PAGING}
          fill
          empty={<EmptyState icon={Server} message={t('mt5Groups.empty')} />}
        />
      </AsyncBoundary>
    </div>
  );
}
