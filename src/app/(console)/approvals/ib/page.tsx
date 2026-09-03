'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Handshake, X } from 'lucide-react';
import api from '@/lib/api';
import type { IbApplicationPage, IbApplicationSortKey, IbApplicationStatus } from '@/lib/api/admin';
import { IB_APPLICATION_SORT_KEYS } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn, type RowAction } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { Badge } from '@/components/ui/badge';
import { PartnerRejectDialog } from '@/components/ib/partner-reject-dialog';
import { PartnerApproveDialog } from '@/components/ib/partner-approve-dialog';
import { QueueToolbar } from '@/components/queue-toolbar';
import { useDebounced } from '@/hooks/use-debounced';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { PermittedLink } from '@/components/permitted-link';
import { keys } from '@/lib/query-keys';

/**
 * The partner application queue.
 *
 * ## Approve and reject are gated separately, and the buttons follow
 *
 * `ib.approve` and `ib.reject` are distinct permissions, so an admin may hold
 * one and not the other. Each button checks its own, rather than both hiding
 * behind a single "can review" — a reviewer allowed to turn applications down
 * but not to create partners should see exactly that.
 *
 * ## Waiting is shown, not just recorded
 *
 * `daysWaiting` and the staleness highlight are the same treatment the KYC
 * queue uses. An application nobody has looked at for a week is a person who
 * asked to be paid to bring business and heard nothing, and a queue sorted by
 * date alone does not make that visible.
 */
type Row = IbApplicationPage['rows'][number];

/**
 * When a waiting application starts reading as a problem rather than a queue.
 *
 * An ASSUMPTION, matching the KYC screen's, not a documented SLA. Partner
 * applications are less time-critical than a verification blocking a deposit,
 * so this is deliberately longer.
 */
const STALE_AFTER_DAYS = 5;

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: IbApplicationSortKey) => ({ sortable: true as const, sortKey: key });

const TABS: Array<{ value: IbApplicationStatus | ''; labelKey: Parameters<typeof t>[0] }> = [
  { value: 'pending', labelKey: 'partnerReview.tabPending' },
  { value: 'approved', labelKey: 'partnerReview.tabApproved' },
  { value: 'rejected', labelKey: 'partnerReview.tabRejected' },
  { value: '', labelKey: 'partnerReview.tabAll' },
];

export default function PartnerApprovalsPage() {
  const { admin } = useAdmin();
  const canApprove = hasPermission(admin, 'ib.approve');
  const canReject = hasPermission(admin, 'ib.reject');
  const queryClient = useQueryClient();
  // Shadows `window.confirm` on purpose — same call shape, real dialog.

  const [status, setStatus] = React.useState<IbApplicationStatus | ''>('pending');
  /*
   * DEBOUNCED into the query key, not the input. The box stays instant while
   * the request waits for a pause in typing — `useDebounced` is what every
   * other searchable list here uses, and an undebounced key fires a request per
   * keystroke and races their responses.
   */
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [rejecting, setRejecting] = React.useState<Row | null>(null);
  /**
   * The sort, as the API's own two parameters.
   *
   * `null` is a real state and not a missing value: it is the third click of
   * DataTable's asc → desc → off cycle, and it means "drop both parameters and
   * let the endpoint apply its own default" — `submittedAt desc`, the queue
   * order. Substituting that default here instead would look identical on
   * screen and be a different request.
   */
  const [sort, setSort] = React.useState<{
    key: IbApplicationSortKey;
    order: 'asc' | 'desc';
  } | null>(null);

  /*
   * The sort is in the KEY as well as the request. A parameter missing from the
   * key makes React Query serve the previous ordering's cached page under the
   * new sort — rows that do not match what the header claims.
   */
  const query = useResource<IbApplicationPage>(
    keys.ibApplications.list([status, debouncedSearch, page, pageSize, sort?.key, sort?.order]),
    (signal) =>
      api.admin.getIbApplications(
        {
          status: status || undefined,
          q: debouncedSearch || undefined,
          page,
          limit: pageSize,
          sort: sort?.key,
          order: sort?.order,
        },
        signal,
      ),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.ibApplications.all() });

  /*
   * The row awaiting approval, held so the dialog can read its agency.
   *
   * Null closes it. A dialog rather than the previous `confirm()` because
   * approval now needs an INPUT for applications that carry no agency — see
   * PartnerApproveDialog.
   */
  const [approving, setApproving] = React.useState<IbApplicationPage['rows'][number] | null>(null);

  const approve = useMutation({
    mutationFn: ({ id, agencyId }: { id: string; agencyId?: string }) =>
      api.admin.approveIbApplication(id, {
        ...(agencyId ? { agencyId } : {}),
      }),
    onSuccess: async () => {
      await invalidate();
      setApproving(null);
      toastSuccess(t('partnerReview.approveSucceeded'));
    },
    // The dialog stays OPEN on failure, so a refusal the reviewer can act on —
    // a closed agency, a full parent — does not also lose their choice.
    onError: (error) => toastError(error, t('partnerReview.approveFailed')),
  });

  /**
   * Open the approval dialog for one row.
   *
   * The client is NAMED in it. This screen is a queue of near-identical rows and
   * the menu sits under the cursor for whichever one was clicked; "approve this
   * application" would confirm the action without confirming the row, which is
   * the mistake actually worth catching.
   */
  const confirmApprove = (row: IbApplicationPage['rows'][number]) => setApproving(row);

  const reject = useMutation({
    mutationFn: (input: { id: string; reason?: string; note?: string }) =>
      api.admin.rejectIbApplication(input.id, { reason: input.reason, note: input.note }),
    onSuccess: async () => {
      setRejecting(null);
      await invalidate();
      toastSuccess(t('partnerReview.rejectSucceeded'));
    },
    // Inline in the reject dialog, which stays open on failure so the reason
    // can be corrected.
  });

  const rows = query.data?.rows ?? [];
  const counts = query.data?.counts;
  const total = query.data?.total ?? 0;

  /*
   * WHICH application is being approved, not merely THAT one is.
   *
   * `approve.variables` is the id passed to the in-flight `mutate`, so the
   * spinner lands on the row being decided. The button this replaced disabled
   * itself on every pending row during any approval, which read as the whole
   * queue freezing over one decision.
   *
   * Rejection is not here: it goes through a dialog that owns its own saving
   * state, so the row is not what the operator is waiting on.
   */
  // `variables` is the mutation's INPUT, which is now an object rather than a
  // bare id — the busy row is the one whose id it carries.
  const approvingId = approve.isPending ? approve.variables?.id : undefined;

  /*
   * There is no batch approve here any more, and no selection column with it.
   *
   * It was a LOOP over the single-application route driven by checkboxes —
   * `useSequentialMutation` plus a `BatchProgress` bar — which bought
   * sequencing and honest partial-failure reporting rather than atomicity.
   * Removed on request; the row menu still approves one application at a time,
   * which is the gesture this queue is worked with. Rejection was never
   * batchable: it carries a reason the applicant reads, and one reason applied
   * to everybody is worse than no batch.
   */

  /*
   * The export carries the STATUS TAB, not the page.
   *
   * Same filter the list query is built from, so "export what I am looking at"
   * cannot drift from what is on screen. Paging is deliberately absent — the
   * export layer strips it anyway, and a file containing the twenty-five rows on
   * display while the button says it exports the queue is an audit problem.
   * "All" is an empty param set rather than `status=`, which the API would read
   * as a status of empty string.
   */
  const exportFilters = React.useMemo(
    () => new URLSearchParams(status ? { status } : {}),
    [status],
  );

  /*
   * THREE of these sort, and the fourth says explicitly that it does not.
   *
   * This queue accepted `status`, `page` and `limit` and nothing else when the
   * screen was built, so every column was correctly `sortable: false`. The
   * endpoint now carries an `IB_APPLICATION_SORT_COLUMNS` allowlist, and
   * `sortableBy` takes an `IbApplicationSortKey` — so the allowlist is enforced
   * by the compiler here rather than by reading a comment.
   *
   * The list is paginated, which is what made the old behaviour the damaging
   * kind of wrong and what makes the server-side sort worth having: "the
   * longest-waiting application" now means the longest-waiting of all of them
   * rather than of the twenty-five on screen.
   */
  const columns: Column<Row>[] = [
    {
      header: t('partnerReview.colApplicant'),
      /*
       * Sorts by the applicant's FIRST NAME — `userFirstName`, the key the
       * endpoint orders on, and what the cell leads with. `userEmail` is the
       * other allowlisted applicant key; it is not offered as a second header
       * because the email is a sub-line of this same column rather than a
       * column of its own.
       */
      ...sortableBy('userFirstName'),
      cell: (row) => (
        <div className="min-w-0">
          {/* The client, not just their name — a reviewer deciding whether to
              pay somebody wants to see the account behind the request. */}
          <PermittedLink
            href={`/clients/${row.user.id}`}
            className="font-semibold text-link hover:underline focus-outline"
          >
            {row.user.firstName} {row.user.lastName}
          </PermittedLink>
          <p className="truncate text-xs text-muted-foreground">{row.user.email}</p>
        </div>
      ),
    },
    {
      header: t('partnerReview.colSubmitted'),
      /*
       * The one sort this queue most needs, and now a real one.
       *
       * Ascending puts the LONGEST-waiting application first. The cell's
       * "waiting N days" warning exists because the default newest-first order
       * sinks the oldest undecided applications to the bottom — this makes the
       * fix reachable across the whole queue rather than within one page.
       */
      ...sortableBy('submittedAt'),
      cell: (row) => {
        const days = daysWaiting(row.application);
        return (
          <div>
            <span className="tabular">{formatDate(row.application.submittedAt)}</span>
            {days !== null && days >= STALE_AFTER_DAYS && (
              <span className="ml-2 text-xs font-semibold text-warning">
                {t('partnerReview.waitingDays', { days: String(days) })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      /*
       * THE PROGRAMME APPLIED FOR, and the reason this column exists at all:
       * approving GRANTS this agency, so a reviewer deciding without seeing it
       * is deciding blind.
       *
       * Not sortable — `agencyName` is resolved after the paged query, so the
       * endpoint's allowlist has no column for it and offering the control
       * would promise an ordering the server cannot honour.
       */
      header: t('partnerReview.colAgency'),
      sortable: false,
      cell: (row) =>
        row.agencyName ? (
          <span className="text-xs">{row.agencyName}</span>
        ) : (
          /*
            An older application, submitted before an agency was required. It
            cannot be approved as-is — the dialog asks the reviewer to pick one,
            and the API refuses without it — so this reads as the pending
            decision it is rather than as a blank field.
          */
          <span className="text-xs text-warning">{t('partnerReview.noAgency')}</span>
        ),
    },
    {
      header: t('partnerReview.colStatus'),
      ...sortableBy('status'),
      cell: (row) => <StatusBadge status={row.application.status} />,
    },
    actionsColumn<Row>((row) => {
      /*
       * A DECIDED application has no actions — it has a date.
       *
       * Approve and reject exist only for `pending`; the API refuses them on
       * anything else. So a settled row shows WHEN it was settled instead, which
       * is the only thing left worth reading in this column.
       */
      if (row.application.status !== 'pending') {
        return (
          <span className="text-xs text-muted-foreground">
            {row.application.reviewedAt ? formatDate(row.application.reviewedAt) : '—'}
          </span>
        );
      }

      /*
       * Each entry checks its OWN permission.
       *
       * `ib.approve` and `ib.reject` are distinct, so an admin may hold one and
       * not the other — a reviewer allowed to turn applications down but not to
       * create partners should see exactly one entry. An admin with neither gets
       * an empty array, and `RowActions` renders nothing at all rather than a
       * trigger whose menu is empty.
       */
      const items: RowAction[] = [
        ...(canApprove
          ? [
              {
                label: t('partnerReview.approve'),
                icon: Check,
                /*
                 * CONFIRMED, like reject already was.
                 *
                 * Approving is not a reversible tick: it creates the partner
                 * account, mints a referral code that is never reissued, and
                 * places them on a rung of the ladder — and `approve` refuses a
                 * second decision on the same application, so there is no
                 * "undo" to reach for afterwards. A menu item one row away from
                 * "Reject" that fires on a single click is the one place in this
                 * screen a slip is unrecoverable.
                 *
                 * Not `destructive` — it paints the button red, and this
                 * creates rather than destroys. The dialog is here for
                 * irreversibility, not for danger.
                 */
                onSelect: () => void confirmApprove(row),
              },
            ]
          : []),
        ...(canReject
          ? [
              {
                label: t('partnerReview.reject'),
                icon: X,
                destructive: true,
                separatorBefore: true,
                // Opens the page's dialog rather than rejecting outright: a
                // rejection carries a reason the client reads.
                onSelect: () => setRejecting(row),
              },
            ]
          : []),
      ];

      // Said once, where the buttons used to be. A reviewer with neither
      // permission would otherwise see a blank cell and no reason for it.
      if (items.length === 0) {
        return <span className="text-xs text-muted-foreground">{t('partnerReview.readOnly')}</span>;
      }

      return (
        <RowActions
          label={t('table.rowActions', {
            name: `${row.user.firstName} ${row.user.lastName}`,
          })}
          busy={approvingId === row.application.id}
          items={items}
        />
      );
    }, t('partnerReview.colActions')),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('partnerReview.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('partnerReview.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            resource="ib/applications"
            filters={exportFilters}
            disabled={rows.length === 0}
          />
        </div>
      </div>

      {/*
        Counts come from the same response as the rows and are scoped
        identically, so a restricted admin is never promised more than they will
        be shown.

        `QueueToolbar` is shared with the withdrawals queue — these two and KYC
        are the same screen with different nouns, and they had three different
        filter controls between them.
      */}
      <div className="shrink-0">
        <QueueToolbar
          filters={TABS.map((tab) => ({
            value: tab.value,
            label: t(tab.labelKey),
            count: tab.value ? counts?.[tab.value] : undefined,
          }))}
          active={status}
          onFilterChange={(value) => {
            setStatus(value);
            // Back to the first page: page 3 of "pending" is rarely page 3 of
            // "rejected", and landing on an empty page reads as an empty queue.
            setPage(1);
          }}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={t('partnerReview.searchPlaceholder')}
          searchAriaLabel={t('partnerReview.searchAria')}
        />
      </div>

      {/* The API's own refusal, verbatim — "that partner already holds 3 of
          their 3 direct partners" names the number the reviewer needs. */}
      {approve.isError && (
        <div
          role="alert"
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {apiErrorMessage(approve.error, t('partnerReview.approveFailed'))}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('partnerReview.loading')}
        endpoints={['GET /admin/ib/applications?status&page&limit&sort&order']}
        onRetry={query.refetch}
        errorMessage={t('partnerReview.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('partnerReview.caption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.application.id}
          /*
           * NO SELECTION COLUMN, on request.
           *
           * The checkboxes drove one batch action — approve — which was a LOOP
           * over the single-application route rather than a batch endpoint, so
           * it bought sequencing and a progress bar rather than atomicity. Each
           * application is still approvable from its own row menu, which is the
           * gesture this queue is actually worked with.
           *
           * `selectable`, `selectedRowKeys`, `onSelectionChange`,
           * `renderBatchActions` and the `useSequentialMutation` machinery
           * behind them are removed together — a selection with nothing to act
           * on is a column of controls that does nothing.
           */
          dimmed={query.isFetching}
          empty={<EmptyState icon={Handshake} message={t('partnerReview.empty')} />}
          sortColumn={sort?.key}
          sortDirection={sort?.order}
          /*
           * Server-side. Passing this also switches DataTable out of its
           * client-side path, so a header click orders the whole queue rather
           * than the twenty-five rows on screen.
           *
           * `setPage(1)` because reordering renumbers every page: the rows at
           * positions 26–50 under the new sort are not the ones that were there
           * under the old.
           */
          onSortChange={(key, order) => {
            /*
             * Checked against the allowlist rather than cast to it.
             *
             * Only allowlisted columns are marked sortable, so this should
             * always hold — but `key` arrives as a bare string, and a cast
             * would make a future column with a typo'd key compile cleanly and
             * 400 at runtime. Falling back to `null` clears the sort instead,
             * which is a state the endpoint accepts.
             */
            const next = IB_APPLICATION_SORT_KEYS.find((allowed) => allowed === key);
            setSort(next && order ? { key: next, order } : null);
            setPage(1);
          }}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />
      </AsyncBoundary>

      {/*
        Owned by the PAGE, not by the row.
        A dialog mounted per row means one copy per row, and the copy unmounts
        mid-transition when a refetch replaces the list — the same rule
        `components/row-actions.tsx` records for its confirmation dialog.
      */}
      <PartnerApproveDialog
        open={approving !== null}
        name={
          approving
            ? `${approving.user.firstName} ${approving.user.lastName}`.trim() ||
              approving.user.email
            : ''
        }
        // Null means the application named none, which is what makes the dialog
        // ask instead of confirm. The resolved name lives on the ROW — the list
        // endpoint attaches it beside the application, never inside it, so
        // reading `application.agencyName` here would always find undefined and
        // force the chooser on every application.
        requestedAgencyName={approving?.agencyName ?? null}
        saving={approve.isPending}
        onClose={() => {
          setApproving(null);
          approve.reset();
        }}
        onConfirm={({ agencyId }) => {
          if (!approving) return;
          approve.mutate({ id: approving.application.id, agencyId });
        }}
      />

      <PartnerRejectDialog
        open={rejecting !== null}
        applicantName={rejecting ? `${rejecting.user.firstName} ${rejecting.user.lastName}` : ''}
        saving={reject.isPending}
        error={
          reject.isError
            ? apiErrorMessage(reject.error, t('partnerReview.rejectFailed'))
            : undefined
        }
        onCancel={() => {
          setRejecting(null);
          reject.reset();
        }}
        onConfirm={(input) => {
          if (!rejecting) return;
          reject.mutate({ id: rejecting.application.id, ...input });
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: IbApplicationStatus }) {
  if (status === 'approved') {
    return <span className="text-success">{t('partnerReview.statusApproved')}</span>;
  }
  if (status === 'rejected') {
    return <span className="text-destructive">{t('partnerReview.statusRejected')}</span>;
  }
  return <Badge variant="tag">{t('partnerReview.statusPending')}</Badge>;
}

/**
 * Whole days an application has been waiting, or `null` if it is not waiting.
 *
 * A decided application is not waiting for anything, so it has no age worth
 * highlighting — returning a number for it would paint week-old approvals as
 * overdue.
 */
function daysWaiting(application: Row['application']): number | null {
  if (application.status !== 'pending') return null;
  const submitted = new Date(application.submittedAt).getTime();
  if (Number.isNaN(submitted)) return null;
  return Math.floor((Date.now() - submitted) / 86_400_000);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
