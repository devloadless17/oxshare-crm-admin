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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

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

  const { status, data, error, isFetching, refetch } = useResource<PartnerRow[]>(
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
      header: t('partners.colPartner'),
      sortable: true,
      sortKey: 'id',
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
      header: t('partners.colStatus'),
      sortable: true,
      sortKey: 'status',
      cell: (p) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[p.status] ?? ''}`}
        >
          {p.status}
        </span>
      ),
    },
    {
      header: t('partners.colParent'),
      sortable: true,
      sortKey: 'parentIb',
      cell: (p) =>
        p.parentIb ? p.parentIb.name : <span className="text-xs">{t('partners.noParent')}</span>,
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('partners.colProgram'),
      sortable: true,
      sortKey: 'program',
      cell: (p) => p.program ?? '—',
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('partners.colReferralCode'),
      sortable: true,
      sortKey: 'referralCode',
      cell: (p) => p.referralCode ?? '—',
      cellClassName: 'font-mono text-xs text-muted-foreground',
    },
    {
      header: t('partners.colApplied'),
      sortable: true,
      sortKey: 'createdAt',
      cell: (p) => (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'),
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('partners.colActions'),
      // Approve/reject need partners.manage on the API. Rendering them to a
      // read-only admin only produces a 403 they cannot act on.
      cell: (p) =>
        p.status !== 'pending' ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : !canManage ? (
          <span className="text-xs text-muted-foreground">{t('plans.viewOnly')}</span>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide.mutate({ row: p, action: 'approve' })}
              disabled={decide.isPending}
              className="h-8 px-3 rounded-md bg-success text-success-foreground text-xs font-semibold hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              {t('withdrawals.approve')}
            </button>
            <button
              type="button"
              onClick={() => decide.mutate({ row: p, action: 'reject' })}
              disabled={decide.isPending}
              className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              {t('withdrawals.reject')}
            </button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('partners.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('partners.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label={t('partners.searchAria')}
          placeholder={t('partners.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-outline"
        />
        <Select
          value={filter || 'all'}
          onValueChange={(val) => setFilter(val === 'all' ? '' : val)}
        >
          <SelectTrigger className="h-9 w-38">
            <SelectValue placeholder={t('clients.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('clients.allStatuses')}</SelectItem>
            <SelectItem value="pending">{t('clients.statusPending')}</SelectItem>
            <SelectItem value="approved">{t('kycReview.filterApproved')}</SelectItem>
            <SelectItem value="rejected">{t('kycReview.filterRejected')}</SelectItem>
            <SelectItem value="suspended">{t('clients.statusSuspended')}</SelectItem>
          </SelectContent>
        </Select>
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
        error={error}
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
