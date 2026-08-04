'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import api from '@/lib/api';
import type { ClientListResponse, ClientRow } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useDebounced } from '@/hooks/use-debounced';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useCursorPages } from '@/hooks/use-cursor-pages';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

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

  /*
   * Cursor navigation, not numbered pages — PLATFORM-CONVENTIONS R-2.4.
   *
   * This list is the ~219,000-record one, and it is written to while it is
   * read: a client registers while an admin is part-way down, every later
   * offset page shifts, and one client is never shown. Nothing looks wrong, and
   * the reviewer believes they saw everyone — which on a client base under
   * compliance review is the failure that matters.
   *
   * The cost is that "jump to page 7" is gone; a cursor names a row, not an
   * ordinal. At this scale nobody navigates to page 4,382 — they filter and
   * search, which is why the filters above are the real navigation.
   */
  const pages = useCursorPages();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');

  const debouncedSearch = useDebounced(search.trim());

  const query = useResource<ClientListResponse>(
    ['clients', pages.cursor ?? 'first', debouncedSearch, type, status, level],
    async (signal) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pages.cursor) params.set('cursor', pages.cursor);
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
  // The server no longer counts unless asked: counting 219,000 rows is a full
  // scan on every page view for a number nobody acts on (R-2.4). `nextCursor`
  // is what says whether there is more.
  const nextCursor = query.data?.nextCursor ?? null;
  const actingId = setStatusMutation.isPending ? setStatusMutation.variables?.client.id : null;

  const columns: Column<ClientRow>[] = [
    {
      header: 'Name',
      sortable: true,
      sortKey: 'firstName',
      cell: (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '—',
      cellClassName: 'font-medium text-foreground',
    },
    {
      header: 'Email',
      sortable: true,
      sortKey: 'email',
      cell: (c) => c.email,
      cellClassName: 'text-muted-foreground',
    },
    { header: 'Type', sortable: true, sortKey: 'type', cell: (c) => TYPE_LABELS[c.type] ?? c.type },
    {
      header: 'Status',
      sortable: true,
      sortKey: 'status',
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
      sortable: true,
      sortKey: 'verificationLevel',
      cell: (c) => (
        <span
          className={`text-xs font-semibold ${c.verificationLevel >= 1 ? 'text-success' : 'text-muted-foreground'}`}
        >
          {c.verificationLevel >= 1 ? 'L1 · Verified' : 'L0 · Unverified'}
        </span>
      ),
    },
    {
      header: 'Country',
      sortable: true,
      sortKey: 'country',
      cell: (c) => c.country ?? '—',
      cellClassName: 'text-muted-foreground',
    },
    {
      header: 'Created',
      sortable: true,
      sortKey: 'createdAt',
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
                {actingId === c.id
                  ? 'Saving…'
                  : c.status === 'suspended'
                    ? 'Reactivate'
                    : 'Suspend'}
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
            pages.reset();
            setSearch(e.target.value);
          }}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-outline"
        />
        <Select
          value={type || 'all'}
          onValueChange={(val) => {
            pages.reset();
            setType(val === 'all' ? '' : val);
          }}
        >
          <SelectTrigger className="h-9 w-38">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
            <SelectItem value="partner">Partner / IB</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={status || 'all'}
          onValueChange={(val) => {
            pages.reset();
            setStatus(val === 'all' ? '' : val);
          }}
        >
          <SelectTrigger className="h-9 w-38">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={level || 'all'}
          onValueChange={(val) => {
            pages.reset();
            setLevel(val === 'all' ? '' : val);
          }}
        >
          <SelectTrigger className="h-9 w-46">
            <SelectValue placeholder="All KYC Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All KYC Levels</SelectItem>
            <SelectItem value="0">Level 0 — Unverified</SelectItem>
            <SelectItem value="1">Level 1 — Verified</SelectItem>
          </SelectContent>
        </Select>
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
          selectable={true}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Users} message="No clients match the current filters." />}
          cursorPagination={{
            pageNumber: pages.pageNumber,
            pageSize: PAGE_SIZE,
            showing: rows.length,
            canGoBack: pages.canGoBack,
            canGoForward: Boolean(nextCursor),
            onBack: pages.goBack,
            onNext: () => pages.goNext(nextCursor),
            noun: ['client', 'clients'],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
