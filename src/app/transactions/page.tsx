'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type {
  RejectionReason,
  WithdrawalListResponse,
  WithdrawalRow,
  WithdrawalState,
} from '@/lib/api/admin';
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
import { t, type MessageKey } from '@/lib/i18n';

/**
 * ADM-03 / §8.4 — the withdrawal approval queue.
 *
 * MONEY RULE (ARCHITECTURE §6.1): `amount` arrives as a string and is rendered
 * verbatim. Never Number(), never parseFloat, never arithmetic — a float looks
 * right until the eighth decimal place.
 */
const PAGE_SIZE = 25;

const STATE_META: Record<WithdrawalState, { labelKey: MessageKey; classes: string }> = {
  pending: {
    labelKey: 'withdrawals.statePending',
    classes: 'bg-warning/10 text-warning border-warning/20',
  },
  approved: {
    labelKey: 'withdrawals.stateApproved',
    classes: 'bg-info/10 text-info border-info/20',
  },
  success: {
    labelKey: 'withdrawals.statePaid',
    classes: 'bg-success/10 text-success border-success/20',
  },
  rejected: {
    labelKey: 'withdrawals.stateRejected',
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  failure: {
    labelKey: 'withdrawals.stateFailed',
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

const FILTERS: Array<{ value: WithdrawalState | ''; labelKey: MessageKey }> = [
  { value: '', labelKey: 'withdrawals.stateAll' },
  { value: 'pending', labelKey: 'withdrawals.statePending' },
  { value: 'approved', labelKey: 'withdrawals.stateApproved' },
  { value: 'success', labelKey: 'withdrawals.statePaid' },
  { value: 'rejected', labelKey: 'withdrawals.stateRejected' },
];

export default function TransactionsPage() {
  /*
   * TWO permissions, not one — R-5.4.
   *
   * Approving a withdrawal and PAYING it are separate steps and separate keys,
   * so an operator can require two people on a payout by granting them to
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
  const [filter, setFilter] = React.useState<WithdrawalState | ''>('');

  const [rejectTarget, setRejectTarget] = React.useState<WithdrawalRow | null>(null);
  const [settleTarget, setSettleTarget] = React.useState<WithdrawalRow | null>(null);
  const [reasonId, setReasonId] = React.useState('');
  const [reasonNote, setReasonNote] = React.useState('');
  const [providerRef, setProviderRef] = React.useState('');

  const query = useResource<WithdrawalListResponse>(
    ['admin', 'withdrawals', pages.cursor ?? 'first', filter],
    (signal) =>
      api.admin.getWithdrawals(
        { limit: PAGE_SIZE, cursor: pages.cursor, state: filter || undefined },
        signal,
      ),
  );

  /*
   * The configured reasons, fetched when the dialog OPENS rather than with the
   * page.
   *
   * `enabled` on the target, so a reviewer who never rejects anything never
   * pays for the request. React Query caches it across every subsequent open,
   * so this is one fetch per session rather than one per rejection.
   *
   * A failure here is NOT fatal to the dialog: the free-text note alone
   * satisfies the API, so the screen says the list is unavailable and lets the
   * operator write the reason out. Blocking a rejection on a dropdown that
   * failed to load would leave a client's funds on hold over a cosmetic
   * request.
   */
  const reasonsQuery = useResource<RejectionReason[]>(
    ['admin', 'rejection-reasons', 'withdrawal'],
    () => api.admin.getRejectionReasons('withdrawal'),
    { enabled: rejectTarget !== null },
  );
  const reasons = reasonsQuery.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });

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
  const intentKey = (action: string, row: WithdrawalRow) => `${action}:${row.id}`;

  const approve = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.admin.approveWithdrawal(row.id, intentKey('approve', row)),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.admin.rejectWithdrawal(
        row.id,
        {
          reasonId: reasonId || undefined,
          reason: reasonNote.trim() || undefined,
        },
        intentKey('reject', row),
      ),
    onSuccess: async () => {
      closeReject();
      await invalidate();
    },
  });

  const settle = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.admin.settleWithdrawal(row.id, providerRef.trim(), intentKey('settle', row)),
    onSuccess: async () => {
      closeSettle();
      await invalidate();
    },
  });

  const closeReject = () => {
    setRejectTarget(null);
    setReasonId('');
    setReasonNote('');
  };

  const closeSettle = () => {
    setSettleTarget(null);
    setProviderRef('');
  };

  const busy = approve.isPending || reject.isPending || settle.isPending;
  const rows = query.data?.items ?? [];
  // `nextCursor`, not `total`: the server only counts on request, because
  // counting is a full scan of the filtered set (R-2.4).
  const nextCursor = query.data?.nextCursor ?? null;
  const counts = query.data?.counts ?? {};

  const listError = approve.isError
    ? apiErrorMessage(approve.error, t('withdrawals.approveFailed'))
    : null;

  const columns: Column<WithdrawalRow>[] = [
    {
      header: t('withdrawals.colClient'),
      cell: (w) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {[w.user.firstName, w.user.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="truncate text-xs text-muted-foreground">{w.user.email}</div>
        </div>
      ),
    },
    {
      header: t('withdrawals.colAmount'),
      align: 'right',
      /*
       * NOT sortable, deliberately.
       *
       * A `money` comparator exists and is correct — it compares decimals rather
       * than text, after the queue once sorted 9.00 above 100.00. The problem is
       * scope, not arithmetic: this list is cursor-paginated, no list endpoint
       * accepts a sort parameter (R-2.5), so sorting here orders the 25 rows on
       * screen. "The largest withdrawal" would mean the largest of 25.
       *
       * On every other column that misreading costs a moment of confusion. On
       * this one it is the screen where an admin authorises a payout, and
       * "largest pending" is exactly the question an operator asks before
       * deciding what to scrutinise. DataTable shows a scope note wherever a
       * client-side sort is active, but a note beside a wrong answer is a weaker
       * control than not offering the wrong answer.
       *
       * Restore `sortable: true` with `sortKey: 'amount'` and `sortType: 'money'`
       * once the endpoint sorts server-side.
       */
      sortable: false,
      /*
       * Rendered VERBATIM — the API sends money as a string (§6.1).
       *
       * Formatting this through lib/money.ts was tried and reverted. It rounds
       * to 2dp for display, and the deleted page's tests pinned the opposite
       * contract in two cases ("renders the amount as the string the API sent"
       * and "keeps precision a float could not hold", asserting
       * 12345678901234567.89012345 verbatim). On the screen where an admin
       * authorises a payout, showing the exact amount the client asked for beats
       * showing a tidier one.
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
            className="max-w-[160px] truncate font-mono text-xs text-muted-foreground"
            title={w.destination ?? ''}
          >
            {w.destination ?? '—'}
          </div>
          <div className="text-[11px] uppercase text-muted-foreground">{w.provider}</div>
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
            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATE_META[w.state].classes}`}
          >
            {t(STATE_META[w.state].labelKey)}
          </span>
          {/* The reason and the provider reference are shown ON the row, not
              behind a click: "why was this refused" and "what payment was
              this" are the two questions asked of a decided withdrawal. */}
          {w.rejectionReason && (
            <div
              className="mt-1 max-w-[200px] truncate text-[11px] text-muted-foreground"
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
      cell: (w) => formatDateTime(w.requestedAt),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('withdrawals.colActions'),
      sortable: false,
      cell: (w) => {
        if (!canAct) {
          return <span className="text-xs text-muted-foreground">{t('withdrawals.viewOnly')}</span>;
        }

        if (w.state === 'pending') {
          // Says WHO it is waiting for rather than showing a disabled button
          // with no explanation — the two steps are separate permissions, so
          // this is a legitimate state, not a missing grant.
          if (!canApprove) {
            return (
              <span className="text-xs text-muted-foreground">
                {t('withdrawals.awaitingApprover')}
              </span>
            );
          }
          return (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => approve.mutate(w)}
                disabled={busy}
                className="h-8 rounded-md bg-success px-3 text-xs font-semibold text-success-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
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
                className="h-8 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-outline"
              >
                {t('withdrawals.reject')}
              </button>
            </div>
          );
        }

        if (w.state === 'approved') {
          if (!canSettle) {
            return (
              <span className="text-xs text-muted-foreground">
                {t('withdrawals.awaitingSettler')}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => {
                settle.reset();
                setSettleTarget(w);
              }}
              disabled={busy}
              className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {t('withdrawals.markPaid')}
            </button>
          );
        }

        return (
          <span className="text-xs text-muted-foreground">
            {w.settledAt
              ? t('withdrawals.settledOn', { date: formatDate(w.settledAt) })
              : w.reviewedAt
                ? t('withdrawals.reviewedOn', { date: formatDate(w.reviewedAt) })
                : '—'}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('withdrawals.heading')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('withdrawals.subtitle')}</p>
      </div>

      {/* Counts come from the same response as the rows and group over the FULL
          filtered set, so a summary card never disagrees with the table. */}
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
              className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-xs"
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular">{value}</p>
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
                key={f.value || 'all'}
                type="button"
                onClick={() => {
                  // Back to the first page: a cursor names a row in the
                  // PREVIOUS filter's ordering, so carrying it across would
                  // page from a position that no longer means anything.
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
                {t(f.labelKey)}
                <span className="ml-1.5 opacity-70">
                  {/* `counts.all` comes from the server's per-state grouping over
                      the FULL set, so it stays correct whatever page is shown —
                      unlike a `total`, which would be the filtered count for the
                      current query (R-2.4: counting is opt-in). */}
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
        label={t('withdrawals.loading')}
        endpoints={[
          'GET /admin/withdrawals',
          'PATCH /admin/withdrawals/:id/approve',
          'PATCH /admin/withdrawals/:id/reject',
          'PATCH /admin/withdrawals/:id/settle',
        ]}
        onRetry={query.refetch}
        errorMessage={t('withdrawals.loadFailed')}
        error={query.error}
      >
        <DataTable
          caption={t('withdrawals.caption')}
          columns={columns}
          rows={rows}
          rowKey={(w) => w.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={ArrowUpRight}
              message={filter ? t('withdrawals.emptyFiltered') : t('withdrawals.empty')}
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
            noun: [t('withdrawals.noun'), t('withdrawals.nounPlural')],
          }}
        />
      </AsyncBoundary>

      {/*
        Both dialogs are owned by the PAGE, not by the row.
        A dialog mounted per row means one copy per row, and the copy unmounts
        mid-transition when a refetch replaces the list — the rule
        `rbac/role-row.tsx` records.
      */}

      {/* Reject — reason from the configurable list (FR-ADM-03) */}
      <Modal
        open={rejectTarget !== null}
        onClose={closeReject}
        labelledBy="reject-withdrawal-title"
        title={t('withdrawals.rejectTitle')}
        description={
          rejectTarget
            ? t('withdrawals.rejectIntro', {
                email: rejectTarget.user.email,
                // Verbatim here too: the operator is confirming an amount, and
                // this sentence is the last thing they read before doing it.
                amount: rejectTarget.amount,
                currency: rejectTarget.currency,
              })
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={closeReject}
              disabled={reject.isPending}
              className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => rejectTarget && reject.mutate(rejectTarget)}
              aria-busy={reject.isPending}
              /* At least one of the two is required. A rejection with no reason
                 at all reaches the client as a bare refusal, and they resubmit
                 the same request. */
              disabled={reject.isPending || (reasonId === '' && reasonNote.trim() === '')}
              className="h-9 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {reject.isPending ? t('withdrawals.rejecting') : t('withdrawals.confirmRejection')}
            </button>
          </>
        }
      >
        {reasons.length > 0 && (
          <div>
            <label className="text-xs font-semibold">{t('withdrawals.rejectionReason')}</label>
            <Select value={reasonId} onValueChange={setReasonId}>
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

        {/* The list failing is not the dialog failing — the note below still
            satisfies the API, so this says so rather than blocking. */}
        {reasonsQuery.status === 'error' && (
          <p className="text-[11px] text-muted-foreground">{t('withdrawals.reasonsUnavailable')}</p>
        )}

        <div>
          <label htmlFor="wd-note" className="text-xs font-semibold">
            {reasons.length > 0
              ? t('withdrawals.additionalNote')
              : t('withdrawals.rejectionReason')}
          </label>
          <textarea
            id="wd-note"
            rows={3}
            maxLength={500}
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus-outline"
            placeholder={t('withdrawals.reasonPlaceholder')}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t('withdrawals.noteHint')}</p>
        </div>

        {reject.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {apiErrorMessage(reject.error, t('withdrawals.rejectFailed'))}
          </p>
        )}
      </Modal>

      {/* Mark paid — records the provider reference (§8.4 settlement) */}
      <Modal
        open={settleTarget !== null}
        onClose={closeSettle}
        labelledBy="settle-withdrawal-title"
        title={t('withdrawals.markPaidTitle')}
        description={
          settleTarget
            ? t('withdrawals.settleIntro', {
                email: settleTarget.user.email,
                amount: settleTarget.amount,
                currency: settleTarget.currency,
              })
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={closeSettle}
              disabled={settle.isPending}
              className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => settleTarget && settle.mutate(settleTarget)}
              disabled={settle.isPending || !providerRef.trim()}
              aria-busy={settle.isPending}
              className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {settle.isPending ? t('withdrawals.posting') : t('withdrawals.confirmPayment')}
            </button>
          </>
        }
      >
        <div>
          <label htmlFor="provider-ref" className="text-xs font-semibold">
            {t('withdrawals.providerRef')}{' '}
            <span className="text-destructive">{t('withdrawals.required')}</span>
          </label>
          {/* Required, because it is the only link between this ledger entry and
              the payment the provider actually made. Reconciliation has nothing
              to match on without it. */}
          <input
            id="provider-ref"
            value={providerRef}
            onChange={(e) => setProviderRef(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm focus-outline"
            placeholder={t('withdrawals.providerRefPlaceholder')}
          />
        </div>
        {settle.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {apiErrorMessage(settle.error, t('withdrawals.settleFailed'))}
          </p>
        )}
      </Modal>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
