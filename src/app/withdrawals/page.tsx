'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { BackendPending } from '@/components/backend-pending';

// ADM-03: withdrawal handling — approve, or reject with a reason from a configurable
// list (+ email to client, sent by the backend). Endpoint contracts are assumed and
// logged in docs/DECISIONS.md (D-31). Money rule: amounts are STRINGS across the API
// boundary (ARCHITECTURE §6) — rendered verbatim, never parsed into floats.
interface WithdrawalRow {
  id: string;
  user?: { email: string; firstName?: string; lastName?: string };
  amount: string;
  currency: 'USD' | 'USDT';
  method: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requestedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

interface RejectionReason {
  id: string;
  label: string;
}

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const STATUS_META: Record<WithdrawalRow['status'], { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-warning/10 text-warning border-warning/20' },
  approved: { label: 'Approved', classes: 'bg-info/10 text-info border-info/20' },
  rejected: { label: 'Rejected', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
  paid: { label: 'Paid', classes: 'bg-success/10 text-success border-success/20' },
};

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [filter, setFilter] = useState('');

  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const { data } = await api.get<WithdrawalRow[]>('/admin/withdrawals');
      setRows(data ?? []);
      setLoadState('ready');
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setLoadState(s === 404 ? 'unavailable' : 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The FSD requires rejection reasons from a configurable list; fall back to free
  // text while GET /admin/rejection-reasons does not exist (DECISIONS D-27).
  useEffect(() => {
    if (!rejectTarget) return;
    api.get<RejectionReason[]>('/admin/rejection-reasons?context=withdrawal')
      .then((r) => setReasons(r.data ?? []))
      .catch(() => setReasons([]));
  }, [rejectTarget]);

  const errorMessage = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

  const approve = async (row: WithdrawalRow) => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/withdrawals/${row.id}/approve`);
      await load();
    } catch (e: unknown) {
      setActionError(errorMessage(e, `Failed to approve the withdrawal for ${row.user?.email ?? 'this client'}.`));
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const reason = reasons.length > 0 ? reasons.find((r) => r.id === reasonId)?.label : reasonText.trim();
    if (!reason) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/withdrawals/${rejectTarget.id}/reject`, {
        reasonId: reasonId || undefined,
        reason,
      });
      setRejectTarget(null);
      setReasonId('');
      setReasonText('');
      await load();
    } catch (e: unknown) {
      setActionError(errorMessage(e, 'Failed to reject the withdrawal. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = filter ? rows.filter((r) => r.status === filter) : rows;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;
  const paidCount = rows.filter((r) => r.status === 'paid' || r.status === 'approved').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Withdrawal Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review client and IB withdrawal requests — approve, or reject with a reason
        </p>
      </div>

      {loadState === 'ready' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending Requests</p>
              <p className="text-2xl font-bold mt-1">{pendingCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Approved / Paid</p>
              <p className="text-2xl font-bold mt-1">{paidCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Rejected</p>
              <p className="text-2xl font-bold mt-1">{rejectedCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <XCircle className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      {loadState === 'ready' && (
        <div className="flex items-center gap-3">
          <select
            aria-label="Filter by status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
          </select>
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
            'GET /admin/rejection-reasons?context=withdrawal',
          ]}
        />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load withdrawal requests. Check your connection and try again.</p>
          <button type="button" onClick={load} className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <ArrowUpRight className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {filter ? `No ${STATUS_META[filter as WithdrawalRow['status']]?.label.toLowerCase() ?? filter} withdrawals.` : 'No withdrawal requests yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Client</th>
                <th scope="col" className="px-6 py-3 text-right font-medium text-muted-foreground">Amount</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Method</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Requested</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">
                      {[w.user?.firstName, w.user?.lastName].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">{w.user?.email}</div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-semibold text-foreground">
                    {w.amount} <span className="text-xs text-muted-foreground">{w.currency}</span>
                  </td>
                  <td className="px-6 py-4 capitalize text-muted-foreground">{w.method}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[w.status]?.classes ?? ''}`}>
                      {STATUS_META[w.status]?.label ?? w.status}
                    </span>
                    {w.status === 'rejected' && w.rejectionReason && (
                      <div className="mt-1 text-[11px] text-muted-foreground max-w-[220px] truncate" title={w.rejectionReason}>
                        {w.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {w.requestedAt ? new Date(w.requestedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    {w.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => approve(w)}
                          disabled={actionLoading}
                          className="h-8 px-3 rounded-md bg-success text-success-foreground text-xs font-semibold hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActionError(''); setRejectTarget(w); }}
                          disabled={actionLoading}
                          className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {w.reviewedAt ? `Reviewed ${new Date(w.reviewedAt).toLocaleDateString()}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => !actionLoading && setRejectTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-withdrawal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reject-withdrawal-title" className="text-base font-bold">Reject Withdrawal</h3>
            <p className="text-xs text-muted-foreground">
              {rejectTarget.user?.email} · <span className="font-mono">{rejectTarget.amount} {rejectTarget.currency}</span>.
              The client is emailed the reason and can retry.
            </p>

            {reasons.length > 0 ? (
              <div>
                <label htmlFor="reject-reason-select" className="text-xs font-semibold">Rejection Reason</label>
                <select
                  id="reject-reason-select"
                  value={reasonId}
                  onChange={(e) => setReasonId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a reason…</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="reject-reason-text" className="text-xs font-semibold">
                  Rejection Reason
                  <span className="ml-2 font-normal text-muted-foreground">
                    (free text until the configurable reason list exists — DECISIONS D-27)
                  </span>
                </label>
                <textarea
                  id="reject-reason-text"
                  rows={3}
                  maxLength={500}
                  autoFocus
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-vertical"
                  placeholder="e.g. Bank details do not match the account holder…"
                />
              </div>
            )}

            {actionError && <p className="text-xs font-semibold text-destructive" role="alert">{actionError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={actionLoading}
                className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={actionLoading || (reasons.length > 0 ? !reasonId : !reasonText.trim())}
                aria-busy={actionLoading}
                className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
              >
                {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
