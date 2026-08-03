'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import api from '@/lib/api';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';

// ADM-11: partner / IB application management — full lifecycle, parent assignment.
// IB-01: approval status gates the partner portal. Hierarchy is two levels max
// (L1 + L2).
//
// This shape is hand-written because /admin/partners does not exist yet, so
// there is nothing in types.gen.ts to alias. Replace it with the generated
// alias the moment the endpoint lands (docs/DECISIONS.md D-31) — every other
// screen already imports its types from the backend's Swagger.
interface PartnerRow {
  id: string;
  user?: { email: string; firstName?: string; lastName?: string };
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  parentIb?: { id: string; name: string } | null;
  program?: string;
  referralCode?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<PartnerRow['status'], string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  approved: 'bg-success/10 text-success border-success/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  suspended: 'bg-muted text-muted-foreground border-border',
};

export default function PartnersPage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'partners.manage');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  const { status, data, isFetching, refetch } = useResource<PartnerRow[]>(
    ['partners'],
    async (signal) => (await api.get<PartnerRow[]>('/admin/partners', { signal })).data,
  );

  const decide = useMutation({
    mutationFn: ({ row, action }: { row: PartnerRow; action: 'approve' | 'reject' }) =>
      api.patch(`/admin/partners/${row.id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partners'] }),
  });

  const rows = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (filter && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.user?.email?.toLowerCase().includes(q) ||
        p.user?.firstName?.toLowerCase().includes(q) ||
        p.user?.lastName?.toLowerCase().includes(q) ||
        p.referralCode?.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  const columns: Column<PartnerRow>[] = [
    {
      header: 'Partner',
      cell: (p) => (
        <>
          <div className="font-medium text-foreground">
            {[p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="text-xs text-muted-foreground">{p.user?.email}</div>
        </>
      ),
    },
    {
      header: 'Status',
      cell: (p) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[p.status] ?? ''}`}
        >
          {p.status}
        </span>
      ),
    },
    {
      header: 'Parent IB',
      cell: (p) => (p.parentIb ? p.parentIb.name : <span className="text-xs">— (L1)</span>),
      cellClassName: 'text-muted-foreground',
    },
    { header: 'Program', cell: (p) => p.program ?? '—', cellClassName: 'text-muted-foreground' },
    {
      header: 'Referral Code',
      cell: (p) => p.referralCode ?? '—',
      cellClassName: 'font-mono text-xs text-muted-foreground',
    },
    {
      header: 'Applied',
      cell: (p) => (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'),
      cellClassName: 'text-muted-foreground',
    },
    {
      header: 'Actions',
      // Approve/reject need partners.manage on the API. Rendering them to a
      // read-only admin only produces a 403 they cannot act on.
      cell: (p) =>
        p.status !== 'pending' ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : !canManage ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide.mutate({ row: p, action: 'approve' })}
              disabled={decide.isPending}
              className="h-8 px-3 rounded-md bg-success text-success-foreground text-xs font-semibold hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => decide.mutate({ row: p, action: 'reject' })}
              disabled={decide.isPending}
              className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              Reject
            </button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Partners / IBs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Introducing-broker applications and lifecycle — approval gates the partner portal
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search partners by name, email or referral code"
          placeholder="Search by name, email, code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-outline"
        />
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-outline"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        {decide.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {apiErrorMessage(decide.error, 'Failed to update the application.')}
          </p>
        )}
      </div>

      <AsyncBoundary
        status={status}
        label="Loading partners"
        endpoints={[
          'GET /admin/partners',
          'PATCH /admin/partners/:id/approve',
          'PATCH /admin/partners/:id/reject',
        ]}
        onRetry={refetch}
        errorMessage="Failed to load partners."
      >
        <DataTable
          caption="Introducing-broker applications"
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.id}
          dimmed={isFetching}
          empty={
            <EmptyState
              icon={Building2}
              message="No partner applications match the current filters."
            />
          }
        />
      </AsyncBoundary>
    </div>
  );
}
