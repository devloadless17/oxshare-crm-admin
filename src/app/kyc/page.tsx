'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { components } from '@/lib/api/types.gen';
import Link from 'next/link';
import { ChevronRight, FileCheck } from 'lucide-react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useSequentialMutation } from '@/hooks/use-sequential-mutation';
import { AsyncBoundary } from '@/components/async-boundary';
import { BatchProgress } from '@/components/batch-actions';
import { ExportButton } from '@/components/export-button';
import { useDebounced } from '@/hooks/use-debounced';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { t } from '@/lib/i18n';

type KycStatus =
  'not_started' | 'in_progress' | 'submitted' | 'under_review' | 'approved' | 'rejected';

/**
 * Aliases, not hand-written copies — R-1.1.
 *
 * Both of these were declared by hand beside a generated schema that already
 * described them (`KycSubmissionDto`, `KycListResponseDto`). A hand-written
 * shape removes the only mechanism that turns backend drift into a compile
 * error, and it does so silently: the page keeps building against a description
 * of an API that has moved.
 */
type KycRow = components['schemas']['KycSubmissionDto'];

// Semantic tokens from globals.css — resolved at render, so they flip with the theme.
const STATUS_COLORS: Record<KycStatus, string> = {
  not_started: 'var(--muted-foreground)',
  in_progress: 'var(--warning)',
  submitted: 'var(--link)',
  under_review: 'var(--info)',
  approved: 'var(--success)',
  rejected: 'var(--destructive)',
};

const STATUS_LABELS: Record<KycStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: t('kycReview.filterAll') },
  { value: 'submitted', label: t('kycReview.colSubmitted') },
  { value: 'under_review', label: t('kycReview.filterUnderReview') },
  { value: 'approved', label: t('kycReview.filterApproved') },
  { value: 'rejected', label: t('kycReview.filterRejected') },
];

type KycListResponse = components['schemas']['KycListResponseDto'];

/**
 * When a waiting submission starts reading as a problem rather than a queue.
 *
 * An ASSUMPTION, not a specification — no document states an SLA for KYC
 * review. The client portal already tells clients "this usually takes 1–2
 * business days", so anything past that is already outside what they were
 * promised, and 3 leaves a day of slack before it is called out.
 */
const STALE_AFTER_DAYS = 3;

/**
 * Whole days a submission has been waiting for a decision, or `null` if it is
 * not waiting for one.
 *
 * Only `submitted` and `under_review` are waiting: a client still filling in
 * their details is not queued, and a decided one is not waiting.
 */
/**
 * How a row is named in a batch failure list.
 *
 * The person, not the id — "Amina Haddad — already approved" is a sentence a
 * reviewer can act on, while a UUID means opening the row to find out who it
 * was. Falls back to the email, then the id, because a submission whose profile
 * has not loaded still has to be identifiable when it fails.
 */
function describeRow(row: KycRow): string {
  const name = [row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ');
  return name || row.user?.email || row.userId;
}

function daysWaiting(row: KycRow): number | null {
  if (row.status !== 'submitted' && row.status !== 'under_review') return null;
  if (!row.submittedAt) return null;
  const elapsed = Date.now() - new Date(row.submittedAt).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

export default function AdminKycPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const debouncedSearch = useDebounced(search.trim());

  // Server-side filtering/search/pagination; counts come from the API over
  // the full set, so tab counts stay correct while a filter is active.
  const query = useResource<KycListResponse>(
    ['kyc', page, pageSize, filter, debouncedSearch],
    async (signal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (filter) params.set('status', filter);
      if (debouncedSearch) params.set('q', debouncedSearch);
      return (await api.get<KycListResponse>(`/admin/kyc?${params}`, { signal })).data;
    },
  );

  /*
   * The list's own filters, minus paging — the export layer strips page/limit
   * itself, but building them from the same two pieces of state is what keeps
   * "export what I am looking at" true when a filter is added later.
   */
  const exportFilters = new URLSearchParams();
  if (filter) exportFilters.set('status', filter);
  if (debouncedSearch) exportFilters.set('q', debouncedSearch);

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const counts = query.data?.counts ?? {};
  const loading = query.status === 'loading';

  const { admin } = useAdmin();
  const canApprove = hasPermission(admin, 'kyc.approve');
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);

  /*
   * Batch approve is a LOOP, and the UI says so.
   *
   * There is no bulk KYC route — approval is `PATCH /admin/kyc/:userId/approve`,
   * one identity at a time, which is right: each approval is a separate
   * regulated decision with its own audit entry. So this sends them in
   * sequence and reports per-row outcomes rather than a single success.
   *
   * ONLY APPROVE IS OFFERED. Rejection needs a reason per submission — the
   * detail page makes the reviewer pick one — and a batch reject would either
   * invent a shared reason or send an empty one, which is a compliance record
   * that says nothing about why a specific person was refused.
   */
  const batch = useSequentialMutation<KycRow>(async (row) => {
    await api.patch(`/admin/kyc/${row.userId}/approve`);
  });

  const approveSelected = async () => {
    const chosen = rows.filter((r) => selected.includes(r.userId));
    if (chosen.length === 0) return;
    if (!window.confirm(t('batch.confirmApprove', { count: chosen.length }))) return;

    await batch.run(chosen);
    setSelected([]);
    await queryClient.invalidateQueries({ queryKey: ['kyc'] });
  };

  /*
   * Only rows that CAN be approved are offered. A selection spanning approved
   * and rejected rows would send requests the API refuses one at a time, and
   * present the refusals as failures of the batch rather than of the choice.
   */
  const approvable = rows.filter(
    (r) => selected.includes(r.userId) && r.status === 'submitted',
  ).length;

  const renderBatchActions = () => (
    <>
      {batch.isRunning ? (
        <BatchProgress state={batch} onCancel={batch.cancel} describe={describeRow} />
      ) : (
        <button
          type="button"
          onClick={() => void approveSelected()}
          disabled={approvable === 0}
          className="rounded bg-primary/15 px-2 py-1 font-medium transition-colors hover:bg-primary/20 disabled:opacity-40"
        >
          {t('batch.approveSelected')} ({approvable})
        </button>
      )}
    </>
  );

  const columns: Column<KycRow>[] = [
    {
      header: t('kycReview.colUser'),
      sortable: true,
      sortKey: 'userId',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-xs text-primary-foreground">
            {(row.user?.firstName?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-foreground">
              {[row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ') || '—'}
            </div>
            <div className="text-xs text-muted-foreground">{row.user?.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: t('kycReview.colCountry'),
      sortable: true,
      sortKey: 'country',
      cell: (row) => (
        <span className="text-muted-foreground">{row.personalInfo?.country ?? '—'}</span>
      ),
    },
    {
      header: t('kycReview.colStatus'),
      sortable: true,
      sortKey: 'status',
      cell: (row) => (
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
          style={{
            background: `color-mix(in srgb, ${STATUS_COLORS[row.status]} 13%, transparent)`,
            color: STATUS_COLORS[row.status],
            border: `1px solid color-mix(in srgb, ${STATUS_COLORS[row.status]} 27%, transparent)`,
          }}
        >
          {STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      header: t('kycReview.colSubmitted'),
      sortable: true,
      sortKey: 'submittedAt',
      cell: (row) => {
        const waiting = daysWaiting(row);
        return (
          <span className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
            </span>
            {/* How long this client has been waiting, and a warning once it is
                long. The queue sorts newest-first, so without this the OLDEST
                unreviewed submissions sink to the bottom and are the least
                likely to be looked at — while their owners are waiting on
                level 1 to withdraw their own money. */}
            {waiting !== null && (
              <span
                className={`text-xs font-semibold ${
                  waiting >= STALE_AFTER_DAYS ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {t('kycReview.waitingDays', { days: waiting })}
              </span>
            )}
          </span>
        );
      },
    },
    {
      header: t('kycReview.colReviewed'),
      sortable: true,
      sortKey: 'reviewedAt',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: t('kycReview.colAction'),
      align: 'right',
      cell: (row) => (
        <Link
          href={`/kyc/${row.userId}`}
          className="inline-flex items-center gap-1 font-semibold text-xs text-link hover:underline focus-outline rounded-sm"
          aria-label={`Review KYC submission of ${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim()}
        >
          <span>{t('kycReview.review')}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-6">
      {/* Page Header */}
      <div className="flex shrink-0 flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('kycReview.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('kycReview.totalSubmissions', { count: counts['all'] ?? 0 })}
          </p>
        </div>
        {/* The same filters the list is showing, so "export what I am looking
            at" is the query the screen already built rather than a second one. */}
        <ExportButton resource="kyc" filters={exportFilters} disabled={total === 0} />
      </div>

      {/*
       * The batch outcome lives OUTSIDE the table's selection bar.
       *
       * That bar disappears when the selection clears, which is exactly what a
       * finished batch does — so a partial failure reported inside it would
       * vanish at the moment it became the only record of which rows did not go
       * through.
       */}
      {!batch.isRunning && batch.hasFailures && (
        <div className="shrink-0">
          <BatchProgress state={batch} onCancel={batch.cancel} describe={describeRow} />
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex shrink-0 flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-outline ${
                filter === f.value
                  ? 'bg-primary/10 font-semibold text-link'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              onClick={() => {
                setPage(1);
                setFilter(f.value);
              }}
              aria-pressed={filter === f.value}
            >
              <span>{f.label}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {f.value ? (counts[f.value] ?? 0) : (counts['all'] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <Input
          className="max-w-xs h-9"
          placeholder={t('kycReview.searchPlaceholder')}
          aria-label={t('kyc.searchAria')}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      {/*
        A failed load used to fall through to `rows = []` and render "No
        submissions match the current filters." — so an API outage read to a
        reviewer as an empty backlog, and submissions waited while everyone
        believed there were none. On a compliance queue that is the expensive
        direction to be wrong in.

        AsyncBoundary is what every other screen in this app uses; this one was
        the exception. `loading` stays on DataTable so paging keeps its inline
        spinner instead of blanking the table on every page change.
      */}
      <AsyncBoundary
        status={query.status}
        label="Loading KYC submissions"
        endpoints={['GET /admin/kyc?status&q&page&limit']}
        onRetry={query.refetch}
        errorMessage="Failed to load the review queue. This is NOT an empty queue — submissions may be waiting."
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption="KYC Submissions"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.userId}
          selectable={canApprove}
          selectedRowKeys={selected}
          onSelectionChange={setSelected}
          renderBatchActions={renderBatchActions}
          loading={loading}
          loadingText="Loading KYC submissions..."
          dimmed={query.isFetching}
          empty={
            <EmptyState icon={FileCheck} message="No submissions match the current filters." />
          }
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            noun: ['submission', 'submissions'],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
