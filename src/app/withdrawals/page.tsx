'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type { RejectionReason, WithdrawalListResponse, WithdrawalRow } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Pagination } from '@/components/pagination';
import { Modal } from '@/components/ui/modal';

// ADM-03 / §8.4 withdrawal review.
//
// MONEY RULE (ARCHITECTURE §6.1): `amount` arrives as a string and is rendered
// verbatim. Never Number(), never parseFloat, never arithmetic — a float looks
// right until the eighth decimal place.
const PAGE_SIZE = 25;

const STATE_META: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-warning/10 text-warning border-warning/20' },
  approved: { label: 'Approved', classes: 'bg-info/10 text-info border-info/20' },
  success: { label: 'Paid', classes: 'bg-success/10 text-success border-success/20' },
  rejected: {
    label: 'Rejected',
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
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
  // Every mutation here needs withdrawals.approve on the API. Without this
  // check the page rendered Approve / Reject / Mark-Paid to anyone who could
  // read the queue, and each one came back as a bare 403.
  const { admin } = useAdmin();
  const canApprove = hasPermission(admin, 'withdrawals.approve');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');

  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<WithdrawalRow | null>(null);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [providerRef, setProviderRef] = useState('');

  const query = useResource<WithdrawalListResponse>(
    ['withdrawals', page, filter],
    async (signal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter) params.set('state', filter);
      const res = await api.get<WithdrawalListResponse>(`/admin/withdrawals?${params}`, { signal });
      return res.data;
    },
  );

  useEffect(() => {
    if (!rejectTarget || reasons.length > 0) return;
    api.admin
      .getRejectionReasons('withdrawal')
      .then(setReasons)
      .catch(() => setReasons([]));
  }, [rejectTarget, reasons.length]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['withdrawals'] });

  const approve = useMutation({
    mutationFn: (row: WithdrawalRow) => api.patch(`/admin/withdrawals/${row.id}/approve`),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.patch(`/admin/withdrawals/${row.id}/reject`, {
        reasonId: reasonId || undefined,
        reason: reasonNote.trim() || undefined,
      }),
    onSuccess: async () => {
      setRejectTarget(null);
      setReasonId('');
      setReasonNote('');
      await invalidate();
    },
  });

  const settle = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.patch(`/admin/withdrawals/${row.id}/settle`, { providerRef: providerRef.trim() }),
    onSuccess: async () => {
      setSettleTarget(null);
      setProviderRef('');
      await invalidate();
    },
  });

  const busy = approve.isPending || reject.isPending || settle.isPending;
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const counts = query.data?.counts ?? {};

  const listError = approve.isError
    ? apiErrorMessage(approve.error, 'Failed to approve the withdrawal.')
    : null;

  const columns: Column<WithdrawalRow>[] = [
    {
      header: 'Client',
      cell: (w) => (
        <>
          <div className="font-medium text-foreground">
            {[w.user?.firstName, w.user?.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="text-xs text-muted-foreground">{w.user?.email}</div>
        </>
      ),
    },
    {
      header: 'Amount',
      align: 'right',
      // Rendered verbatim — the API sends money as a string (§6.1).
      cell: (w) => (
        <>
          {w.amount} <span className="text-xs text-muted-foreground">{w.currency}</span>
        </>
      ),
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap',
    },
    {
      header: 'Destination',
      cell: (w) => (
        <>
          <div
            className="font-mono text-xs text-muted-foreground max-w-[160px] truncate"
            title={w.destination ?? ''}
          >
            {w.destination ?? '—'}
          </div>
          <div className="text-[11px] text-muted-foreground uppercase">{w.provider}</div>
        </>
      ),
    },
    {
      header: 'State',
      cell: (w) => (
        <>
          <span
            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATE_META[w.state]?.classes ?? ''}`}
          >
            {STATE_META[w.state]?.label ?? w.state}
          </span>
          {w.rejectionReason && (
            <div
              className="mt-1 text-[11px] text-muted-foreground max-w-[200px] truncate"
              title={w.rejectionReason}
            >
              {w.rejectionReason}
            </div>
          )}
          {w.providerRef && (
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">{w.providerRef}</div>
          )}
        </>
      ),
    },
    {
      header: 'Requested',
      cell: (w) => (w.requestedAt ? new Date(w.requestedAt).toLocaleString() : '—'),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: 'Actions',
      cell: (w) =>
        !canApprove ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : w.state === 'pending' ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => approve.mutate(w)}
              disabled={busy}
              className="h-8 px-3 rounded-md bg-success text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => {
                reject.reset();
                setRejectTarget(w);
              }}
              disabled={busy}
              className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-50 focus-outline"
            >
              Reject
            </button>
          </div>
        ) : w.state === 'approved' ? (
          <button
            type="button"
            onClick={() => {
              settle.reset();
              setSettleTarget(w);
            }}
            disabled={busy}
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
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Withdrawal Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review client withdrawals — approve, reject with a reason, or mark paid once the provider
          confirms
        </p>
      </div>

      {query.status === 'ready' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: 'Pending Review',
              value: counts['pending'] ?? 0,
              Icon: Clock,
              tone: 'text-warning bg-warning/10',
            },
            {
              label: 'Approved / Paid',
              value: (counts['approved'] ?? 0) + (counts['success'] ?? 0),
              Icon: CheckCircle2,
              tone: 'text-success bg-success/10',
            },
            {
              label: 'Rejected / Failed',
              value: (counts['rejected'] ?? 0) + (counts['failure'] ?? 0),
              Icon: XCircle,
              tone: 'text-destructive bg-destructive/10',
            },
          ].map(({ label, value, Icon, tone }) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between"
            >
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

      {query.status === 'ready' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setPage(1);
                  setFilter(f.value);
                }}
                aria-pressed={filter === f.value}
                className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                  filter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-70">
                  {f.value ? (counts[f.value] ?? 0) : total}
                </span>
              </button>
            ))}
          </div>
          {listError && (
            <p className="text-xs font-semibold text-destructive" role="alert">
              {listError}
            </p>
          )}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label="Loading withdrawal requests"
        endpoints={[
          'GET /admin/withdrawals',
          'PATCH /admin/withdrawals/:id/approve',
          'PATCH /admin/withdrawals/:id/reject',
          'PATCH /admin/withdrawals/:id/settle',
        ]}
        onRetry={query.refetch}
        errorMessage="Failed to load withdrawal requests."
      >
        <DataTable
          caption="Client withdrawal requests"
          columns={columns}
          rows={rows}
          rowKey={(w) => w.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={ArrowUpRight}
              message={filter ? 'No withdrawals in this state.' : 'No withdrawal requests yet.'}
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
              noun={['request', 'requests']}
            />
          </div>
        )}
      </AsyncBoundary>

      {/* Reject — reason from the configurable list (FR-ADM-03) */}
      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        labelledBy="reject-withdrawal-title"
        title="Reject Withdrawal"
        description={
          rejectTarget
            ? `${rejectTarget.user?.email} · ${rejectTarget.amount} ${rejectTarget.currency}. The hold is released, the client is emailed the reason, and they may submit a new request.`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              disabled={reject.isPending}
              className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => rejectTarget && reject.mutate(rejectTarget)}
              aria-busy={reject.isPending}
              disabled={reject.isPending || (reasonId === '' && reasonNote.trim() === '')}
              className="h-9 px-4 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {reject.isPending ? 'Rejecting…' : 'Confirm Rejection'}
            </button>
          </>
        }
      >
        {reasons.length > 0 && (
          <div>
            <label htmlFor="wd-reason" className="text-xs font-semibold">
              Rejection Reason
            </label>
            <select
              id="wd-reason"
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-outline"
            >
              <option value="">Select a reason…</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="wd-note" className="text-xs font-semibold">
            {reasons.length > 0 ? 'Additional note (optional)' : 'Rejection reason'}
          </label>
          <textarea
            id="wd-note"
            rows={3}
            maxLength={500}
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-vertical focus-outline"
            placeholder="e.g. Beneficiary name does not match the account holder…"
          />
        </div>

        {reject.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {apiErrorMessage(reject.error, 'Failed to reject the withdrawal.')}
          </p>
        )}
      </Modal>

      {/* Mark paid — records the provider reference (§8.4 settlement) */}
      <Modal
        open={settleTarget !== null}
        onClose={() => setSettleTarget(null)}
        labelledBy="settle-title"
        title="Mark Withdrawal Paid"
        description={
          settleTarget
            ? `${settleTarget.user?.email} · ${settleTarget.amount} ${settleTarget.currency}. This posts the debit to the ledger and clears the hold. It cannot be undone — corrections are compensating ledger entries.`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setSettleTarget(null)}
              disabled={settle.isPending}
              className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => settleTarget && settle.mutate(settleTarget)}
              disabled={settle.isPending || !providerRef.trim()}
              aria-busy={settle.isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {settle.isPending ? 'Posting…' : 'Confirm Payment'}
            </button>
          </>
        }
      >
        <div>
          <label htmlFor="provider-ref" className="text-xs font-semibold">
            Provider reference <span className="text-destructive">*</span>
          </label>
          <input
            id="provider-ref"
            value={providerRef}
            onChange={(e) => setProviderRef(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-mono focus-outline"
            placeholder="e.g. whish-payout-9911"
          />
        </div>
        {settle.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {apiErrorMessage(settle.error, 'Failed to mark the withdrawal paid.')}
          </p>
        )}
      </Modal>
    </div>
  );
}
