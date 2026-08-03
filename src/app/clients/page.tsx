'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import api from '@/lib/api';
import type { ClientListResponse, ClientRow } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { apiErrorMessage, useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Pagination } from '@/components/pagination';

// ADM-01: filterable client list (no profile view this phase) + ADM-14 country/labels.
// Filtering, sorting and pagination all happen in SQL — the list is indexed on
// (type, status, verification_level) and must stay that way at §5's ~219K rows.
const PAGE_SIZE = 25;

const TYPE_LABELS: Record<string, string> = {
  individual: 'Individual',
  referral: 'Referral',
  partner: 'Partner / IB',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function ClientsPage() {
  const { admin } = useAdmin();
  const canSuspend = hasPermission(admin, 'users.suspend');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');

  const debouncedSearch = useDebounced(search.trim());

  const query = useResource<ClientListResponse>(
    ['clients', page, debouncedSearch, type, status, level],
    async (signal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (level) params.set('level', level);
      const res = await api.get<ClientListResponse>(`/admin/clients?${params}`, { signal });
      return res.data;
    },
  );

  // Suspension bites immediately server-side (live sessions die on the next
  // request), so confirm before pulling the trigger.
  const setStatusMutation = useMutation({
    mutationFn: ({ client, next }: { client: ClientRow; next: string }) =>
      api.patch<ClientRow>(`/admin/clients/${client.id}/status`, { status: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const toggleStatus = (client: ClientRow) => {
    const next = client.status === 'suspended' ? 'active' : 'suspended';
    if (
      next === 'suspended' &&
      !window.confirm(
        `Suspend ${client.email}? They will be logged out immediately and unable to log back in.`,
      )
    ) {
      return;
    }
    setStatusMutation.mutate({ client, next });
  };

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const actingId = setStatusMutation.isPending ? setStatusMutation.variables?.client.id : null;

  const columns: Column<ClientRow>[] = [
    {
      header: 'Name',
      cell: (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '—',
      cellClassName: 'font-medium text-foreground',
    },
    { header: 'Email', cell: (c) => c.email, cellClassName: 'text-muted-foreground' },
    { header: 'Type', cell: (c) => TYPE_LABELS[c.type] ?? c.type },
    {
      header: 'Status',
      cell: (c) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[c.status] ?? ''}`}
        >
          {c.status}
        </span>
      ),
    },
    {
      header: 'KYC Level',
      cell: (c) => (
        <span
          className={`text-xs font-semibold ${c.verificationLevel >= 1 ? 'text-success' : 'text-muted-foreground'}`}
        >
          {c.verificationLevel >= 1 ? 'L1 · Verified' : 'L0 · Unverified'}
        </span>
      ),
    },
    { header: 'Country', cell: (c) => c.country ?? '—', cellClassName: 'text-muted-foreground' },
    {
      header: 'Created',
      cell: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'),
      cellClassName: 'text-muted-foreground',
    },
    ...(canSuspend
      ? [
          {
            header: 'Actions',
            cell: (c: ClientRow) => (
              <button
                type="button"
                onClick={() => toggleStatus(c)}
                disabled={actingId === c.id}
                aria-busy={actingId === c.id}
                className={`h-8 px-3 rounded-md border text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-outline ${
                  c.status === 'suspended'
                    ? 'border-success/30 bg-success/10 text-success hover:bg-success/20'
                    : 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                }`}
              >
                {actingId === c.id ? 'Saving…' : c.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Filterable client base — type, status, verification level
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search clients by name or email"
          placeholder="Search by name, email..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-outline"
        />
        <select
          aria-label="Filter by client type"
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-outline"
        >
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="referral">Referral</option>
          <option value="partner">Partner / IB</option>
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-outline"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          aria-label="Filter by verification level"
          value={level}
          onChange={(e) => {
            setPage(1);
            setLevel(e.target.value);
          }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-outline"
        >
          <option value="">All KYC Levels</option>
          <option value="0">Level 0 — Unverified</option>
          <option value="1">Level 1 — Verified</option>
        </select>
      </div>

      {setStatusMutation.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {apiErrorMessage(setStatusMutation.error, 'Failed to change the client status.')}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label="Loading clients"
        endpoints={['GET /admin/clients?page&limit&q&type&status&level']}
        onRetry={query.refetch}
        errorMessage="Failed to load clients."
      >
        <DataTable
          caption="Client accounts"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Users} message="No clients match the current filters." />}
        />
        {rows.length > 0 && (
          <div className="mt-6">
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              noun={['client', 'clients']}
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
