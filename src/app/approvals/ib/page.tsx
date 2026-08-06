'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Handshake } from 'lucide-react';
import api from '@/lib/api';
import type { IbApplicationPage, IbApplicationStatus } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
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

  const columns: Column<Row>[] = [
    {
      header: t('partnerReview.colApplicant'),
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
      cell: (row) => <StatusBadge status={row.application.status} />,
    },
    {
      header: t('partnerReview.colActions'),
      sortable: false,
      cell: (row) => {
        if (row.application.status !== 'pending') {
          return (
            <span className="text-xs text-muted-foreground">
              {row.application.reviewedAt ? formatDate(row.application.reviewedAt) : '—'}
            </span>
          );
        }
        return (
          <div className="flex flex-wrap items-center gap-2">
            {canApprove && (
              <button
                type="button"
                onClick={() => approve.mutate(row.application.id)}
                disabled={approve.isPending}
                className="inline-flex h-8 items-center rounded-md bg-success px-3 text-xs font-semibold text-success-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
              >
                {t('partnerReview.approve')}
              </button>
            )}
            {canReject && (
              <button
                type="button"
                onClick={() => setRejecting(row)}
                className="inline-flex h-8 items-center rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 focus-outline"
              >
                {t('partnerReview.reject')}
              </button>
            )}
            {!canApprove && !canReject && (
              <span className="text-xs text-muted-foreground">{t('partnerReview.readOnly')}</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('partnerReview.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('partnerReview.subtitle')}</p>
      </div>

      {/* Counts come from the same response as the rows and are scoped
          identically, so a restricted admin is never promised more than they
          will be shown. */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('partnerReview.title')}>
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
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
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
      >
        <DataTable
          caption={t('partnerReview.caption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.application.id}
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
        `rbac/role-row.tsx` records for its confirmation dialog.
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
