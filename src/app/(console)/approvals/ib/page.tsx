'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Handshake, X } from 'lucide-react';
import api from '@/lib/api';
import type { IbApplicationPage, IbApplicationStatus } from '@/lib/api/admin';
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
import { t } from '@/lib/i18n';

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

  const [status, setStatus] = React.useState<IbApplicationStatus | ''>('pending');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [rejecting, setRejecting] = React.useState<Row | null>(null);

  const query = useResource<IbApplicationPage>(
    ['admin', 'ib-applications', status, page, pageSize],
    (signal) =>
      api.admin.getIbApplications({ status: status || undefined, page, limit: pageSize }, signal),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'ib-applications'] });

  const approve = useMutation({
    mutationFn: (id: string) => api.admin.approveIbApplication(id),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: (input: { id: string; reason?: string; note?: string }) =>
      api.admin.rejectIbApplication(input.id, { reason: input.reason, note: input.note }),
    onSuccess: async () => {
      setRejecting(null);
      await invalidate();
    },
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
  const approvingId = approve.isPending ? approve.variables : undefined;

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
   * NO COLUMN HERE SORTS, and every one says so explicitly.
   *
   * `GET /admin/ib/applications` accepts `status`, `page` and `limit` and
   * nothing else — the store hardcodes `ORDER BY submitted_at DESC`. DataTable
   * treats a column as sortable unless told otherwise, deriving a key from the
   * header text, so silence would turn all four of these into sort buttons that
   * reorder the current page and present it as the queue.
   *
   * This list is also paginated, which is what makes that the damaging kind of
   * wrong: "the longest-waiting application" would mean the longest-waiting of
   * the twenty-five on screen. When the endpoint gains a sort allowlist, mirror
   * it as a `sortableBy()` helper the way `client-columns.tsx` does.
   */
  const columns: Column<Row>[] = [
    {
      header: t('partnerReview.colApplicant'),
      sortable: false,
      cell: (row) => (
        <div className="min-w-0">
          {/* The client, not just their name — a reviewer deciding whether to
              pay somebody wants to see the account behind the request. */}
          <Link
            href={`/clients/${row.user.id}`}
            className="font-semibold text-link hover:underline focus-outline"
          >
            {row.user.firstName} {row.user.lastName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{row.user.email}</p>
        </div>
      ),
    },
    {
      header: t('partnerReview.colSubmitted'),
      sortable: false,
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
      header: t('partnerReview.colVolume'),
      sortable: false,
      // Labelled as self-reported. It is a number the applicant typed, and a
      // bare figure in a table reads as something the platform measured.
      cell: (row) =>
        row.application.expectedVolume ? (
          <span className="text-xs">{row.application.expectedVolume}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('partnerReview.notGiven')}</span>
        ),
    },
    {
      header: t('partnerReview.colStatus'),
      sortable: false,
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
                onSelect: () => approve.mutate(row.application.id),
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

      {/* Counts come from the same response as the rows and are scoped
          identically, so a restricted admin is never promised more than they
          will be shown. */}
      <div
        className="flex shrink-0 flex-wrap gap-2"
        role="tablist"
        aria-label={t('partnerReview.title')}
      >
        {TABS.map((tab) => {
          const active = status === tab.value;
          const count = tab.value ? counts?.[tab.value] : undefined;
          return (
            <button
              key={tab.value || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStatus(tab.value);
                // Back to the first page: page 3 of "pending" is rarely page 3
                // of "rejected", and landing on an empty page reads as an empty
                // queue.
                setPage(1);
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-xs font-semibold focus-outline ${
                active
                  ? 'border-primary bg-primary/10 text-link'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {t(tab.labelKey)}
              {count !== undefined && count > 0 && (
                <span className="tabular rounded-full bg-muted px-1.5 text-[11px]">{count}</span>
              )}
            </button>
          );
        })}
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
        endpoints={['GET /admin/ib/applications?status&page&limit']}
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
