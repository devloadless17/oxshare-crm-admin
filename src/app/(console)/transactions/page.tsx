'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import api from '@/lib/api';
import type {
  RejectionReason,
  WithdrawalListResponse,
  WithdrawalRow,
  WithdrawalSortKey,
  WithdrawalState,
} from '@/lib/api/admin';
import { WITHDRAWAL_SORT_KEYS } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { PageLoader } from '@/components/ui/loader';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import {
  CancelWithdrawalDialog,
  RetryRivalButton,
  RivalStatusBadge,
} from '@/components/transactions/withdrawal-rival';
import { t, type MessageKey } from '@/lib/i18n';
import { toastError, toastSuccess } from '@/lib/toast';
import { formatMoney } from '@/lib/money';

/**
 * ADM-03 / §8.4 — the withdrawal approval queue.
 *
 * MONEY RULE (ARCHITECTURE §6.1): `amount` arrives as a string and is rendered
 * verbatim. Never Number(), never parseFloat, never arithmetic — a float looks
 * right until the eighth decimal place.
 */

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

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: WithdrawalSortKey) => ({
  sortable: true as const,
  sortKey: key,
});

/*
 * `useSearchParams()` requires a Suspense boundary at prerender or
 * `npm run build` fails — and `next dev` does NOT, so CI is where you find out.
 * Same shape as `clients/page.tsx`.
 */
export default function TransactionsPage() {
  return (
    <Suspense fallback={<PageLoader label={t('withdrawals.loading')} />}>
      <TransactionsPageContent />
    </Suspense>
  );
}

function TransactionsPageContent() {
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
   * Numbered pages, and the state that drives them lives in the URL.
   *
   * The state filter moved there with the page number. It was `useState`, so
   * "the pending queue" was not a link an operator could send anyone, and the
   * browser's Back button left the screen rather than undoing the filter — the
   * same argument `use-table-query-state` makes for the client list.
   *
   * R-2.4's concurrent-insert hazard is real on this queue and is the reason
   * the cursor path still exists on the endpoint. It is not what an admin
   * working the queue actually hit: with Previous/Next alone there was no way
   * back to a page they had left, and the sort below could not be offered at
   * all, because a cursor encodes the ordering that minted it and the API
   * refuses a mismatched one with a 400.
   */
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  /*
   * The rows-per-page selector, in the URL beside the page number.
   *
   * It rendered and did nothing: the pager drew the control but no
   * `onPageSizeChange` was passed and the limit was a constant. `limitParam`
   * clamps to the four sizes the pager offers, so a hand-edited `?limit=5000`
   * cannot become a request the API rejects — it caps at 100.
   */
  const pageSize = limitParam(url.get('limit'));
  const filter = (url.get('state') || '') as WithdrawalState | '';

  const sortKey = WITHDRAWAL_SORT_KEYS.includes(url.sort.key as WithdrawalSortKey)
    ? (url.sort.key as WithdrawalSortKey)
    : undefined;

  const [rejectTarget, setRejectTarget] = React.useState<WithdrawalRow | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<WithdrawalRow | null>(null);
  const [settleTarget, setSettleTarget] = React.useState<WithdrawalRow | null>(null);
  const [reasonId, setReasonId] = React.useState('');
  const [reasonNote, setReasonNote] = React.useState('');
  const [providerRef, setProviderRef] = React.useState('');

  const params = {
    limit: pageSize,
    page,
    state: filter || undefined,
    sort: sortKey,
    // Withheld when nothing is sorted. `order` alone describes an ordering of
    // no column, and sending it would also make two identical result sets
    // cache under different query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<WithdrawalListResponse>(['admin', 'withdrawals', params], (signal) =>
    api.admin.getWithdrawals(params, signal),
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
    onSuccess: async (_data, row) => {
      await invalidate();
      /*
       * The AMOUNT and the CLIENT, not "approved".
       *
       * Approving is a click on one row of a queue that renumbers underneath
       * the operator as rows leave the pending tab. Naming what was just
       * approved is what makes a misclick visible in the second it happens,
       * rather than at the next reconciliation.
       */
      toastSuccess(
        t('withdrawals.approveSucceeded', {
          amount: formatMoney(row.amount, row.currency),
        }),
        row.user?.email ?? undefined,
      );
    },
    onError: (error) => toastError(error, t('withdrawals.approveFailed')),
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
    onSuccess: async (_data, row) => {
      closeReject();
      await invalidate();
      toastSuccess(
        t('withdrawals.rejectSucceeded', {
          amount: formatMoney(row.amount, row.currency),
        }),
        row.user?.email ?? undefined,
      );
    },
    // Inline in the reject modal, which stays open on failure.
  });

  const settle = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      api.admin.settleWithdrawal(row.id, providerRef.trim(), intentKey('settle', row)),
    onSuccess: async (_data, row) => {
      closeSettle();
      await invalidate();
      toastSuccess(
        t('withdrawals.settleSucceeded', {
          amount: formatMoney(row.amount, row.currency),
        }),
        row.user?.email ?? undefined,
      );
    },
    // Inline in the settle modal, which stays open on failure.
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
  /*
   * `total` and `counts` are different numbers and both are needed.
   *
   * `total` counts the CURRENT filter and is what the pager divides into pages.
   * `counts` groups every state over the full set and is what the filter tabs
   * show — so the Pending tab keeps its badge while Rejected is on screen.
   * Using either for the other's job makes one of them wrong.
   */
  const total = query.data?.total ?? 0;
  const counts = query.data?.counts ?? {};

  /*
   * A failed APPROVE is a toast now, not a line under the filter tabs.
   *
   * That line sat above a queue the operator scrolls, so a refusal on row
   * forty was announced at the top of the screen — and it persisted, so it was
   * still there after the next successful approval. The API's own message
   * still reaches them verbatim through `toastError`.
   */

  /*
   * The list query's own filters, minus paging — which `fetchExport` strips
   * anyway, so this only has to avoid ADDING them.
   *
   * `state` alone. The sort is deliberately not carried: the export is a file
   * defined by WHICH rows it holds, and the order they arrive in is a property
   * of the screen. Sending it would also make the same set of rows produce two
   * different downloads depending on which header was last clicked. An empty
   * param set for the "All" tab rather than `state=`, which the API reads as a
   * state of empty string.
   */
  const exportFilters = React.useMemo(
    () => new URLSearchParams(filter ? { state: filter } : {}),
    [filter],
  );

  const columns: Column<WithdrawalRow>[] = [
    {
      header: t('withdrawals.colClient'),
      // Sorts by EMAIL, which is what the endpoint's `userEmail` key orders on.
      // The cell leads with the name, so this is a deliberate mismatch between
      // what is read and what is ordered — email is the unique, always-present
      // one, and grouping a queue by it puts a client's requests together,
      // which is the reason to sort this column at all.
      ...sortableBy('userEmail'),
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
       * Sortable NOW, and only because the endpoint does the ordering.
       *
       * This column was deliberately unsortable for as long as the sort was
       * client-side: it would have ordered the 25 rows on screen, so "the
       * largest withdrawal" meant the largest of 25 — on the screen where an
       * admin authorises a payout, and where "largest pending" is exactly the
       * question asked before deciding what to scrutinise.
       *
       * `WITHDRAWAL_SORT_COLUMNS.amount` maps to the `NUMERIC(28,8)` column, so
       * the database compares decimals and the answer covers the whole filtered
       * set. No `sortType: 'money'` is needed or wanted — that comparator drives
       * the client-side fallback, which `onSortChange` switches off entirely.
       * The amounts still reach the DOM as untouched strings (§6.1); sorting
       * happens where the numbers are, not here.
       */
      ...sortableBy('amount'),
      /*
       * FORMATTED through decimal.js — and this reverses an earlier decision.
       *
       * The amount was rendered verbatim on the reasoning that an admin
       * authorising a payout should see the exact figure the client asked for.
       * In practice every row read `100.00000000 USD`: eight decimal places of
       * nothing, on the queue an operator clears daily. Precision that is always
       * trailing zeros is not precision, it is noise, and it made the column
       * harder to read for a case that has not arisen.
       *
       * The guarantee that mattered is kept: `formatMoney` rounds in decimal.js
       * and returns a string, so the value is never a float — a payout of
       * 12345678901234567.89 still renders its real digits rather than the
       * 12345678901234568 a `Number()` would produce.
       *
       * `title` carries the stored string, so the exact figure is one hover away
       * on the rare row where the tail is not zeros.
       */
      cell: (w) => (
        <span title={`${w.amount} ${w.currency}`}>{formatMoney(w.amount, w.currency)}</span>
      ),
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap',
    },
    {
      header: t('withdrawals.colDestination'),
      /*
       * NOT sortable — the API has no `destination` sort key.
       *
       * This header claimed `sortKey: 'destination'` and no handler was passed,
       * so clicking it reordered the 25 rows on screen and presented that as
       * the queue. It cannot simply be pointed at the server either:
       * `WITHDRAWAL_SORT_COLUMNS` has no such entry, and R-2.5 makes an
       * unrecognised sort a 400 rather than a silent fallback — so declaring it
       * would replace a wrong order with an error page.
       */
      sortable: false,
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
      ...sortableBy('state'),
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
      /*
       * `createdAt`, not `requestedAt`, and the difference is the whole point
       * of the allowlist: the column renders `w.requestedAt`, but the key the
       * endpoint accepts for that ordering is `createdAt` — they are the same
       * instant under two names, and the header used to send the one the API
       * has never heard of.
       *
       * No `sortType: 'date'`: that comparator belongs to the client-side
       * fallback, which `onSortChange` switches off.
       */
      ...sortableBy('createdAt'),
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
          /*
           * An approved whish row is a payout travelling through Rival: the
           * badge says where it is, settlement normally lands on its own, and
           * the manual settle is DEMOTED to the fallback style — it exists
           * for a dead webhook pipe, not for the happy path.
           */
          const submittedToRival = Boolean(w.rivalWithdrawalId || w.rivalSubmittedAt);
          return (
            <div className="flex flex-col items-start gap-1.5">
              <RivalStatusBadge w={w} />
              <div className="flex flex-wrap gap-2">
                {canApprove && <RetryRivalButton w={w} disabled={busy} onDone={invalidate} />}
                {canApprove && (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(w)}
                    disabled={busy}
                    className="h-8 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-outline"
                  >
                    {t('withdrawals.cancelAction')}
                  </button>
                )}
                {canSettle && (
                  <button
                    type="button"
                    onClick={() => {
                      settle.reset();
                      setSettleTarget(w);
                    }}
                    disabled={busy}
                    title={submittedToRival ? t('withdrawals.settleFallbackHint') : undefined}
                    className={
                      submittedToRival
                        ? 'h-8 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50 focus-outline'
                        : 'h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline'
                    }
                  >
                    {t('withdrawals.markPaid')}
                  </button>
                )}
                {!canApprove && !canSettle && (
                  <span className="text-xs text-muted-foreground">
                    {t('withdrawals.awaitingSettler')}
                  </span>
                )}
              </div>
            </div>
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
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('withdrawals.heading')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('withdrawals.subtitle')}</p>
        </div>
        {/*
          The export carries the STATE FILTER, not the page.
          Same params the list query is built from, so "export what I am looking
          at" cannot drift from what is on screen. Paging is deliberately absent
          — `fetchExport` strips it anyway, and a file holding the twenty-five
          rows on display while the button claims to export the queue is an
          audit problem rather than a cosmetic one.
        */}
        <ExportButton resource="withdrawals" filters={exportFilters} disabled={total === 0} />
      </div>

      {/*
        The three summary cards that sat here are gone, on request.

        They counted `pending`, `approved + success` and `rejected + failure`
        from the response's own `counts` — which the filter tabs below already
        show, per state, without collapsing two states into one number. The
        tabs are also actionable; the cards were not.
      */}

      {query.status === 'ready' && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                onClick={() => {
                  // The state and the page are written together, so the filter
                  // change always lands on page one. Page 4 of "pending" is
                  // usually past the end of "rejected", and an empty table
                  // reads as an empty queue rather than as an overshoot.
                  url.set({ state: f.value || undefined, page: undefined });
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
        fill
      >
        <DataTable
          fill
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
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * Server-side, which is what makes the amount column safe to offer at
           * all — see the note on it above. The page is dropped with the sort:
           * reordering renumbers every page, so position 26–50 after a sort
           * holds different withdrawals than it did before.
           */
          onSortChange={(key, order) => {
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined });
          }}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            // The size and the page are written together, and the page is
            // dropped: page 4 at 25 a page is past the end at 100 a page, which
            // renders as an empty table and reads as an empty queue rather than
            // as an overshoot.
            onPageSizeChange: (size) =>
              url.set({
                limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              }),
            noun: [t('withdrawals.noun'), t('withdrawals.nounPlural')],
          }}
        />
      </AsyncBoundary>

      {/*
        Both dialogs are owned by the PAGE, not by the row.
        A dialog mounted per row means one copy per row, and the copy unmounts
        mid-transition when a refetch replaces the list — the rule
        `components/row-actions.tsx` records.
      */}

      <CancelWithdrawalDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={invalidate}
      />

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
            className="mt-1 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm focus-outline"
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
            className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 font-mono text-sm focus-outline"
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
