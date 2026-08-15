'use client';

import * as React from 'react';
import { Inbox } from 'lucide-react';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import type { BridgeOutbox } from '@/lib/api/admin';
import { t } from '@/lib/i18n';
import { StatCard, StatusBanner } from '@/app/(console)/bridge/page';

type OutboxRow = BridgeOutbox['rows'][number];

/**
 * The bridge's deal delivery queue.
 *
 * ## `failing` is the number, not `pending`
 *
 * A pending row may simply be new and about to go out; a failing one has been
 * attempted and rejected. Alerting on `pending` cries wolf on any healthy busy
 * system, which is how an alert stops being read. The banner and the "bad" tone
 * therefore key off `failing` alone.
 *
 * ## The queue is not a backlog of lost work
 *
 * A failing row is not a dropped deal — the dispatcher keeps retrying with
 * backoff, and the whole reason the outbox exists is that a deal survives the
 * CRM being down. The copy says "not here yet" rather than "lost", because an
 * operator who reads this as data loss starts a recovery nobody needs.
 */
export function BridgeOutboxPanel({
  data,
  dimmed,
  pendingOnly,
  onPendingOnlyChange,
}: {
  data: BridgeOutbox | undefined;
  dimmed: boolean;
  pendingOnly: boolean;
  onPendingOnlyChange: (value: boolean) => void;
}) {
  const columns = React.useMemo(() => buildColumns(), []);

  if (!data) return null;

  const { summary, rows } = data;
  const healthy = summary.failing === 0;

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner
        healthy={healthy}
        message={
          healthy
            ? t('bridge.outbox.healthy')
            : t('bridge.outbox.unhealthy', { count: summary.failing })
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('bridge.outbox.total')} value={summary.total} />
        <StatCard label={t('bridge.outbox.delivered')} value={summary.delivered} tone="good" />
        <StatCard label={t('bridge.outbox.pending')} value={summary.pending} />
        <StatCard
          label={t('bridge.outbox.failing')}
          value={summary.failing}
          hint={t('bridge.outbox.failingHint')}
          // Only red when there IS something failing. A permanent red zero is a
          // warning light that is always on, which is one nobody looks at.
          tone={summary.failing > 0 ? 'bad' : 'neutral'}
        />
      </div>

      <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={pendingOnly}
          onChange={(event) => onPendingOnlyChange(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-border"
        />
        {t('bridge.outbox.pendingOnly')}
      </label>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.dealId}
        dimmed={dimmed}
        empty={
          <EmptyState
            icon={Inbox}
            message={pendingOnly ? t('bridge.outbox.emptyPending') : t('bridge.outbox.empty')}
          />
        }
        clientPagination={{ pageSize: 25, noun: ['deal', 'deals'] }}
      />
    </div>
  );
}

function buildColumns(): Column<OutboxRow>[] {
  return [
    {
      header: t('bridge.col.deal'),
      // Monospace: a ticket is an identifier somebody compares against MT5 by
      // eye, and proportional digits make that harder than it needs to be.
      cell: (row) => <span className="font-mono text-xs tabular-nums">{row.dealId}</span>,
    },
    {
      header: t('bridge.col.source'),
      cell: (row) => <span className="text-muted-foreground">{row.source}</span>,
    },
    {
      header: t('bridge.col.attempts'),
      align: 'right',
      sortable: true,
      sortKey: 'attempts',
      sortType: 'number',
      cell: (row) => (
        <span className={`tabular-nums ${row.attempts > 1 ? 'text-warning' : ''}`}>
          {row.attempts}
        </span>
      ),
    },
    {
      header: t('bridge.col.delivered'),
      sortable: true,
      sortKey: 'deliveredAt',
      sortType: 'date',
      /*
       * The delivered TIME, not a tick. "When did this reach us" is the question
       * a disputed commission actually asks, and a checkmark cannot answer it.
       * Undelivered rows read as unresolved rather than blank.
       */
      cell: (row) =>
        row.deliveredAt ? (
          <span className="whitespace-nowrap tabular-nums text-success">
            {formatTime(row.deliveredAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('bridge.value.unresolved')}</span>
        ),
    },
    {
      header: t('bridge.col.error'),
      /*
       * Truncated with the full text on hover. These are provider sentences and
       * HTTP bodies — one can be several hundred characters, and left to wrap it
       * makes this column taller than the rest of the table put together.
       */
      cell: (row) =>
        row.lastError ? (
          <span
            className="block max-w-[28rem] truncate text-xs text-destructive"
            title={row.lastError}
          >
            {row.lastError}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('bridge.value.none')}</span>
        ),
    },
    {
      header: t('bridge.col.created'),
      align: 'right',
      sortable: true,
      sortKey: 'createdAt',
      sortType: 'date',
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
  ];
}

/**
 * 24-hour local time, for the reason the portal's account history carries:
 * newest-first rows crossing midnight read as scrambled on a 12-hour clock,
 * because `11:41 PM` sits below `1:30 AM` and looks out of order.
 */
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t('bridge.value.none')
    : date.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
}
