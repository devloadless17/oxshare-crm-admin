'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminAuthContext';
import { isMasterAdmin } from '@/lib/permissions';

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

const PAGE_SIZE = 25;

interface KycListResponse {
  items: KycRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export default function AdminKycPage() {
  const { admin } = useAdmin();
  const [rows, setRows] = useState<KycRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Server-side filtering/search/pagination; counts come from the API over
  // the full set, so tab counts stay correct while a filter is active.
  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filter) params.set('status', filter);
    if (debouncedSearch) params.set('q', debouncedSearch);
    api.get<KycListResponse>(`/admin/kyc?${params}`)
      .then((r) => {
        setRows(r.data.items ?? []);
        setTotal(r.data.total ?? 0);
        setCounts(r.data.counts ?? {});
      })
      .catch(() => setLoadError('Failed to load submissions. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, [page, filter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = rows;

  return (
    <div className="kyc-page">
      <div className="page-header">
        <div>
          <h1>KYC Submissions</h1>
          <p>{counts['all'] ?? 0} total submissions</p>
        </div>
        {isMasterAdmin(admin) && (
          <Link href="/invite" className="invite-btn">+ Invite Admin</Link>
        )}
      </div>

      <div className="filters-bar">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`filter-tab ${filter === f.value ? 'active' : ''}`}
              onClick={() => { setPage(1); setFilter(f.value); }}
              aria-pressed={filter === f.value}
            >
              {f.label}
              <span className="tab-count">
                {f.value ? counts[f.value] ?? 0 : counts['all'] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <Input
          className="max-w-xs"
          placeholder="Search by name or email..."
          aria-label="Search submissions by name or email"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
      </div>

      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <div className="spinner" />
          <p>Loading submissions...</p>
        </div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <div className="empty-icon">⚠️</div>
          <p>{loadError}</p>
          <button type="button" onClick={load} className="retry-btn">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No submissions {filter ? `with status "${STATUS_LABELS[filter as KycStatus]}"` : 'yet'}</p>
        </div>
      ) : (
        <div className="kyc-table-wrap">
          <table className="kyc-table">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Country</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
                <th scope="col">Reviewed</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">
                        {(row.user?.firstName?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <div className="user-name">{row.user?.firstName} {row.user?.lastName}</div>
                        <div className="user-email">{row.user?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="country-cell">{row.personalInfo?.country ?? '—'}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{
                        background: `color-mix(in srgb, ${STATUS_COLORS[row.status]} 13%, transparent)`,
                        color: STATUS_COLORS[row.status],
                        border: `1px solid color-mix(in srgb, ${STATUS_COLORS[row.status]} 27%, transparent)`,
                      }}
                    >
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="date-cell">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="date-cell">
                    {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <Link
                      href={`/kyc/${row.userId}`}
                      className="review-link"
                      aria-label={`Review KYC submission of ${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim()}
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <span>{total} result{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
            <div className="pager-btns">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .kyc-page { padding: 32px; max-width: 1200px; margin: 0 auto; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
        h1 { font-size: 1.6rem; font-weight: 700; color: var(--foreground); margin-bottom: 4px; }
        .page-header p { color: var(--muted-foreground); font-size: 0.85rem; }
        .invite-btn {
          background: var(--primary);
          color: var(--primary-foreground); text-decoration: none; border-radius: 50px;
          padding: 10px 24px; font-size: 0.88rem; font-weight: 600;
          white-space: nowrap;
        }

        .filters-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .filter-tabs { display: flex; gap: 4px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 4px; }
        .filter-tab {
          padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;
          font-size: 0.82rem; font-weight: 500; color: var(--muted-foreground);
          background: transparent; display: flex; align-items: center; gap: 6px;
        }
        .filter-tab:hover { color: var(--foreground); background: var(--muted); }
        .filter-tab.active { background: var(--accent); color: var(--link); }
        .tab-count {
          background: var(--muted); color: var(--muted-foreground);
          border-radius: 10px; padding: 1px 6px; font-size: 0.72rem;
        }
        .filter-tab.active .tab-count { background: color-mix(in srgb, var(--primary) 18%, transparent); color: var(--link); }

        .loading-state, .empty-state { text-align: center; padding: 60px 20px; color: var(--muted-foreground); }
        .retry-btn {
          margin-top: 12px; background: var(--muted); color: var(--link);
          border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); border-radius: 50px;
          padding: 8px 20px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
        }
        .retry-btn:hover { background: var(--accent); }
        .spinner {
          width: 36px; height: 36px; margin: 0 auto 16px;
          border: 3px solid var(--muted); border-top-color: var(--ring);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-icon { font-size: 2.5rem; margin-bottom: 12px; }

        .kyc-table-wrap { border-radius: 16px; overflow: hidden; border: 1px solid var(--border); }
        .pager { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border); font-size: 0.82rem; color: var(--muted-foreground); }
        .pager-btns { display: flex; gap: 8px; }
        .pager-btns button { border: 1px solid var(--input); background: var(--card); color: var(--foreground); border-radius: 8px; padding: 6px 14px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .pager-btns button:disabled { opacity: 0.4; cursor: not-allowed; }
        .kyc-table { width: 100%; border-collapse: collapse; }
        .kyc-table thead { background: var(--muted); }
        .kyc-table th { padding: 12px 16px; text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--muted-foreground); letter-spacing: 0.08em; text-transform: uppercase; }
        .kyc-table tbody tr { border-top: 1px solid var(--border); transition: background 0.15s; }
        .kyc-table tbody tr:hover { background: var(--muted); }
        .kyc-table td { padding: 14px 16px; font-size: 0.88rem; color: var(--foreground); }

        .user-cell { display: flex; align-items: center; gap: 12px; }
        .user-avatar {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: var(--primary);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.85rem; font-weight: 700; color: var(--primary-foreground);
        }
        .user-name { font-weight: 600; color: var(--foreground); }
        .user-email { font-size: 0.78rem; color: var(--muted-foreground); margin-top: 2px; }
        .country-cell { color: var(--muted-foreground); }
        .date-cell { color: var(--muted-foreground); font-size: 0.82rem; }

        .status-badge {
          display: inline-block; padding: 4px 12px; border-radius: 20px;
          font-size: 0.75rem; font-weight: 600; white-space: nowrap;
        }
        .review-link {
          color: var(--link); text-decoration: none; font-weight: 600; font-size: 0.85rem;
        }
        .review-link:hover { text-decoration: underline; }
        .invite-btn:focus-visible, .filter-tab:focus-visible, .retry-btn:focus-visible,
        .pager-btns button:focus-visible, .review-link:focus-visible {
          outline: 2px solid var(--ring); outline-offset: 2px;
        }
        @media (max-width: 768px) {
          .kyc-page { padding: 16px; }
          .filters-bar { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
}
