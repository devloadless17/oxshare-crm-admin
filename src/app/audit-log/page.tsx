'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import api from '@/lib/api';
import { BackendPending } from '@/components/backend-pending';

// D-21: append-only admin action log. Read-only view — there is deliberately
// no edit or delete anywhere in this flow.
interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  subjectType: string;
  subjectId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const PAGE_SIZE = 25;

const ACTION_STYLES: Record<string, string> = {
  'kyc.approve': 'bg-success/10 text-success border-success/20',
  'kyc.reject': 'bg-destructive/10 text-destructive border-destructive/20',
  'kyc.claim': 'bg-primary/10 text-link border-primary/20',
  'admin.invite': 'bg-info/10 text-info border-info/20',
  'admin.update': 'bg-warning/10 text-warning border-warning/20',
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(() => {
    setLoadState('loading');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (action) params.set('action', action);
    api.get<AuditResponse>(`/admin/audit-log?${params}`)
      .then((r) => {
        setRows(r.data.items ?? []);
        setTotal(r.data.total ?? 0);
        setLoadState('ready');
      })
      .catch((e: unknown) => {
        const s = (e as { response?: { status?: number } })?.response?.status;
        setLoadState(s === 404 ? 'unavailable' : 'error');
      });
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Append-only record of every admin action — who did what, to what, and when
        </p>
      </div>

      <div className="flex items-center gap-3">
        <select
          aria-label="Filter by action"
          value={action}
          onChange={(e) => { setPage(1); setAction(e.target.value); }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Actions</option>
          <option value="kyc.approve">KYC Approve</option>
          <option value="kyc.reject">KYC Reject</option>
          <option value="kyc.claim">KYC Claim</option>
          <option value="admin.invite">Admin Invite</option>
          <option value="admin.update">Admin Update</option>
          <option value="role.create">Role Create</option>
          <option value="role.update">Role Update</option>
          <option value="role.delete">Role Delete</option>
        </select>
      </div>

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-link" />
          <span className="sr-only">Loading audit log</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending endpoints={['GET /admin/audit-log?page&limit&action']} />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load the audit log. Check your connection and try again.</p>
          <button type="button" onClick={load} className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <ScrollText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {action ? 'No entries for this action.' : 'No admin actions recorded yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">When</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Actor</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Subject</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors align-top">
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-foreground">{e.actorEmail}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono ${ACTION_STYLES[e.action] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="text-xs">{e.subjectType}</div>
                      <div className="font-mono text-[11px] text-muted-foreground max-w-[160px] truncate" title={e.subjectId}>
                        {e.subjectId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {e.details ? (
                        <code className="block max-w-md overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                          {JSON.stringify(e.details)}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} entr{total === 1 ? 'y' : 'ies'} · page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
