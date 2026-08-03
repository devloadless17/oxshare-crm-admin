'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import api from '@/lib/api';
import type { LedgerEntry, LedgerListResponse } from '@/lib/api/admin';
import { BackendPending } from '@/components/backend-pending';

// ADM-13: the ledger view, filterable for reconciliation.
//
// This screen is READ ONLY by design, not by omission: ARCHITECTURE §6.4 makes
// ledger_entries append-only (a database trigger rejects UPDATE and DELETE).
// A wrong balance is fixed with a compensating entry, never by editing history.
//
// MONEY RULE §6.1: amount and balanceAfter arrive as strings and are rendered
// verbatim. No Number(), no arithmetic — a float looks right until the eighth
// decimal place.
type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

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
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entryType, setEntryType] = useState('');
  const [userId, setUserId] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (entryType) params.set('entryType', entryType);
      if (userId.trim()) params.set('userId', userId.trim());
      const { data } = await api.get<LedgerListResponse>(`/admin/ledger?${params}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setLoadState('ready');
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setLoadState(s === 404 ? 'unavailable' : 'error');
    }
  }, [page, entryType, userId]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          onChange={(e) => { setPage(1); setEntryType(e.target.value); }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-outline"
        >
          <option value="">All Entry Types</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Filter by client user ID"
          placeholder="Filter by user ID…"
          value={userId}
          onChange={(e) => { setPage(1); setUserId(e.target.value); }}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-sm placeholder:font-sans placeholder:text-muted-foreground focus-outline"
        />
      </div>

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-link" />
          <span className="sr-only">Loading ledger</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending endpoints={['GET /admin/ledger?userId&walletId&entryType&page&limit']} />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load the ledger. Check your connection and try again.</p>
          <button type="button" onClick={load} className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {entryType || userId ? 'No entries match these filters.' : 'No ledger entries yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Append-only ledger entries</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">When</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium text-muted-foreground">Amount</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium text-muted-foreground">Balance After</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Caused By</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors align-top">
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TYPE_STYLES[e.entryType] ?? ''}`}>
                        {e.entryType}
                      </span>
                    </td>
                    {/* Strings, rendered verbatim (§6.1) */}
                    <td className={`px-6 py-4 text-right font-mono font-semibold whitespace-nowrap ${isDebit(e.amount) ? 'text-destructive' : 'text-success'}`}>
                      {e.amount} <span className="text-xs text-muted-foreground">{e.currency}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {e.balanceAfter}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-foreground">{e.referenceType}</div>
                      <div className="font-mono text-[11px] text-muted-foreground max-w-[180px] truncate" title={e.referenceId}>
                        {e.referenceId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => { setPage(1); setUserId(e.userId); }}
                        title="Filter this client's entries"
                        className="font-mono text-[11px] text-link hover:underline max-w-[160px] truncate block focus-outline"
                      >
                        {e.userId}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} entr{total === 1 ? 'y' : 'ies'} · page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline">
                Previous
              </button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline">
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
