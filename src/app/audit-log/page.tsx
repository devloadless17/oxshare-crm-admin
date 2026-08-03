'use client';

import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';
import type { AuditEntry, AuditListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Pagination } from '@/components/pagination';

// D-21: append-only admin action log. Read-only view — there is deliberately
// no edit or delete anywhere in this flow.
const PAGE_SIZE = 25;

const ACTIONS = [
  ['kyc.approve', 'KYC Approve'],
  ['kyc.reject', 'KYC Reject'],
  ['kyc.claim', 'KYC Claim'],
  ['admin.invite', 'Admin Invite'],
  ['admin.update', 'Admin Update'],
  ['role.create', 'Role Create'],
  ['role.update', 'Role Update'],
  ['role.delete', 'Role Delete'],
];

const ACTION_STYLES: Record<string, string> = {
  'kyc.approve': 'bg-success/10 text-success border-success/20',
  'kyc.reject': 'bg-destructive/10 text-destructive border-destructive/20',
  'kyc.claim': 'bg-primary/10 text-link border-primary/20',
  'admin.invite': 'bg-info/10 text-info border-info/20',
  'admin.update': 'bg-warning/10 text-warning border-warning/20',
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const { status, data, isFetching, refetch } = useResource<AuditListResponse>(
    ['audit-log', page, action],
    async (signal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (action) params.set('action', action);
      const res = await api.get<AuditListResponse>(`/admin/audit-log?${params}`, { signal });
      return res.data;
    },
  );

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<AuditEntry>[] = [
    {
      header: 'When',
      cell: (e) => new Date(e.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    { header: 'Actor', cell: (e) => e.actorEmail, cellClassName: 'text-foreground' },
    {
      header: 'Action',
      cell: (e) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono ${
            ACTION_STYLES[e.action] ?? 'bg-muted text-muted-foreground border-border'
          }`}
        >
          {e.action}
        </span>
      ),
    },
    {
      header: 'Subject',
      cell: (e) => (
        <>
          <div className="text-xs">{e.subjectType}</div>
          <div
            className="font-mono text-[11px] text-muted-foreground max-w-[160px] truncate"
            title={e.subjectId}
          >
            {e.subjectId}
          </div>
        </>
      ),
      cellClassName: 'text-muted-foreground',
    },
    {
      header: 'Details',
      cell: (e) =>
        e.details ? (
          <code className="block max-w-md overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
            {JSON.stringify(e.details)}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Append-only record of every admin action — who did what, to what, and when
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={action || 'all'}
          onValueChange={(val) => {
            setPage(1);
            setAction(val === 'all' ? '' : val);
          }}
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ACTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AsyncBoundary
        status={status}
        label="Loading audit log"
        endpoints={['GET /admin/audit-log?page&limit&action']}
        onRetry={refetch}
        errorMessage="Failed to load the audit log."
      >
        <DataTable
          caption="Admin actions, newest first"
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          dimmed={isFetching}
          empty={
            <EmptyState
              icon={ScrollText}
              message={action ? 'No entries for this action.' : 'No admin actions recorded yet.'}
            />
          }
        />
        {rows.length > 0 && (
          <div className="mt-6">
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              noun={['entry', 'entries']}
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
