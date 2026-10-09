'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, CheckCircle2, Info, X } from 'lucide-react';
import api from '@/lib/api';
import {
  WITHDRAWAL_SORT_KEYS,
  type RejectionReason,
  type WithdrawalListResponse,
  type WithdrawalRow,
  type WithdrawalSortKey,
  type WithdrawalState,
} from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { ReasonOption } from '@/components/rejection-reasons/reason-option';
import { ArabicTextField, arabicOrNull } from '@/components/arabic-text-field';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { PageLoader } from '@/components/ui/loader';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { useUrlSearch } from '@/hooks/use-url-search';
import { useOpenedRecord } from '@/components/record-sheet';
import {
  WITHDRAWAL_STATE_META,
  WithdrawalRecordSheet,
  withdrawalRowLabel,
} from '@/components/transactions/withdrawal-record';
import { QueueToolbar } from '@/components/queue-toolbar';
import { DateRangePicker, PeriodWiden } from '@/components/date-range-picker';
import { useDateRange } from '@/hooks/use-date-range';
import { useTabCounts } from '@/hooks/use-tab-counts';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { RowActions, type RowAction } from '@/components/row-actions';
/*
 * `withdrawal-payout.tsx` is the console path of an automated payout — any
 * provider's since backend 0173 (Rival's alone before): where the payout is
 * (badge), pulling it back (cancel), and resending one a person decided should
 * go again (resend). An approval on an automated route SENDS the payout and
 * parks the row in `approved` until the provider decides (DECISIONS D-66).
 */
import {
  CancelWithdrawalDialog,
  isRetryableSubmission,
  PayoutStatusBadge,
  ResendPayoutButton,
} from '@/components/transactions/withdrawal-payout';
import { providerDisplayName } from '@/components/payment-providers/provider-labels';
import { t, type MessageKey } from '@/lib/i18n';
import { toastError, toastSuccess } from '@/lib/toast';
import { formatMoney } from '@/lib/money';
import { keys } from '@/lib/query-keys';
import { ClientIdentity, clientLabel, clientName } from '@/components/clients/client-identity';
import { ResolveAttentionDialog } from '@/components/financial/resolve-attention-dialog';
import { FinishPayoutDialog } from '@/components/transactions/finish-payout-dialog';

/**
 * ADM-03 / §8.4 — the withdrawal approval queue.
 *
 * MONEY RULE (ARCHITECTURE §6.1): `amount` arrives as a string and is rendered
 * verbatim. Never Number(), never parseFloat, never arithmetic — a float looks
 * right until the eighth decimal place.
 */

/**
 * The URL value that means "no state filter".
 *
 * A SENTINEL rather than an empty string, because the default is now `pending`
 * rather than everything: with `?state=` the absent parameter and the explicit
 * All tab are the same value, so choosing All would fall back to the default
 * and the tab could never be selected. `?state=all` is a value the URL can
 * hold; the request still sends no `state` parameter for it.
 */
const ALL_STATES = 'all';

/**
 * PENDING first, and it is the default — see `filter` below.
 *
 * The "Awaiting payout" tab (`approved`) is BACK, un-reversing the earlier
 * merge into a single success tab. That merge was right while approval paid in
 * one step and `approved` held only stranded history; D-66's rail lifecycle
 * made it a live queue again — rows an operator may need to cancel or retry —
 * and a working state reachable only through All is a queue nobody works.
 *
 * "Approved" (the tab) still filters `success`: on both lifecycles that is the
 * state a finished payout lands in, and renaming the tab would relabel 8.5k
 * historical rows an operator already knows by that word.
 */
const FILTERS: Array<{ value: WithdrawalState | typeof ALL_STATES; labelKey: MessageKey }> = [
  { value: 'pending', labelKey: 'withdrawals.statePending' },
  { value: 'approved', labelKey: 'withdrawals.stateAwaitingPayout' },
  { value: 'success', labelKey: 'withdrawals.stateApproved' },
  { value: 'rejected', labelKey: 'withdrawals.stateRejected' },
  { value: ALL_STATES, labelKey: 'withdrawals.stateAll' },
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
    <React.Suspense fallback={<PageLoader label={t('withdrawals.loading')} />}>
      <TransactionsPageContent />
    </React.Suspense>
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
  /*
   * PENDING by default — the queue, not the archive.
   *
   * This screen opens on the rows that need a decision. Defaulting to every
   * state meant an operator landed on a list dominated by settled history and
   * had to filter before they could work, and the count that mattered ("how
   * many are waiting on me") was never the one on screen.
   *
   * ## ⚠️ ABSENT IS `''`, NOT `null` — this compared against `null` and the
   * default never applied
   *
   * `useTableQueryState.get()` is typed `(key: string) => string` and returns
   * `searchParams.get(key) ?? ''`, so a missing parameter arrives as an EMPTY
   * STRING. Testing for `null` was therefore never true: a fresh visit resolved
   * to `''`, which matches no tab — so the toolbar highlighted nothing and the
   * request went out with an empty `state`.
   *
   * The two states this has to keep apart are "not chosen" and "explicitly
   * everything", and they still are: `''` is absent, and the All tab writes a
   * real `?state=all`. Only the spelling of the absent case was wrong.
   */
  const filterParam = url.get('state');
  const filter: WithdrawalState | typeof ALL_STATES =
    filterParam === '' ? 'pending' : (filterParam as WithdrawalState | typeof ALL_STATES);

  const sortKey = WITHDRAWAL_SORT_KEYS.includes(url.sort.key as WithdrawalSortKey)
    ? (url.sort.key as WithdrawalSortKey)
    : undefined;

  /*
   * DEBOUNCED into the request, not the input. The box stays instant while the
   * query waits for a pause in typing — an undebounced key fires a request per
   * keystroke and races their responses onto one table.
   */
  /*
   * SEEDED FROM the URL and written BACK to it.
   *
   * This was `React.useState('')`: the search never reached the address bar,
   * while the state tab beside it did. So a refresh kept the tab and silently
   * dropped the search, a shared link showed the recipient a different row set
   * than the sender saw, and the table changed without the URL changing —
   * which is the one signal an operator has that they are looking at a subset.
   *
   * `/kyc` already round-trips its search this way; the desk is the screen that
   * did not, and it is the one where "these are the payouts matching X" being
   * wrong costs the most.
   */
  // Both directions, and a link followed while on the desk wins — see the hook.
  const { search, setSearch, term: debouncedSearch } = useUrlSearch(url);
  // The period: a tab of payouts still OWED (pending, awaiting payout) opens on
  // All time — an old request must never hide behind "Today". Decided tabs: Today.
  const period = useDateRange(url, filter === 'pending' || filter === 'approved' ? 'all' : 'today');

  const [rejectTarget, setRejectTarget] = React.useState<WithdrawalRow | null>(null);
  /* The row whose details are open — always reachable. */
  /* The `approved` row being cancelled — the rail lifecycle's "thought better
     of it" path (D-66). The dialog owns its own reason state. */
  const [cancelTarget, setCancelTarget] = React.useState<WithdrawalRow | null>(null);
  const [resolveTarget, setResolveTarget] = React.useState<WithdrawalRow | null>(null);
  const [finishTarget, setFinishTarget] = React.useState<WithdrawalRow | null>(null);

  const confirm = useConfirm();

  /**
   * Ask before paying.
   *
   * Approving is not a state change with a settlement step behind it any more —
   * it PAYS, in one transaction, and there is no undo: the money has left. A
   * menu item that fired on click put an irreversible payout one stray
   * selection away, and the menu opens under the cursor for whichever row was
   * clicked.
   *
   * The client and the AMOUNT are both in the question. This is a queue of
   * near-identical rows, so "approve this withdrawal?" would confirm the action
   * without confirming which one — the mistake actually worth catching.
   *
   * `confirm()` rather than a controlled dialog, matching the other call sites
   * in this console: dismissal resolves false, so nothing is left pending on a
   * cancel.
   */
  const confirmApprove = async (row: WithdrawalRow) => {
    // Name, else email, else the Portal ID — never "{name}" when both are masked.
    const name = clientLabel(row.user);
    const plan = row.payoutPlan;
    /*
     * NOBODY CAN PAY IT RIGHT NOW (backend 0173): its network is switched off,
     * or its provider is off and waits rather than letting the desk pay. The
     * API refuses the approval with this same sentence; saying it here, before
     * the click, spares the operator a confirm that can only fail.
     */
    if (plan?.payer === 'paused') {
      await confirm({
        title: t('withdrawals.cannotPayTitle'),
        description: plan.reason ?? t('withdrawals.cannotPayGeneric'),
        confirmLabel: t('common.close'),
        notice: true,
      });
      return;
    }
    const provider = plan?.provider ?? providerDisplayName(row.providerCode);
    const ok = await confirm({
      title: t('withdrawals.confirmApproveTitle', {
        amount: formatMoney(row.amount, row.currency),
      }),
      /*
       * Who pays it if approved now: the provider for an automated payout it
       * can take, else the desk, in one step. The provider's FEE is never shown
       * on a transaction (the owner, 30 Sep 2026): what the company pays its
       * providers is not every approver's business.
       */
      description:
        plan?.payer === 'provider'
          ? plan.fee && plan.gross
            ? t('withdrawals.confirmApproveQuote', {
                name,
                provider,
                net: formatMoney(plan.net ?? row.amount, row.currency),
              })
            : t('withdrawals.confirmApproveProvider', { name, provider })
          : t('withdrawals.confirmApprove', { name }),
      confirmLabel: t('withdrawals.approve'),
    });
    if (ok) approve.mutate(row);
  };
  const [reasonId, setReasonId] = React.useState('');
  const [reasonNote, setReasonNote] = React.useState('');
  const [reasonNoteAr, setReasonNoteAr] = React.useState('');

  const params = {
    limit: pageSize,
    page,
    // The sentinel never reaches the API — "all" is the ABSENCE of the
    // parameter, and sending it would fail the endpoint's `@IsIn`.
    state: filter === ALL_STATES ? undefined : filter,
    q: debouncedSearch || undefined,
    from: period.range.from,
    to: period.range.to,
    sort: sortKey,
    // Withheld when nothing is sorted. `order` alone describes an ordering of
    // no column, and sending it would also make two identical result sets
    // cache under different query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<WithdrawalListResponse>(keys.withdrawals.list(params), (signal) =>
    api.admin.getWithdrawals(params, signal),
  );
  // The one withdrawal a notification opened (`?open=`), in any state.
  const opened = useOpenedRecord(keys.withdrawals.list, (p, s) => api.admin.getWithdrawals(p, s));

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
    keys.withdrawals.rejectionReasons(),
    () => api.admin.getRejectionReasons('withdrawal'),
    { enabled: rejectTarget !== null },
  );
  const reasons = reasonsQuery.data ?? [];

  /*
   * A withdrawal decision is not confined to this desk. Approving DEBITS and
   * paying out settles; rejecting and cancelling post a COMPENSATING CREDIT
   * back to the client's wallet (transactions.service.ts:300). So the balance
   * screens, the Financial list and the ledger all just changed, and an
   * operator who rejects a payout and then opens the client's wallets panel
   * must not be shown the pre-refund balance.
   *
   * `withdrawals.all()` covers this list AND the sidebar badge — they share a
   * root deliberately; see lib/query-keys.ts.
   */
  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.withdrawals.all() }),
      queryClient.invalidateQueries({ queryKey: keys.wallets.all() }),
      queryClient.invalidateQueries({ queryKey: keys.transactions.all() }),
      queryClient.invalidateQueries({ queryKey: keys.ledger.all() }),
      queryClient.invalidateQueries({ queryKey: keys.stats.all() }),
    ]);
  };

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
          reasonAr: arabicOrNull(reasonNoteAr) ?? undefined,
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

  const closeReject = () => {
    setRejectTarget(null);
    [setReasonId, setReasonNote, setReasonNoteAr].forEach((clear) => clear(''));
  };

  const busy = approve.isPending || reject.isPending;
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
  // Each tab's count is what it shows when clicked — Pending is the whole queue
  // even while a decided tab is on Today (`useTabCounts`).
  const owed = (state: string) => state === 'pending' || state === 'approved';
  const countOf = useTabCounts({
    url,
    isWaiting: owed,
    // `tabCounts` keeps this key apart from the detail panel's `{ id, limit: 1 }`:
    // React Query ignores undefined fields, so the two would otherwise SHARE a
    // cache entry and the panel would read these counts as a withdrawal.
    key: (range) => keys.withdrawals.list({ tabCounts: true, limit: 1, q: params.q, ...range }),
    fetchCounts: async (range, signal) =>
      (await api.admin.getWithdrawals({ limit: 1, q: params.q, ...range }, signal)).counts,
  });

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
    () =>
      new URLSearchParams({
        ...(filter === ALL_STATES ? {} : { state: filter }),
        // The search term too, or "export what you are looking at" downloads
        // the whole state bucket while the screen shows three rows.
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(period.range.from ? { from: period.range.from } : {}),
        ...(period.range.to ? { to: period.range.to } : {}),
      }),
    [filter, debouncedSearch, period.range.from, period.range.to],
  );

  /** What may be done to a withdrawal — the row menu and the detail panel alike. */
  const actionsFor = (w: WithdrawalRow): RowAction[] => {
    const items: RowAction[] = [];

    if (w.state === 'approved' && canApprove) {
      items.push({
        label: t('withdrawals.cancelAction'),
        icon: X,
        destructive: true,
        disabled: busy,
        onSelect: () => setCancelTarget(w),
      });
    }

    if (w.state === 'pending') {
      /*
       * Approving now PAYS — one step, straight to `success` — so it is
       * gated on `withdrawals.settle`, the key that has always meant "may
       * complete a payout". Rejecting returns the money and releases
       * nothing, so it stays on `withdrawals.approve`. A holder of one key
       * and not the other sees one item, which is a legitimate
       * configuration rather than a missing grant.
       */
      if (canSettle) {
        items.push({
          label: t('withdrawals.approve'),
          icon: Check,
          disabled: busy,
          onSelect: () => void confirmApprove(w),
        });
      }
      if (canApprove) {
        items.push({
          label: t('withdrawals.reject'),
          icon: X,
          destructive: true,
          disabled: busy,
          onSelect: () => {
            reject.reset();
            setRejectTarget(w);
          },
        });
      }
    }

    /*
     * Mark resolved — a payout the two platforms disagree about, which
     * only a person reading both can settle. Never on the retryable case:
     * clearing that flag would hide a payout that was never sent.
     */
    /*
     * FINISH a flagged payout the provider already holds (0174) — reported
     * paid elsewhere, or matched by several of its records. "Mark resolved"
     * would only be flagged again on the next sweep, so it gives way here.
     */
    const heldByProvider =
      w.state === 'approved' &&
      w.needsAttention &&
      Boolean(w.providerPayoutId || w.providerSubmittedAt);
    if (heldByProvider && canSettle) {
      items.push({
        label: t('withdrawals.finishAction'),
        icon: CheckCircle2,
        disabled: busy,
        onSelect: () => setFinishTarget(w),
      });
    } else if (w.needsAttention && canSettle && !isRetryableSubmission(w)) {
      items.push({
        label: t('attention.resolve'),
        icon: CheckCircle2,
        disabled: busy,
        onSelect: () => setResolveTarget(w),
      });
    }
    return items;
  };

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
        <ClientIdentity
          name={clientName(w.user.firstName, w.user.lastName)}
          email={w.user.email}
          portalId={w.user.portalId}
        />
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
      /*
       * The destination alone now — the `provider` line that sat under it has
       * become the Method column below.
       *
       * It was the raw column value (`whish`), lower-cased and uppercased by
       * CSS, which is a machine key shown to a person. `methodName` is the
       * operator's own name for the rail, resolved server-side.
       */
      cell: (w) => (
        <div
          className="max-w-[180px] truncate font-mono text-xs text-muted-foreground"
          title={w.destination ?? ''}
        >
          {w.destination ?? '—'}
        </div>
      ),
    },
    {
      header: t('withdrawals.colMethod'),
      /*
       * NOT sortable, for the reason the destination column records:
       * `WITHDRAWAL_SORT_COLUMNS` has no entry for it, and R-2.5 makes an
       * unrecognised sort key a 400 rather than a silent fallback — so
       * declaring it here would replace "no sorting" with an error page.
       */
      sortable: false,
      /*
       * Never null: the API falls back to `provider` for withdrawals written
       * before the method table existed, so this cell always names something.
       */
      cell: (w) => <span className="whitespace-nowrap">{w.methodName}</span>,
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('withdrawals.colState'),
      ...sortableBy('state'),
      cell: (w) => (
        <>
          <span
            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${WITHDRAWAL_STATE_META[w.state].classes}`}
          >
            {t(WITHDRAWAL_STATE_META[w.state].labelKey)}
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
            <div
              className="mt-1 max-w-[13rem] truncate font-mono text-[11px] text-muted-foreground"
              title={w.providerRef}
              data-external-ref=""
            >
              {w.providerRef}
            </div>
          )}
          {/* Where the payout is INSIDE the awaiting state: submitted to Rival,
              outcome-unknown, or refused-needs-a-human. Renders nothing on any
              other row. */}
          <PayoutStatusBadge w={w} />
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
      align: 'right',
      // The actions column, marked as every desk's is: pinned to the edge, and
      // left out of the record's detail panel, whose footer already holds these
      // actions as buttons (it listed this menu as a field, "View details" and
      // all, opening the panel it was in).
      sticky: 'end',
      /*
       * ── ONE MENU, plus one self-hiding button ────────────────────────────
       *
       * Pending rows offer Approve/Reject; `approved` rows offer Cancel — back
       * from its removal, because D-66's rail lifecycle means rows now LIVE in
       * `approved` while Rival processes the payout, and "approved, then the
       * client called to stop it" needs a console path again. Cancel goes
       * through the API's Rival-first sequence and refuses cleanly once Rival
       * is already paying.
       *
       * Mark-as-paid stays gone: settlement on the rail arrives from Rival via
       * webhook/reconciler, and a manual settle button beside an in-flight
       * payout is an invitation to double-record it.
       *
       * `ResendPayoutButton` renders OUTSIDE the menu and only on the narrow
       * needs-attention case where the first submission definitively failed —
       * an inline button, because a row needing a human is the one row where
       * the action should not hide behind a menu.
       *
       * DETAILS is always present, including on rows with no action left. It is
       * the only way to read why something failed or was rejected: the reason
       * lives in one column that serves both — see `transactions.service.ts`,
       * which writes `rejectionReason` on a failure too.
       */
      cell: (w) => {
        const items = actionsFor(w);

        items.push({
          label: t('withdrawals.detailsAction'),
          icon: Info,
          separatorBefore: items.length > 0,
          onSelect: () => opened.open(w.id),
        });

        return (
          <div className="flex items-center justify-end gap-2">
            <ResendPayoutButton w={w} disabled={busy} onDone={invalidate} />
            <RowActions
              items={items}
              busy={busy}
              // Named per ROW. A column of identical triggers announces as
              // "button" to a screen reader with nothing to say which payout
              // each one acts on.
              label={t('withdrawals.actionsFor', {
                name: clientLabel(w.user),
              })}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
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

      {/*
        `QueueToolbar`, shared with the partner-application queue. These two and
        KYC are the same screen with different nouns, and they had three
        different filter controls between them — pills here, bordered tabs
        there, and only KYC had a search box at all.

        Rendered regardless of `query.status`, unlike the strip it replaces: a
        toolbar that appears only once the rows have loaded means the filter and
        the search box vanish on every refetch, including the one a failed load
        leaves behind — so a reader could not narrow the query that had just
        failed. Counts are simply absent until they arrive.
      */}
      <WithdrawalRecordSheet
        open={opened}
        columns={columns}
        actions={actionsFor}
        extraActions={(w) => <ResendPayoutButton w={w} disabled={busy} onDone={invalidate} />}
      />

      <div className="shrink-0">
        <QueueToolbar
          filters={FILTERS.map((f) => ({
            value: f.value,
            label: t(f.labelKey),
            /* `counts` groups every state over the FULL set, so it stays
               correct whatever page is shown — unlike `total`, which is the
               filtered count for the current query (R-2.4). */
            count: countOf(f.value === ALL_STATES ? 'all' : f.value),
          }))}
          active={filter}
          onFilterChange={(value) => {
            // State and page written together, so a filter change always lands
            // on page one — page 4 of "pending" is usually past the end of
            // "rejected", and an empty table reads as an empty queue.
            //
            // Every tab writes its value EXPLICITLY, including Pending: dropping
            // the parameter for the default would make the tab and the URL
            // disagree the moment the default changes, and "all" has to be
            // written or it cannot be told from "not chosen".
            url.set({ state: value, page: undefined });
          }}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            url.set({ page: undefined });
          }}
          searchPlaceholder={t('withdrawals.searchPlaceholder')}
          searchAriaLabel={t('withdrawals.searchAria')}
          extra={
            <DateRangePicker
              choice={period.choice}
              custom={period.custom}
              defaultChoice={period.defaultChoice}
              onChange={period.set}
            />
          }
        />
      </div>

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
          onRowClick={(w) => opened.open(w.id)}
          activeRowKey={opened.openId}
          rowLabel={withdrawalRowLabel}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={ArrowUpRight}
              message={
                // `filter` is never falsy (the default tab is Pending), so the
                // unfiltered wording was unreachable. "Nothing at all" is the
                // All tab with no search term.
                filter !== ALL_STATES || debouncedSearch
                  ? t('withdrawals.emptyFiltered')
                  : t('withdrawals.empty')
              }
              action={<PeriodWiden choice={period.choice} onChange={period.set} />}
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

      {/* Cancel — an approved rail payout pulled back from Rival (D-66).
          Same reason rules as reject (FR-ADM-03): the client reads this
          sentence in an email after having been told "approved". */}
      <CancelWithdrawalDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={invalidate}
      />

      <FinishPayoutDialog
        target={finishTarget}
        onClose={() => setFinishTarget(null)}
        onDone={invalidate}
      />

      <ResolveAttentionDialog
        target={
          resolveTarget && {
            id: resolveTarget.id,
            direction: 'withdrawal',
            amount: resolveTarget.amount,
            currency: resolveTarget.currency,
            reason: resolveTarget.attentionReason,
            portalId: resolveTarget.user.portalId,
          }
        }
        onClose={() => setResolveTarget(null)}
        onDone={invalidate}
      />

      {/* Reject — reason from the configurable list (FR-ADM-03) */}
      <Modal
        busy={reject.isPending}
        open={rejectTarget !== null}
        onClose={closeReject}
        labelledBy="reject-withdrawal-title"
        title={t('withdrawals.rejectTitle')}
        description={
          rejectTarget
            ? t('withdrawals.rejectIntro', {
                // A masked email reads "{email}" in the sentence; the label never does.
                email: clientLabel(rejectTarget.user),
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
            <label id="reject-reason-label" className="text-xs font-semibold">
              {t('withdrawals.rejectionReason')}
            </label>
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger aria-labelledby="reject-reason-label" className="mt-1 h-9 w-full">
                <SelectValue placeholder={t('withdrawals.selectReason')}>
                  {reasons.find((r) => r.id === reasonId)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <ReasonOption reason={r} />
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

        <ArabicTextField
          id="wd-note-ar"
          label={t(reasons.length > 0 ? 'arabic.noteLabel' : 'arabic.reasonLabel')}
          value={reasonNoteAr}
          onChange={setReasonNoteAr}
          maxLength={500}
          multiline
          rows={2}
          className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm focus-outline"
        />

        {reject.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {apiErrorMessage(reject.error, t('withdrawals.rejectFailed'))}
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
