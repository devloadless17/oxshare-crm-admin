'use client';

import * as React from 'react';
import { Activity, History, Receipt } from 'lucide-react';
import api from '@/lib/api';
import type { ClientPositionRow, ClientTransactionRow } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { formatDecimal, formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The client's own trading and money history, as two tables.
 *
 * ## Why these are the profile's problem at all
 *
 * "What is this client doing" was answerable only from the trading-accounts
 * list, which says how many logins they hold and nothing about what happened on
 * them. An operator investigating a complaint had to leave the profile, filter
 * a global list by a uuid they had to copy, and come back.
 *
 * ## `profit` means two different things
 *
 * One column on `positions` carries the FLOATING result while a trade is open
 * and the REALISED one once it closes. The tables are therefore split by status
 * rather than merged with a status column: the header can then say which number
 * it is showing, instead of a single "P/L" heading that silently means both.
 */

const PAGE_SIZE = 10;

/** Money and prices are STRINGS end to end — §6.1. `Number()` is a lint error. */
function Signed({ value, currency }: { value: string | null; currency: string }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  // String comparison, not `Number(value) < 0`: the coercion this repo bans is
  // banned here too, and a leading '-' is all the sign test needs.
  const negative = value.trimStart().startsWith('-');
  const zero = isZeroMoney(value);
  return (
    <span
      className={`tabular font-semibold ${
        zero ? '' : negative ? 'text-destructive' : 'text-success'
      }`}
    >
      {formatMoney(value, currency)}
    </span>
  );
}

export function ClientPositionsPanel({
  userId,
  status,
}: {
  userId: string;
  /** Open and closed are separate tables — see the note on `profit`. */
  status: 'open' | 'closed';
}) {
  const [page, setPage] = React.useState(1);

  const query = useResource(
    keys.clients.positions(userId, status, page),
    (signal) => api.admin.getClientPositions(userId, { status, page, limit: PAGE_SIZE }, signal),
    { enabled: Boolean(userId) },
  );

  const columns: Column<ClientPositionRow>[] = [
    {
      header: t('clientProfile.posSymbol'),
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-semibold">{row.symbol}</span>
          <span className="ms-2 font-mono text-[10px] text-muted-foreground">{row.ticket}</span>
        </div>
      ),
    },
    {
      header: t('clientProfile.posSide'),
      cell: (row) => (
        <Badge variant={row.side === 'buy' ? 'success' : 'destructive'} className="uppercase">
          {row.side}
        </Badge>
      ),
    },
    {
      header: t('clientProfile.posVolume'),
      align: 'right',
      // Lots, not money — trimmed of the storage scale for reading.
      cell: (row) => <span className="tabular">{formatDecimal(row.volume)}</span>,
    },
    {
      header: t('clientProfile.posAccount'),
      cell: (row) => <span className="font-mono text-xs">{row.login ?? '—'}</span>,
    },
    {
      header: t('clientProfile.posOpenPrice'),
      align: 'right',
      cell: (row) => <span className="tabular text-xs">{formatDecimal(row.openPrice)}</span>,
    },
    ...(status === 'closed'
      ? [
          {
            header: t('clientProfile.posClosePrice'),
            align: 'right' as const,
            cell: (row: ClientPositionRow) => (
              <span className="tabular text-xs">
                {row.closePrice ? formatDecimal(row.closePrice) : '—'}
              </span>
            ),
          },
        ]
      : []),
    {
      // The whole reason the two tables are separate: this heading is honest
      // only because the status is fixed for the table it sits on.
      header: status === 'open' ? t('clientProfile.posFloating') : t('clientProfile.posRealised'),
      align: 'right',
      cell: (row) => <Signed value={row.profit} currency={row.currency} />,
    },
    {
      header: status === 'open' ? t('clientProfile.posOpened') : t('clientProfile.posClosed'),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(
            status === 'open' ? row.openedAt : (row.closedAt ?? row.openedAt),
          ).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <AsyncBoundary
      status={query.status}
      label={t('clientProfile.posLoading')}
      endpoints={['GET /admin/clients/:id/positions']}
      onRetry={query.refetch}
      errorMessage={t('clientProfile.posLoadFailed')}
      error={query.error}
      fill
    >
      <DataTable
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        fill
        loading={query.status === 'loading'}
        /*
         * `EmptyState`, not a bare string — every other table in the console
         * passes this. A string lands in the empty cell as raw text, aligned
         * left with the first column; `EmptyState` centres itself and carries
         * an icon saying which table is empty.
         */
        empty={
          <EmptyState
            icon={status === 'open' ? Activity : History}
            message={
              status === 'open' ? t('clientProfile.posNoneOpen') : t('clientProfile.posNoneClosed')
            }
          />
        }
        /*
         * The table's OWN footer, rather than a `<Pagination>` beneath it. Two
         * pagers rendered before: the built-in strip inside the frame reading
         * "Showing all 0", and a second outside it with its own row-size
         * picker — the same list with two sets of controls.
         */
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: query.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </AsyncBoundary>
  );
}

export function ClientTransactionsPanel({ userId }: { userId: string }) {
  const [page, setPage] = React.useState(1);

  const query = useResource(
    keys.clients.transactions(userId, page),
    (signal) => api.admin.getClientTransactions(userId, { page, limit: PAGE_SIZE }, signal),
    { enabled: Boolean(userId) },
  );

  const columns: Column<ClientTransactionRow>[] = [
    {
      header: t('clientProfile.txDirection'),
      cell: (row) => (
        <Badge
          variant={
            row.direction === 'deposit'
              ? 'success'
              : row.direction === 'withdrawal'
                ? 'warning'
                : 'tag'
          }
          className="capitalize"
        >
          {row.direction}
        </Badge>
      ),
    },
    {
      header: t('clientProfile.txAmount'),
      align: 'right',
      cell: (row) => (
        <span className="tabular font-semibold">{formatMoney(row.amount, row.currency)}</span>
      ),
    },
    {
      header: t('clientProfile.txState'),
      cell: (row) => (
        /*
         * Against the REAL enum: pending · approved · success · failure ·
         * rejected. This tested `'settled'` and `'failed'`, neither of which
         * exists — so a failed transaction rendered amber like a pending one,
         * and every `success` row fell through to amber too.
         *
         * `approved` and `success` share the good colour because they are the
         * same outcome: approving a withdrawal pays it, and `approved` is only
         * where rows landed before the two steps became one.
         */
        <Badge
          variant={
            row.state === 'approved' || row.state === 'success'
              ? 'success'
              : row.state === 'rejected' || row.state === 'failure'
                ? 'destructive'
                : 'warning'
          }
          className="capitalize"
        >
          {row.state}
        </Badge>
      ),
    },
    {
      header: t('clientProfile.txMethod'),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.methodKey ?? row.provider ?? '—'}
        </span>
      ),
    },
    {
      header: t('clientProfile.txCreated'),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <AsyncBoundary
      status={query.status}
      label={t('clientProfile.txLoading')}
      endpoints={['GET /admin/clients/:id/transactions']}
      onRetry={query.refetch}
      errorMessage={t('clientProfile.txLoadFailed')}
      error={query.error}
      fill
    >
      <DataTable
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        fill
        loading={query.status === 'loading'}
        empty={<EmptyState icon={Receipt} message={t('clientProfile.txNone')} />}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: query.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </AsyncBoundary>
  );
}
