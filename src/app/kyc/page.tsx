'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';

type KycStatus = 'not_started' | 'in_progress' | 'submitted' | 'under_review' | 'approved' | 'rejected';

interface KycRow {
  userId: string;
  status: KycStatus;
  submittedAt?: string;
  reviewedAt?: string;
  user?: { email: string; firstName: string; lastName: string };
  personalInfo?: { country?: string; nationality?: string };
}

const STATUS_COLORS: Record<KycStatus, string> = {
  not_started: '#5a6280',
  in_progress: '#f59e0b',
  submitted: '#6382ff',
  under_review: '#a78bfa',
  approved: '#4ade80',
  rejected: '#f87171',
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

export default function AdminKycPage() {
  const [submissions, setSubmissions] = useState<KycRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = filter ? `?status=${filter}` : '';
    api.get(`/admin/kyc${params}`)
      .then((r) => setSubmissions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const filtered = submissions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.user?.email?.toLowerCase().includes(q) ||
      s.user?.firstName?.toLowerCase().includes(q) ||
      s.user?.lastName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="kyc-page">
      <div className="page-header">
        <div>
          <h1>KYC Submissions</h1>
          <p>{submissions.length} total submissions</p>
        </div>
        <Link href="/invite" className="invite-btn">+ Invite Admin</Link>
      </div>

      <div className="filters-bar">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`filter-tab ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="tab-count">
                {f.value ? submissions.filter((s) => s.status === f.value).length : submissions.length}
              </span>
            </button>
          ))}
        </div>
        <Input
          className="max-w-xs"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading submissions...</p>
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
                <th>User</th>
                <th>Country</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Reviewed</th>
                <th>Action</th>
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
                        background: STATUS_COLORS[row.status] + '22',
                        color: STATUS_COLORS[row.status],
                        border: `1px solid ${STATUS_COLORS[row.status]}44`,
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
                    <Link href={`/kyc/${row.userId}`} className="review-link">
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .kyc-page { padding: 32px; max-width: 1200px; margin: 0 auto; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
        h1 { font-size: 1.6rem; font-weight: 700; color: #e8eeff; margin-bottom: 4px; }
        .page-header p { color: #7c87b4; font-size: 0.85rem; }
        .invite-btn {
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          color: white; text-decoration: none; border-radius: 50px;
          padding: 10px 24px; font-size: 0.88rem; font-weight: 600;
          white-space: nowrap;
        }

        .filters-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .filter-tabs { display: flex; gap: 4px; background: rgba(255,255,255,0.03); border: 1px solid rgba(99,130,255,0.15); border-radius: 12px; padding: 4px; }
        .filter-tab {
          padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;
          font-size: 0.82rem; font-weight: 500; color: #7c87b4;
          background: transparent; display: flex; align-items: center; gap: 6px; transition: all 0.2s;
        }
        .filter-tab:hover { color: #c7d2fe; background: rgba(99,130,255,0.07); }
        .filter-tab.active { background: rgba(99,130,255,0.15); color: #a5b4fc; }
        .tab-count {
          background: rgba(255,255,255,0.08); color: #5a6280;
          border-radius: 10px; padding: 1px 6px; font-size: 0.72rem;
        }
        .filter-tab.active .tab-count { background: rgba(99,130,255,0.2); color: #818cf8; }

        .search-input {
          flex: 1; min-width: 200px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(99,130,255,0.2);
          border-radius: 10px; padding: 10px 16px; color: #e8eeff; font-size: 0.88rem; outline: none;
        }
        .search-input:focus { border-color: #6382ff; }

        .loading-state, .empty-state { text-align: center; padding: 60px 20px; color: #7c87b4; }
        .spinner {
          width: 36px; height: 36px; margin: 0 auto 16px;
          border: 3px solid rgba(99,130,255,0.2); border-top-color: #6382ff;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .empty-icon { font-size: 2.5rem; margin-bottom: 12px; }

        .kyc-table-wrap { border-radius: 16px; overflow: hidden; border: 1px solid rgba(99,130,255,0.15); }
        .kyc-table { width: 100%; border-collapse: collapse; }
        .kyc-table thead { background: rgba(99,130,255,0.07); }
        .kyc-table th { padding: 12px 16px; text-align: left; font-size: 0.75rem; font-weight: 600; color: #7c87b4; letter-spacing: 0.08em; text-transform: uppercase; }
        .kyc-table tbody tr { border-top: 1px solid rgba(99,130,255,0.08); transition: background 0.15s; }
        .kyc-table tbody tr:hover { background: rgba(99,130,255,0.04); }
        .kyc-table td { padding: 14px 16px; font-size: 0.88rem; color: #c7d2fe; }

        .user-cell { display: flex; align-items: center; gap: 12px; }
        .user-avatar {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.85rem; font-weight: 700; color: white;
        }
        .user-name { font-weight: 600; color: #e8eeff; }
        .user-email { font-size: 0.78rem; color: #7c87b4; margin-top: 2px; }
        .country-cell { color: #9ba8d4; }
        .date-cell { color: #7c87b4; font-size: 0.82rem; }

        .status-badge {
          display: inline-block; padding: 4px 12px; border-radius: 20px;
          font-size: 0.75rem; font-weight: 600; white-space: nowrap;
        }
        .review-link {
          color: #818cf8; text-decoration: none; font-weight: 600; font-size: 0.85rem;
          transition: color 0.15s;
        }
        .review-link:hover { color: #a5b4fc; }
        @media (max-width: 768px) {
          .kyc-page { padding: 16px; }
          .filters-bar { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
}
