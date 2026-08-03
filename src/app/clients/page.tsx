'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import api from '@/lib/api';
import { BackendPending } from '@/components/backend-pending';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';

// ADM-01: filterable client list (no profile view this phase) + ADM-14 country/labels.
// Endpoint contract is assumed and logged in docs/DECISIONS.md (D-31) — the backend
// does not implement it yet; this page renders BackendPending until it does.
interface ClientRow {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  type: 'individual' | 'referral' | 'partner';
  status: 'active' | 'pending' | 'suspended';
  verificationLevel: 0 | 1;
  country?: string;
  createdAt: string;
}

interface ClientListResponse {
  items: ClientRow[];
  total: number;
  page: number;
  limit: number;
}

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<ClientRow['type'], string> = {
  individual: 'Individual',
  referral: 'Referral',
  partner: 'Partner / IB',
};

const STATUS_STYLES: Record<ClientRow['status'], string> = {
  active: 'bg-success/10 text-success border-success/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function ClientsPage() {
  const { admin } = useAdmin();
  const canSuspend = hasPermission(admin, 'users.suspend');

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search.trim()) params.set('q', search.trim());
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (level) params.set('level', level);
      const { data } = await api.get<ClientListResponse>(`/admin/clients?${params}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setLoadState('ready');
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setLoadState(s === 404 ? 'unavailable' : 'error');
    }
  }, [page, search, type, status, level]);

  useEffect(() => { load(); }, [load]);

  // Suspension bites immediately server-side (live sessions die on the next
  // request), so confirm before pulling the trigger.
  const toggleStatus = async (c: ClientRow) => {
    const next = c.status === 'suspended' ? 'active' : 'suspended';
    if (
      next === 'suspended' &&
      !window.confirm(`Suspend ${c.email}? They will be logged out immediately and unable to log back in.`)
    ) {
      return;
    }
    setActingId(c.id);
    setActionError('');
    try {
      const { data } = await api.patch<ClientRow>(`/admin/clients/${c.id}/status`, { status: next });
      setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, status: data.status } : r)));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(msg ?? `Failed to ${next === 'suspended' ? 'suspend' : 'reactivate'} the client.`);
    } finally {
      setActingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select
          aria-label="Filter by client type"
          value={type}
          onChange={(e) => { setPage(1); setType(e.target.value); }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="referral">Referral</option>
          <option value="partner">Partner / IB</option>
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          aria-label="Filter by verification level"
          value={level}
          onChange={(e) => { setPage(1); setLevel(e.target.value); }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All KYC Levels</option>
          <option value="0">Level 0 — Unverified</option>
          <option value="1">Level 1 — Verified</option>
        </select>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
          {actionError}
        </div>
      )}

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-link" />
          <span className="sr-only">Loading clients</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending endpoints={['GET /admin/clients?page&limit&q&type&status&level']} />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load clients. Check your connection and try again.</p>
          <button type="button" onClick={load} className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <Users className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No clients match the current filters.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">KYC Level</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Country</th>
                  <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Created</th>
                  {canSuspend && (
                    <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{c.email}</td>
                    <td className="px-6 py-4">{TYPE_LABELS[c.type] ?? c.type}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[c.status] ?? ''}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold ${c.verificationLevel >= 1 ? 'text-success' : 'text-muted-foreground'}`}>
                        {c.verificationLevel >= 1 ? 'L1 · Verified' : 'L0 · Unverified'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{c.country ?? '—'}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                    </td>
                    {canSuspend && (
                      <td className="px-6 py-4">
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
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} client{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
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
