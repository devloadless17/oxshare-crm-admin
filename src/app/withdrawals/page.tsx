'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type { RejectionReason, WithdrawalListResponse, WithdrawalRow } from '@/lib/api/admin';
import { BackendPending } from '@/components/backend-pending';

// ADM-03 / §8.4 withdrawal review.
//
// MONEY RULE (ARCHITECTURE §6.1): `amount` arrives as a string and is rendered
// verbatim. Never Number(), never parseFloat, never arithmetic — a float looks
// right until the eighth decimal place.
type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const PAGE_SIZE = 25;

const STATE_META: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-warning/10 text-warning border-warning/20' },
  approved: { label: 'Approved', classes: 'bg-info/10 text-info border-info/20' },
  success: { label: 'Paid', classes: 'bg-success/10 text-success border-success/20' },
  rejected: { label: 'Rejected', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
  failure: { label: 'Failed', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'success', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<WithdrawalRow | null>(null);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [providerRef, setProviderRef] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter) params.set('state', filter);
      const { data } = await api.get<WithdrawalListResponse>(`/admin/withdrawals?${params}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setCounts(data.counts ?? {});
      setLoadState('ready');
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setLoadState(s === 404 ? 'unavailable' : 'error');
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!rejectTarget || reasons.length > 0) return;
    api.admin.getRejectionReasons('withdrawal').then(setReasons).catch(() => setReasons([]));
  }, [rejectTarget, reasons.length]);

  const errorMessage = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

  const approve = async (row: WithdrawalRow) => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/withdrawals/${row.id}/approve`);
      await load();
    } catch (e: unknown) {
      setActionError(errorMessage(e, 'Failed to approve the withdrawal.'));
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const hasReason = reasonId !== '' || reasonNote.trim() !== '';
    if (!hasReason) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/withdrawals/${rejectTarget.id}/reject`, {
        reasonId: reasonId || undefined,
        reason: reasonNote.trim() || undefined,
      });
      setRejectTarget(null);
      setReasonId('');
      setReasonNote('');
      await load();
    } catch (e: unknown) {
      setActionError(errorMessage(e, 'Failed to reject the withdrawal.'));
    } finally {
      setActionLoading(false);
    }
  };

  const settle = async () => {
    if (!settleTarget || !providerRef.trim()) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/withdrawals/${settleTarget.id}/settle`, {
        providerRef: providerRef.trim(),
      });
      setSettleTarget(null);
      setProviderRef('');
      await load();
    } catch (e: unknown) {
      setActionError(errorMessage(e, 'Failed to mark the withdrawal paid.'));
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Withdrawal Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review client withdrawals — approve, reject with a reason, or mark paid once the
          provider confirms
        </p>
      </div>

      {loadState === 'ready' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Pending Review', value: counts['pending'] ?? 0, Icon: Clock, tone: 'text-warning bg-warning/10' },
            { label: 'Approved / Paid', value: (counts['approved'] ?? 0) + (counts['success'] ?? 0), Icon: CheckCircle2, tone: 'text-success bg-success/10' },
            { label: 'Rejected / Failed', value: (counts['rejected'] ?? 0) + (counts['failure'] ?? 0), Icon: XCircle, tone: 'text-destructive bg-destructive/10' },
          ].map(({ label, value, Icon, tone }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      )}

      {loadState === 'ready' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => { setPage(1); setFilter(f.value); }}
                aria-pressed={filter === f.value}
                className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                  filter === f.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-70">
                  {f.value ? counts[f.value] ?? 0 : counts['all'] ?? 0}
                </span>
              </button>
            ))}
          </div>
          {actionError && <p className="text-xs font-semibold text-destructive" role="alert">{actionError}</p>}
        </div>
      )}

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-link" />
          <span className="sr-only">Loading withdrawal requests</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending
          endpoints={[
            'GET /admin/withdrawals',
            'PATCH /admin/withdrawals/:id/approve',
            'PATCH /admin/withdrawals/:id/reject',
            'PATCH /admin/withdrawals/:id/settle',
          ]}
        />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load withdrawal requests. Check your connection and try again.</p>
          <button type="button" onClick={load} className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <ArrowUpRight className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {filter ? 'No withdrawals in this state.' : 'No withdrawal requests yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Client</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium text-muted-foreground">Amount</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Destination</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">State</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Requested</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((w) => (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">
                        {[w.user?.firstName, w.user?.lastName].filter(Boolean).join(' ') || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">{w.user?.email}</div>
                    </td>
                    {/* Rendered verbatim — the API sends money as a string (§6.1) */}
                    <td className="px-6 py-4 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                      {w.amount} <span className="text-xs text-muted-foreground">{w.currency}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-muted-foreground max-w-[160px] truncate" title={w.destination ?? ''}>
                        {w.destination ?? '—'}
                      </div>
                      <div className="text-[11px] text-muted-foreground uppercase">{w.provider}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATE_META[w.state]?.classes ?? ''}`}>
                        {STATE_META[w.state]?.label ?? w.state}
                      </span>
                      {w.rejectionReason && (
                        <div className="mt-1 text-[11px] text-muted-foreground max-w-[200px] truncate" title={w.rejectionReason}>
                          {w.rejectionReason}
                        </div>
                      )}
                      {w.providerRef && (
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{w.providerRef}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {w.requestedAt ? new Date(w.requestedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {w.state === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => approve(w)}
                            disabled={actionLoading}
                            className="h-8 px-3 rounded-md bg-success text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => { setActionError(''); setRejectTarget(w); }}
                            disabled={actionLoading}
                            className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-50 focus-outline"
                          >
                            Reject
                          </button>
                        </div>
                      ) : w.state === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => { setActionError(''); setSettleTarget(w); }}
                          disabled={actionLoading}
                          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {w.settledAt
                            ? `Settled ${new Date(w.settledAt).toLocaleDateString()}`
                            : w.reviewedAt
                              ? `Reviewed ${new Date(w.reviewedAt).toLocaleDateString()}`
                              : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} request{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
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

      {/* Reject — reason from the configurable list (FR-ADM-03) */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => !actionLoading && setRejectTarget(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
            role="dialog" aria-modal="true" aria-labelledby="reject-withdrawal-title"
            onClick={(e) => e.stopPropagation()}>
            <h3 id="reject-withdrawal-title" className="text-base font-bold">Reject Withdrawal</h3>
            <p className="text-xs text-muted-foreground">
              {rejectTarget.user?.email} · <span className="font-mono">{rejectTarget.amount} {rejectTarget.currency}</span>.
              The hold is released, the client is emailed the reason, and they may submit a new request.
            </p>

            {reasons.length > 0 && (
              <div>
                <label htmlFor="wd-reason" className="text-xs font-semibold">Rejection Reason</label>
                <select id="wd-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-outline">
                  <option value="">Select a reason…</option>
                  {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="wd-note" className="text-xs font-semibold">
                {reasons.length > 0 ? 'Additional note (optional)' : 'Rejection reason'}
              </label>
              <textarea id="wd-note" rows={3} maxLength={500} value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-vertical focus-outline"
                placeholder="e.g. Beneficiary name does not match the account holder…" />
            </div>

            {actionError && <p className="text-xs font-semibold text-destructive" role="alert">{actionError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setRejectTarget(null)} disabled={actionLoading}
                className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline">
                Cancel
              </button>
              <button type="button" onClick={reject} aria-busy={actionLoading}
                disabled={actionLoading || (reasonId === '' && reasonNote.trim() === '')}
                className="h-9 px-4 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline">
                {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark paid — records the provider reference (§8.4 settlement) */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => !actionLoading && setSettleTarget(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
            role="dialog" aria-modal="true" aria-labelledby="settle-title"
            onClick={(e) => e.stopPropagation()}>
            <h3 id="settle-title" className="text-base font-bold">Mark Withdrawal Paid</h3>
            <p className="text-xs text-muted-foreground">
              {settleTarget.user?.email} · <span className="font-mono">{settleTarget.amount} {settleTarget.currency}</span>.
              This posts the debit to the ledger and clears the hold. It cannot be undone —
              corrections are compensating ledger entries.
            </p>
            <div>
              <label htmlFor="provider-ref" className="text-xs font-semibold">
                Provider reference <span className="text-destructive">*</span>
              </label>
              <input id="provider-ref" value={providerRef} onChange={(e) => setProviderRef(e.target.value)} autoFocus
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-mono focus-outline"
                placeholder="e.g. whish-payout-9911" />
            </div>
            {actionError && <p className="text-xs font-semibold text-destructive" role="alert">{actionError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSettleTarget(null)} disabled={actionLoading}
                className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline">
                Cancel
              </button>
              <button type="button" onClick={settle} disabled={actionLoading || !providerRef.trim()} aria-busy={actionLoading}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline">
                {actionLoading ? 'Posting…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
