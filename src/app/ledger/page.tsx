'use client';

import { useState } from 'react';
import { Receipt } from 'lucide-react';
import api from '@/lib/api';
import type { LedgerEntry, LedgerListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { CursorPagination } from '@/components/cursor-pagination';
import { useCursorPages } from '@/hooks/use-cursor-pages';
import { t } from '@/lib/i18n';

// ADM-13: the ledger view, filterable for reconciliation.
//
// This screen is READ ONLY by design, not by omission: ARCHITECTURE §6.4 makes
// ledger_entries append-only (a database trigger rejects UPDATE and DELETE).
// A wrong balance is fixed with a compensating entry, never by editing history.
//
// MONEY RULE §6.1: amount and balanceAfter arrive as strings and are rendered
// verbatim. No Number(), no arithmetic — a float looks right until the eighth
// decimal place.
const PAGE_SIZE = 50;

const ENTRY_TYPES = ['deposit', 'withdrawal', 'commission', 'rebate', 'payout', 'adjustment'];

const TYPE_STYLES: Record<string, string> = {
  deposit: 'bg-success/10 text-success border-success/20',
  withdrawal: 'bg-warning/10 text-warning border-warning/20',
  commission: 'bg-info/10 text-info border-info/20',
  rebate: 'bg-primary/10 text-link border-primary/20',
  payout: 'bg-destructive/10 text-destructive border-destructive/20',
  adjustment: 'bg-muted text-muted-foreground border-border',
};

/** A leading '-' is the only thing we read from the string — never parsed. */
const isDebit = (amount: string) => amount.trim().startsWith('-');

export default function LedgerPage() {
  /*
   * Cursor navigation, not numbered pages — PLATFORM-CONVENTIONS R-2.4.
   *
   * The ledger is append-only and never stops growing, and it is the list used
   * FOR reconciliation (ADM-13): a page that silently skips an entry means
   * balancing against the wrong set of rows.
   *
   * "Jump to page N" is gone because a cursor names a row rather than an
   * ordinal. Filters are the real navigation here.
   */
  const pages = useCursorPages();
  const [entryType, setEntryType] = useState('');
  const [userId, setUserId] = useState('');

  const trimmedUserId = userId.trim();
  const { status, data, isFetching, refetch } = useResource<LedgerListResponse>(
    ['ledger', pages.cursor ?? 'first', entryType, trimmedUserId],
    async (signal) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pages.cursor) params.set('cursor', pages.cursor);
      if (entryType) params.set('entryType', entryType);
      if (trimmedUserId) params.set('userId', trimmedUserId);
      const res = await api.get<LedgerListResponse>(`/admin/ledger?${params}`, { signal });
      return res.data;
    },
  );

  const rows = data?.items ?? [];
  // `nextCursor`, not `total`: the server only counts on request, because
  // counting is a full scan of the filtered set (R-2.4).
  const nextCursor = data?.nextCursor ?? null;

  const columns: Column<LedgerEntry>[] = [
    {
      header: t('ledger.colWhen'),
      cell: (e) => new Date(e.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('ledger.colType'),
      cell: (e) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TYPE_STYLES[e.entryType] ?? ''}`}
        >
          {e.entryType}
        </span>
      ),
    },
    {
      header: t('ledger.colAmount'),
      align: 'right',
      // Strings, rendered verbatim (§6.1).
      cell: (e) => (
        <span className={isDebit(e.amount) ? 'text-destructive' : 'text-success'}>
          {e.amount} <span className="text-xs text-muted-foreground">{e.currency}</span>
        </span>
      ),
      cellClassName: 'font-mono font-semibold whitespace-nowrap',
    },
    {
      header: t('ledger.colBalanceAfter'),
      align: 'right',
      // Deliberately UNformatted, unlike the withdrawals queue.
      //
      // This is the reconciliation view (ADM-13): ARCHITECTURE §11 requires the
      // ledger sum to equal the wallet balance "to the cent", and accruals carry
      // real precision at the 8th decimal. Rounding to 2dp for readability here
      // would hide the digits someone is looking at this screen to check.
      cell: (e) => e.balanceAfter,
      cellClassName: 'font-mono text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('ledger.colCausedBy'),
      cell: (e) => (
        <>
          <div className="text-xs text-foreground">{e.referenceType}</div>
          <div
            className="font-mono text-[11px] text-muted-foreground max-w-[180px] truncate"
            title={e.referenceId}
          >
            {e.referenceId}
          </div>
        </>
      ),
    },
    {
      header: t('ledger.colClient'),
      cell: (e) => (
        <button
          type="button"
          onClick={() => {
            pages.reset();
            setUserId(e.userId);
          }}
          title="Filter this client's entries"
          className="font-mono text-[11px] text-link hover:underline max-w-[160px] truncate block focus-outline"
        >
          {e.userId}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('ledger.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('ledger.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={entryType || 'all'}
          onValueChange={(val) => {
            pages.reset();
            setEntryType(val === 'all' ? '' : val);
          }}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="All Entry Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('ledger.allTypes')}</SelectItem>
            {ENTRY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="search"
          aria-label="Filter by client user ID"
          placeholder={t('ledger.filterUser')}
          value={userId}
          onChange={(e) => {
            pages.reset();
            setUserId(e.target.value);
          }}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-sm placeholder:font-sans placeholder:text-muted-foreground focus-outline"
        />
      </div>

      <AsyncBoundary
        status={status}
        label="Loading ledger"
        endpoints={['GET /admin/ledger?userId&walletId&entryType&page&limit']}
        onRetry={refetch}
        errorMessage="Failed to load the ledger."
      >
        <DataTable
          caption="Append-only ledger entries"
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          dimmed={isFetching}
          empty={
            <EmptyState
              icon={Receipt}
              message={
                entryType || trimmedUserId
                  ? 'No entries match these filters.'
                  : 'No ledger entries yet.'
              }
            />
          }
        />
        {rows.length > 0 && (
          <div className="mt-6">
            <CursorPagination
              pageNumber={pages.pageNumber}
              pageSize={PAGE_SIZE}
              showing={rows.length}
              canGoBack={pages.canGoBack}
              canGoForward={Boolean(nextCursor)}
              onBack={pages.goBack}
              onNext={() => pages.goNext(nextCursor)}
              noun={['entry', 'entries']}
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
