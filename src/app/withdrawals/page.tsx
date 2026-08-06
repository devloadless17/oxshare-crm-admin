'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { idempotent } from '@/lib/api/client';
import type { RejectionReason, WithdrawalListResponse, WithdrawalRow } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useCursorPages } from '@/hooks/use-cursor-pages';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

// ADM-03 / §8.4 withdrawal review.
//
// MONEY RULE (ARCHITECTURE §6.1): `amount` arrives as a string and is rendered
// verbatim. Never Number(), never parseFloat, never arithmetic — a float looks
// right until the eighth decimal place.
const PAGE_SIZE = 25;

const STATE_META: Record<string, { label: string; classes: string }> = {
  pending: {
    label: t('withdrawals.statePending'),
    classes: 'bg-warning/10 text-warning border-warning/20',
  },
  approved: {
    label: t('withdrawals.stateApproved'),
    classes: 'bg-info/10 text-info border-info/20',
  },
  success: {
    label: t('withdrawals.statePaid'),
    classes: 'bg-success/10 text-success border-success/20',
  },
  rejected: {
    label: t('withdrawals.stateRejected'),
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  failure: {
    label: t('withdrawals.stateFailed'),
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

const FILTERS = [
  { value: '', label: t('withdrawals.stateAll') },
  { value: 'pending', label: t('withdrawals.statePending') },
  { value: 'approved', label: t('withdrawals.stateApproved') },
  { value: 'success', label: t('withdrawals.statePaid') },
  { value: 'rejected', label: t('withdrawals.stateRejected') },
];

export default function WithdrawalsPage() {
  /*
   * TWO permissions, not one — R-5.4.
   *
   * Approving a withdrawal and PAYING it are separate steps and now separate
   * keys, so an operator can require two people on a payout by granting them to
   * different roles. Gating both buttons on `withdrawals.approve` would show a
   * Mark-Paid button to an approver who cannot use it, and it would come back a
   * bare 403 — which is the bug this check was added for in the first place.
   *
   * UX only: `PermissionsGuard` enforces each independently (R-4.1).
   */
  const { admin } = useAdmin();
  const canApprove = hasPermission(admin, 'withdrawals.approve');
  const canSettle = hasPermission(admin, 'withdrawals.settle');
  /** Any action at all — decides "view only" rather than which button shows. */
  const canAct = canApprove || canSettle;
  const queryClient = useQueryClient();

  /*
   * Cursor navigation, not numbered pages — PLATFORM-CONVENTIONS R-2.4.
   *
   * The withdrawal QUEUE is worked down by an admin while clients keep
   * submitting — the concurrent-insert case offset paging gets wrong. A skipped
   * withdrawal is one nobody actions, and nothing about it looks wrong.
   *
   * "Jump to page N" is gone because a cursor names a row rather than an
   * ordinal. Filters are the real navigation here.
   */
  const pages = useCursorPages();
  const [filter, setFilter] = useState('');

  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<WithdrawalRow | null>(null);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [providerRef, setProviderRef] = useState('');

  const query = useResource<WithdrawalListResponse>(
    ['withdrawals', pages.cursor ?? 'first', filter],
    async (signal) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pages.cursor) params.set('cursor', pages.cursor);
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

  /*
   * One key per intended ACTION on one withdrawal — R-5.2.
   *
   * Derived from the action and the row rather than randomly generated, because
   * that is what the key means here: approving withdrawal X is a single intent,
   * so a double-click and a retry after a failed request are the same operation
   * and must collapse to one. A fresh random key per click would present each as
   * new, which is the bug the header exists to prevent.
   *
   * Safe against a legitimate second operation on the same row: approve, reject
   * and settle each carry their own prefix, and the state guards refuse a repeat
   * of the same transition anyway. The API releases a claim whose handler threw,
   * so a corrected retry is not blocked by the failed attempt.
   */
  const intentKey = (action: string, row: WithdrawalRow) => idempotent(`${action}:${row.id}`);

  const approve = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.patch(`/admin/withdrawals/${row.id}/approve`, {}, intentKey('approve', row)),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.patch(
        `/admin/withdrawals/${row.id}/reject`,
        {
          reasonId: reasonId || undefined,
          reason: reasonNote.trim() || undefined,
        },
        intentKey('reject', row),
      ),
    onSuccess: async () => {
      setRejectTarget(null);
      setReasonId('');
      setReasonNote('');
      await invalidate();
    },
  });

  const settle = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.patch(
        `/admin/withdrawals/${row.id}/settle`,
        { providerRef: providerRef.trim() },
        intentKey('settle', row),
      ),
    onSuccess: async () => {
      setSettleTarget(null);
      setProviderRef('');
      await invalidate();
    },
  });

  const busy = approve.isPending || reject.isPending || settle.isPending;
  const rows = query.data?.items ?? [];
  // `nextCursor`, not `total`: the server only counts on request, because
  // counting is a full scan of the filtered set (R-2.4).
  const nextCursor = query.data?.nextCursor ?? null;
  const counts = query.data?.counts ?? {};

  const listError = approve.isError
    ? apiErrorMessage(approve.error, 'Failed to approve the withdrawal.')
    : null;

  const columns: Column<WithdrawalRow>[] = [
    {
      header: t('withdrawals.colClient'),
      sortable: true,
      sortKey: 'id',
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
      header: t('withdrawals.colAmount'),
      align: 'right',
      /*
       * NOT sortable, deliberately.
       *
       * The comparator is correct — `sortType: 'money'` compared decimals rather
       * than text, after the queue once sorted 9.00 above 100.00. The problem is
       * scope, not arithmetic: this list is cursor-paginated, no list endpoint
       * accepts a sort parameter (R-2.5), so sorting here orders the 25 rows on
       * screen. "The largest withdrawal" would mean the largest of 25.
       *
       * On every other column that misreading costs a moment of confusion. On
       * this one it is the screen where an admin authorises a payout, and
       * "largest pending" is exactly the question an operator asks before
       * deciding what to scrutinise. DataTable now shows a scope note wherever a
       * client-side sort is active, but a note beside a wrong answer is a weaker
       * control than not offering the wrong answer.
       *
       * Restore `sortable: true` with `sortKey: 'amount'` and `sortType: 'money'`
       * once the endpoint sorts server-side.
       */
      /*
       * Rendered VERBATIM — the API sends money as a string (§6.1).
       *
       * Formatting this through lib/money.ts was tried and reverted. It rounds
       * to 2dp for display, and page.test.tsx pins the opposite contract in two
       * tests ("renders the amount as the string the API sent" and "keeps
       * precision a float could not hold", asserting 12345678901234567.89012345
       * verbatim). On the screen where an admin authorises a payout, showing the
       * exact amount the client asked for beats showing a tidier one.
       *
       * lib/money.ts is therefore for screens that summarise, not for this one.
       */
      cell: (w) => (
        <>
          {w.amount} <span className="text-xs text-muted-foreground">{w.currency}</span>
        </>
      ),
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap',
    },
    {
      header: t('withdrawals.colDestination'),
      sortable: true,
      sortKey: 'destination',
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
      header: t('withdrawals.colState'),
      sortable: true,
      sortKey: 'state',
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
      header: t('withdrawals.colRequested'),
      sortable: true,
      sortKey: 'requestedAt',
      sortType: 'date',
      cell: (w) => (w.requestedAt ? new Date(w.requestedAt).toLocaleString() : '—'),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('withdrawals.colActions'),
      cell: (w) =>
        !canAct ? (
          <span className="text-xs text-muted-foreground">{t('withdrawals.viewOnly')}</span>
        ) : w.state === 'pending' ? (
          !canApprove ? (
            <span className="text-xs text-muted-foreground">
              {t('withdrawals.awaitingApprover')}
            </span>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => approve.mutate(w)}
                disabled={busy}
                className="h-8 px-3 rounded-md bg-success text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
              >
                {t('withdrawals.approve')}
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
                {t('withdrawals.reject')}
              </button>
            </div>
          )
        ) : w.state === 'approved' ? (
          !canSettle ? (
            <span className="text-xs text-muted-foreground">
              {t('withdrawals.awaitingSettler')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                settle.reset();
                setSettleTarget(w);
              }}
              disabled={busy}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {t('withdrawals.markPaid')}
            </button>
          )
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
        <h1 className="text-2xl font-bold tracking-tight">{t('withdrawals.heading')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('withdrawals.subtitle')}</p>
      </div>

      {query.status === 'ready' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: t('withdrawals.tabPending'),
              value: counts['pending'] ?? 0,
              Icon: Clock,
              tone: 'text-warning bg-warning/10',
            },
            {
              label: t('withdrawals.tabApproved'),
              value: (counts['approved'] ?? 0) + (counts['success'] ?? 0),
              Icon: CheckCircle2,
              tone: 'text-success bg-success/10',
            },
            {
              label: t('withdrawals.tabRejected'),
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
                  pages.reset();
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
                  {/* `counts.all` comes from the server's per-state grouping over
                      the FULL set, so it stays correct whatever page is shown —
                      unlike the old `total`, which was the filtered count for
                      the current query and is no longer returned by default
                      (R-2.4: counting is opt-in). */}
                  {f.value ? (counts[f.value] ?? 0) : (counts['all'] ?? 0)}
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
        error={query.error}
      >
        <DataTable
          caption="Client withdrawal requests"
          columns={columns}
          rows={rows}
          rowKey={(w) => w.id}
          selectable={true}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={ArrowUpRight}
              message={filter ? 'No withdrawals in this state.' : 'No withdrawal requests yet.'}
            />
          }
          cursorPagination={{
            pageNumber: pages.pageNumber,
            pageSize: PAGE_SIZE,
            showing: rows.length,
            canGoBack: pages.canGoBack,
            canGoForward: Boolean(nextCursor),
            onBack: pages.goBack,
            onNext: () => pages.goNext(nextCursor),
            noun: ['request', 'requests'],
          }}
        />
      </AsyncBoundary>

      {/* Reject — reason from the configurable list (FR-ADM-03) */}
      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        labelledBy="reject-withdrawal-title"
        title={t('withdrawals.rejectTitle')}
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
              {t('common.cancel')}
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
            <label className="text-xs font-semibold">{t('withdrawals.rejectionReason')}</label>
            <Select value={reasonId} onValueChange={(val) => setReasonId(val)}>
              <SelectTrigger className="mt-1 h-9 w-full">
                <SelectValue placeholder={t('withdrawals.selectReason')} />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y focus-outline"
            placeholder={t('withdrawals.reasonPlaceholder')}
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
        title={t('withdrawals.markPaidTitle')}
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
              {t('common.cancel')}
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
            {t('withdrawals.providerRef')} <span className="text-destructive">*</span>
          </label>
          <input
            id="provider-ref"
            value={providerRef}
            onChange={(e) => setProviderRef(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-mono focus-outline"
            placeholder={t('withdrawals.providerRefPlaceholder')}
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
