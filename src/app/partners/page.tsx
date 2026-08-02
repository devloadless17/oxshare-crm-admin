'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { BackendPending } from '@/components/backend-pending';

// ADM-11: partner / IB application management — full lifecycle, parent assignment.
// IB-01: approval status gates the partner portal. Endpoint contract assumed,
// logged in docs/DECISIONS.md (D-31). Hierarchy is two levels max (L1 + L2).
interface PartnerRow {
  id: string;
  user?: { email: string; firstName?: string; lastName?: string };
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  parentIb?: { id: string; name: string } | null;
  program?: string;
  referralCode?: string;
  createdAt: string;
}

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const STATUS_STYLES: Record<PartnerRow['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  rejected: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  suspended: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

export default function PartnersPage() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const { data } = await api.get<PartnerRow[]>('/admin/partners');
      setRows(data ?? []);
      setLoadState('ready');
    } catch (e: unknown) {
      const s = (e as { response?: { status?: number } })?.response?.status;
      setLoadState(s === 404 ? 'unavailable' : 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (row: PartnerRow, action: 'approve' | 'reject') => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/partners/${row.id}/${action}`);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(msg ?? `Failed to ${action} the application for ${row.user?.email ?? 'this partner'}.`);
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = rows.filter((p) => {
    if (filter && p.status !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.user?.email?.toLowerCase().includes(q) ||
      p.user?.firstName?.toLowerCase().includes(q) ||
      p.user?.lastName?.toLowerCase().includes(q) ||
      p.referralCode?.toLowerCase().includes(q)
    );
  });

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
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        {actionError && <p className="text-xs font-semibold text-rose-500" role="alert">{actionError}</p>}
      </div>

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="sr-only">Loading partners</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending
          endpoints={['GET /admin/partners', 'PATCH /admin/partners/:id/approve', 'PATCH /admin/partners/:id/reject']}
        />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load partners. Check your connection and try again.</p>
          <button type="button" onClick={load} className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No partner applications match the current filters.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Partner</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Parent IB</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Program</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Referral Code</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Applied</th>
                <th scope="col" className="px-6 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">
                      {[p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.user?.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[p.status] ?? ''}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {p.parentIb ? p.parentIb.name : <span className="text-xs">— (L1)</span>}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{p.program ?? '—'}</td>
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{p.referralCode ?? '—'}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    {p.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => act(p, 'approve')}
                          disabled={actionLoading}
                          className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => act(p, 'reject')}
                          disabled={actionLoading}
                          className="h-8 px-3 rounded-md border border-rose-500/40 text-rose-500 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
