'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileCheck } from 'lucide-react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { DataTable, EmptyState, type Column } from '@/components/data-table';

type KycStatus = 'not_started' | 'in_progress' | 'submitted' | 'under_review' | 'approved' | 'rejected';

interface KycRow {
  userId: string;
  status: KycStatus;
  submittedAt?: string;
  reviewedAt?: string;
  user?: { email: string; firstName: string; lastName: string };
  personalInfo?: { country?: string; nationality?: string };
}

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
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

interface KycListResponse {
  items: KycRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export default function AdminKycPage() {
  const { admin } = useAdmin();
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

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const counts = query.data?.counts ?? {};
  const loading = query.status === 'loading';

  const columns: Column<KycRow>[] = [
    {
      header: 'User',
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
      header: 'Country',
      sortable: true,
      sortKey: 'country',
      cell: (row) => (
        <span className="text-muted-foreground">{row.personalInfo?.country ?? '—'}</span>
      ),
    },
    {
      header: 'Status',
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
      header: 'Submitted',
      sortable: true,
      sortKey: 'submittedAt',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: 'Reviewed',
      sortable: true,
      sortKey: 'reviewedAt',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: 'Action',
      align: 'right',
      cell: (row) => (
        <Link
          href={`/kyc/${row.userId}`}
          className="inline-flex items-center gap-1 font-semibold text-xs text-link hover:underline focus-outline rounded-sm"
          aria-label={`Review KYC submission of ${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim()}
        >
          <span>Review</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KYC Submissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts['all'] ?? 0} total submissions
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
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
              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                {f.value ? counts[f.value] ?? 0 : counts['all'] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <Input
          className="max-w-xs h-9"
          placeholder="Search by name or email..."
          aria-label="Search submissions by name or email"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      {/* DataTable */}
      <DataTable
        caption="KYC Submissions"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.userId}
        selectable={true}
        loading={loading}
        loadingText="Loading KYC submissions..."
        dimmed={query.isFetching}
        empty={<EmptyState icon={FileCheck} message="No submissions match the current filters." />}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          noun: ['submission', 'submissions'],
        }}
      />
    </div>
  );
}
