'use client';

import { useState } from 'react';
import { Receipt } from 'lucide-react';
import api from '@/lib/api';
import type { LedgerEntry, LedgerListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Pagination } from '@/components/pagination';

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
  const [page, setPage] = useState(1);
  const [entryType, setEntryType] = useState('');
  const [userId, setUserId] = useState('');

  const trimmedUserId = userId.trim();
  const { status, data, isFetching, refetch } = useResource<LedgerListResponse>(
    ['ledger', page, entryType, trimmedUserId],
    async (signal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (entryType) params.set('entryType', entryType);
      if (trimmedUserId) params.set('userId', trimmedUserId);
      const res = await api.get<LedgerListResponse>(`/admin/ledger?${params}`, { signal });
      return res.data;
    },
  );

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<LedgerEntry>[] = [
    {
      header: 'When',
      cell: (e) => new Date(e.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: 'Type',
      cell: (e) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TYPE_STYLES[e.entryType] ?? ''}`}
        >
          {e.entryType}
        </span>
      ),
    },
    {
      header: 'Amount',
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
      header: 'Balance After',
      align: 'right',
      cell: (e) => e.balanceAfter,
      cellClassName: 'font-mono text-muted-foreground whitespace-nowrap',
    },
    {
      header: 'Caused By',
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
      header: 'Client',
      cell: (e) => (
        <button
          type="button"
          onClick={() => {
            setPage(1);
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
        <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every money movement, append-only. Each row records the running balance it produced —
          corrections are new compensating entries, never edits.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Filter by entry type"
          value={entryType}
          onChange={(e) => {
            setPage(1);
            setEntryType(e.target.value);
          }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-outline"
        >
          <option value="">All Entry Types</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Filter by client user ID"
          placeholder="Filter by user ID…"
          value={userId}
          onChange={(e) => {
            setPage(1);
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
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              noun={['entry', 'entries']}
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
