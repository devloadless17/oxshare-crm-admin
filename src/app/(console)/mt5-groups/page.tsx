'use client';

import * as React from 'react';
import { Server } from 'lucide-react';
import api from '@/lib/api';
import type { Mt5GroupRow } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Checkbox } from '@/components/ui/checkbox';
import { relativeTime } from '@/lib/relative-time';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * MT5 groups — what the server reports, as the group sync last mirrored it.
 *
 * ## From the mirror, never live
 *
 * `GET /admin/mt5-groups` reads `mt5_groups`, the table the scheduled sync
 * fills (`MT5_GROUP_SYNC_CRON`). A reference screen that went blank whenever
 * the bridge was unreachable would fail exactly when an operator comes to look,
 * so this one always answers — and says, per row and in the header, how recently
 * the server confirmed what it shows.
 *
 * ## Removed groups are hidden by default, not dropped
 *
 * A group the server stopped reporting is kept in the mirror (accounts opened
 * in it still exist). It is behind a checkbox so the default view is what the
 * server holds today, and one click away when somebody asks where an account's
 * group went.
 *
 * ## Nothing here writes
 *
 * Which product sells a group is edited on the product form, where the group
 * picker lives. A second place to attach groups would be two places for the
 * mapping every account-open reads to disagree.
 */
const GROUP_PAGING = { noun: ['group', 'groups'] as [string, string] };

export default function Mt5GroupsPage() {
  const [showRemoved, setShowRemoved] = React.useState(false);

  const query = useResource<Mt5GroupRow[]>(keys.mt5Groups.all(), (signal) =>
    api.admin.getMt5GroupMirror(signal),
  );

  const all = React.useMemo(() => query.data ?? [], [query.data]);
  const removedCount = all.filter((group) => group.removedAt !== null).length;
  const rows = showRemoved ? all : all.filter((group) => group.removedAt === null);

  /*
   * The newest confirmation among the groups still on the server — which is
   * when the sync last reached MT5 successfully, since every run stamps every
   * group it sees.
   */
  const lastSynced = all
    .filter((group) => group.removedAt === null)
    .map((group) => String(group.lastSeenAt))
    .sort()
    .at(-1);

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
      header: t('mt5Groups.colProduct'),
      /*
       * "Not assigned" is called out: a group no product sells is one no client
       * can open an account in from the portal, which is either intended or the
       * reason somebody is on this page.
       */
      cell: (group) =>
        group.product === null ? (
          <span className="text-muted-foreground">{t('mt5Groups.notSold')}</span>
        ) : (
          t('mt5Groups.productEnv', {
            product: group.product.name,
            environment:
              group.product.environment === 'live'
                ? t('mt5Groups.envLive')
                : t('mt5Groups.envDemo'),
          })
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
    {
      header: t('mt5Groups.colStatus'),
      cell: (group) =>
        group.removedAt === null ? (
          <span className="text-success">{t('mt5Groups.statusActive')}</span>
        ) : (
          <span className="text-warning">{t('mt5Groups.statusRemoved')}</span>
        ),
    },
    {
      header: t('mt5Groups.colLastSeen'),
      cell: (group) => (
        <span
          className="text-muted-foreground"
          title={new Date(String(group.lastSeenAt)).toLocaleString()}
        >
          {relativeTime(String(group.lastSeenAt))}
        </span>
      ),
      sortable: true,
      sortKey: 'lastSeenAt',
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('mt5Groups.pageTitle')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('mt5Groups.subtitle')}</p>
          {lastSynced && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('mt5Groups.lastSynced', { when: relativeTime(lastSynced) })}
            </p>
          )}
        </div>

        {removedCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <Checkbox
              checked={showRemoved}
              onCheckedChange={(checked) => setShowRemoved(checked === true)}
              aria-label={t('mt5Groups.showRemoved')}
            />
            {t('mt5Groups.showRemoved')} ({removedCount})
          </label>
        )}
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
          rows={rows}
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
