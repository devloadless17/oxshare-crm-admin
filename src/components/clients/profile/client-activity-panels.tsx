'use client';

import * as React from 'react';
import { History, Receipt } from 'lucide-react';
import api from '@/lib/api';
import {
  MANUAL_ADMIN_PROVIDER,
  type ClientClosedPositionRow,
  type ClientTransactionRow,
} from '@/lib/api/admin';
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
 * Positions are CLOSED ones only (owner, 26 Sep 2026), so the P/L column is
 * always the realised result — see `ClientClosedPositionsPanel`.
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

/**
 * The client's CLOSED positions, on every account they hold, live and demo.
 *
 * Open positions are not listed on the profile (owner, 26 Sep 2026). What is
 * here comes from the ingested MT5 deals — the same rows the portal's account
 * history and the commission engine read — one row per closing deal, with its
 * opening deal's price and time when those were ingested too.
 *
 * Commission and swap get their own columns. MT5 takes both from the client
 * on top of the trade's result, and "why is my balance $3 short" is answered
 * by the commission column, not by the P/L.
 */
export function ClientClosedPositionsPanel({ userId }: { userId: string }) {
  const [page, setPage] = React.useState(1);

  const query = useResource(
    keys.clients.closedPositions(userId, page),
    (signal) => api.admin.getClientClosedPositions(userId, { page, limit: PAGE_SIZE }, signal),
    { enabled: Boolean(userId) },
  );

  const columns: Column<ClientClosedPositionRow>[] = [
    {
      header: t('clientProfile.posSymbol'),
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-semibold">{row.symbol}</span>
          {/* The MT5 position id is what a dealer searches the terminal by. */}
          <span className="ms-2 font-mono text-[10px] text-muted-foreground">
            {row.positionId ?? row.ticket}
          </span>
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
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-xs">{row.login}</span>
          {row.environment === 'demo' && (
            <Badge variant="outline">{t('clientProfile.posDemo')}</Badge>
          )}
        </span>
      ),
    },
    {
      header: t('clientProfile.posOpenPrice'),
      align: 'right',
      cell: (row) => (
        <span className="tabular text-xs">
          {row.openPrice ? formatDecimal(row.openPrice) : '—'}
        </span>
      ),
    },
    {
      header: t('clientProfile.posClosePrice'),
      align: 'right',
      cell: (row) => <span className="tabular text-xs">{formatDecimal(row.closePrice)}</span>,
    },
    {
      header: t('clientProfile.posCommission'),
      align: 'right',
      cell: (row) => <Signed value={row.commission} currency={row.currency} />,
    },
    {
      header: t('clientProfile.posSwap'),
      align: 'right',
      cell: (row) => <Signed value={row.swap} currency={row.currency} />,
    },
    {
      header: t('clientProfile.posRealised'),
      align: 'right',
      cell: (row) => <Signed value={row.profit} currency={row.currency} />,
    },
    {
      header: t('clientProfile.posOpened'),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.openedAt ? new Date(row.openedAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      header: t('clientProfile.posClosed'),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.closedAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <AsyncBoundary
      status={query.status}
      label={t('clientProfile.posLoading')}
      endpoints={['GET /admin/clients/:id/closed-positions']}
      onRetry={query.refetch}
      errorMessage={t('clientProfile.posLoadFailed')}
      error={query.error}
      fill
    >
      <DataTable
        caption={t('clientProfile.posClosedTitle')}
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        fill
        loading={query.status === 'loading'}
        empty={<EmptyState icon={History} message={t('clientProfile.posNoneClosed')} />}
        /*
         * The table's OWN footer, rather than a `<Pagination>` beneath it — one
         * set of controls for one list.
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

/**
 * What a movement went through, in words (owner, 26 Sep 2026).
 *
 * This printed `methodKey ?? provider` — `manual_admin`, `whish` — machine
 * keys nobody on the desk should have to read. The server now sends the
 * method's display name for a deposit or a withdrawal that went through one;
 * money that went through NO method is named from its provider, the one set of
 * values a screen may recognise (see MANUAL_ADMIN_PROVIDER). Anything else is
 * the provider made readable, never a blank: an unknown source is still a
 * source.
 */
export function transactionMethodLabel(
  row: Pick<ClientTransactionRow, 'methodName' | 'methodKey' | 'provider'>,
): string {
  if (row.methodName) return row.methodName;
  switch (row.provider) {
    case MANUAL_ADMIN_PROVIDER:
      return t('financial.methodManualCredit');
    case 'transfer':
      return t('clientProfile.txMethodTransfer');
    case 'commission':
      return t('clientProfile.txMethodCommission');
    default: {
      const raw = row.provider ?? row.methodKey;
      if (!raw) return '—';
      const words = raw.replace(/[_-]+/g, ' ').trim();
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
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
        // The raw provider stays on hover, for whoever is tracing the row.
        <span className="text-xs text-muted-foreground" title={row.provider ?? undefined}>
          {transactionMethodLabel(row)}
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
