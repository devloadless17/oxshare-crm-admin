'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface KycDetail {
  userId: string;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  user?: { email: string; firstName: string; lastName: string };
  personalInfo?: Record<string, string>;
  document?: { docType?: string; frontFilePath?: string; backFilePath?: string; frontFileName?: string; backFileName?: string };
  selfie?: { filePath?: string; fileName?: string };
  addressProof?: { docType?: string; filePath?: string; fileName?: string };
}

function DocViewer({ filePath, label }: { filePath?: string; label: string }) {
  if (!filePath) return <div className="doc-empty">Not uploaded</div>;
  const isPdf = filePath.endsWith('.pdf');
  const url = `http://localhost:3001/uploads/${filePath.replace('uploads/', '').replace('uploads\\', '')}`;
  return (
    <div className="doc-viewer">
      <div className="doc-label">{label}</div>
      {isPdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="doc-pdf-link">📄 View PDF</a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} className="doc-img" />
        </a>
      )}
    </div>
  );
}

export default function KycDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [data, setData] = useState<KycDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    api.get(`/admin/kyc/${userId}`)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const approve = async () => {
    setActionLoading(true);
    await api.patch(`/admin/kyc/${userId}/approve`);
    setData((d) => d ? { ...d, status: 'approved' } : d);
    setActionLoading(false);
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    await api.patch(`/admin/kyc/${userId}/reject`, { reason: rejectReason });
    setData((d) => d ? { ...d, status: 'rejected', rejectionReason: rejectReason } : d);
    setShowRejectModal(false);
    setRejectReason('');
    setActionLoading(false);
  };

  if (loading) return (
    <div className="detail-loading">
      <div className="spinner" />
      <p>Loading KYC submission...</p>
    </div>
  );
  if (!data) return <div className="detail-loading"><p>Submission not found.</p></div>;

  const canReview = data.status === 'submitted' || data.status === 'under_review';

  return (
    <div className="detail-page">
      <div className="detail-header">
        <Link href="/kyc" className="back-link">← Back to KYC List</Link>
        <div className="detail-title-row">
          <div>
            <h1>{data.user?.firstName} {data.user?.lastName}</h1>
            <p>{data.user?.email}</p>
          </div>
          <span className={`status-pill status-${data.status}`}>{data.status.replace('_', ' ')}</span>
        </div>
      </div>

      <div className="detail-grid">
        {/* Left: Info */}
        <div className="detail-left">
          <div className="info-card">
            <h3>Personal Information</h3>
            {data.personalInfo ? Object.entries(data.personalInfo).map(([k, v]) => (
              <div key={k} className="info-row">
                <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                <strong>{v}</strong>
              </div>
            )) : <p className="not-submitted">Not submitted</p>}
          </div>

          <div className="info-card">
            <h3>Document</h3>
            <div className="info-row">
              <span>Type</span>
              <strong>{data.document?.docType?.replace('_', ' ') ?? '—'}</strong>
            </div>
          </div>

          {data.status === 'rejected' && data.rejectionReason && (
            <div className="rejection-card">
              <h3>❌ Rejection Reason</h3>
              <p>{data.rejectionReason}</p>
            </div>
          )}

          <div className="timeline-card">
            <h3>Timeline</h3>
            <div className="info-row"><span>Submitted</span><strong>{data.submittedAt ? new Date(data.submittedAt).toLocaleString() : '—'}</strong></div>
            <div className="info-row"><span>Reviewed</span><strong>{data.reviewedAt ? new Date(data.reviewedAt).toLocaleString() : '—'}</strong></div>
          </div>
        </div>

        {/* Right: Documents */}
        <div className="detail-right">
          <div className="docs-card">
            <h3>Documents</h3>
            <div className="docs-grid">
              <DocViewer filePath={data.document?.frontFilePath} label="ID Front" />
              <DocViewer filePath={data.document?.backFilePath} label="ID Back" />
              <DocViewer filePath={data.selfie?.filePath} label="Selfie" />
              <DocViewer filePath={data.addressProof?.filePath} label="Address Proof" />
            </div>
          </div>

          {canReview && (
            <div className="action-card">
              <h3>Review Decision</h3>
              <div className="action-btns">
                <button
                  className="btn-approve"
                  onClick={approve}
                  disabled={actionLoading}
                >
                  {actionLoading ? '...' : '✓ Approve KYC'}
                </button>
                <button
                  className="btn-reject"
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionLoading}
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          )}
          {data.status === 'approved' && (
            <div className="approved-banner">✅ KYC has been approved. User verification level set to 1.</div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reject KYC Submission</h3>
            <p>Provide a clear reason. This will be shown to the user.</p>
            <textarea
              className="reject-textarea"
              placeholder="e.g. Document image is blurry and unreadable..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setShowRejectModal(false)}>Cancel</button>
              <button className="btn-reject-confirm" onClick={reject} disabled={!rejectReason.trim() || actionLoading}>
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .detail-page { padding: 32px; max-width: 1200px; margin: 0 auto; }
        .detail-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 16px; color: #7c87b4; }
        .spinner { width: 36px; height: 36px; border: 3px solid rgba(99,130,255,0.2); border-top-color: #6382ff; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .back-link { color: #7c87b4; text-decoration: none; font-size: 0.85rem; display: inline-block; margin-bottom: 20px; }
        .back-link:hover { color: #a5b4fc; }
        .detail-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
        h1 { font-size: 1.5rem; font-weight: 700; color: #e8eeff; }
        .detail-header p { color: #7c87b4; font-size: 0.88rem; margin-top: 4px; }

        .status-pill {
          padding: 6px 16px; border-radius: 20px; font-size: 0.8rem; font-weight: 700;
          text-transform: capitalize;
        }
        .status-pill.status-submitted { background: rgba(99,130,255,0.15); color: #818cf8; }
        .status-pill.status-under_review { background: rgba(167,139,250,0.15); color: #a78bfa; }
        .status-pill.status-approved { background: rgba(74,222,128,0.15); color: #4ade80; }
        .status-pill.status-rejected { background: rgba(248,113,113,0.15); color: #f87171; }
        .status-pill.status-in_progress { background: rgba(245,158,11,0.15); color: #fbbf24; }

        .detail-grid { display: grid; grid-template-columns: 340px 1fr; gap: 24px; }
        .detail-left { display: flex; flex-direction: column; gap: 16px; }
        .detail-right { display: flex; flex-direction: column; gap: 16px; }

        .info-card, .docs-card, .action-card, .timeline-card, .rejection-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(99,130,255,0.15);
          border-radius: 16px; padding: 20px 24px;
        }
        h3 { font-size: 0.82rem; font-weight: 600; color: #7c87b4; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 16px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.85rem; }
        .info-row:last-child { border-bottom: none; }
        .info-row span { color: #7c87b4; }
        .info-row strong { color: #c7d2fe; text-align: right; max-width: 60%; text-transform: capitalize; }
        .not-submitted { color: #5a6280; font-size: 0.85rem; }
        .rejection-card { border-color: rgba(248,113,113,0.25); background: rgba(248,113,113,0.04); }
        .rejection-card h3 { color: #f87171; }
        .rejection-card p { color: #fca5a5; font-size: 0.88rem; line-height: 1.6; }

        .docs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .doc-viewer { display: flex; flex-direction: column; gap: 8px; }
        .doc-label { font-size: 0.75rem; font-weight: 600; color: #7c87b4; text-transform: uppercase; letter-spacing: 0.06em; }
        .doc-img { width: 100%; border-radius: 10px; border: 1px solid rgba(99,130,255,0.2); cursor: pointer; transition: opacity 0.2s; }
        .doc-img:hover { opacity: 0.85; }
        .doc-pdf-link { color: #818cf8; text-decoration: none; font-size: 0.88rem; font-weight: 600; }
        .doc-empty { color: #5a6280; font-size: 0.82rem; font-style: italic; }

        .action-btns { display: flex; gap: 12px; }
        .btn-approve {
          flex: 1; background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white; border: none; border-radius: 12px; padding: 14px 20px;
          font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: all 0.2s;
        }
        .btn-approve:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(34,197,94,0.35); }
        .btn-approve:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .btn-reject {
          padding: 14px 20px; background: rgba(239,68,68,0.1); color: #f87171;
          border: 1px solid rgba(239,68,68,0.25); border-radius: 12px;
          font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.2s;
        }
        .btn-reject:hover { background: rgba(239,68,68,0.2); }
        .btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }
        .approved-banner { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 12px; padding: 16px 20px; color: #4ade80; font-size: 0.88rem; font-weight: 600; }

        /* Modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: #1a1f3d; border: 1px solid rgba(99,130,255,0.25); border-radius: 20px; padding: 32px; max-width: 480px; width: 100%; animation: modalIn 0.25s ease both; }
        @keyframes modalIn { from { transform: scale(0.95); opacity: 0; } }
        .modal h3 { font-size: 1.1rem; color: #e8eeff; margin-bottom: 8px; }
        .modal p { color: #7c87b4; font-size: 0.88rem; margin-bottom: 20px; }
        .reject-textarea { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(99,130,255,0.2); border-radius: 10px; padding: 12px 16px; color: #e8eeff; font-size: 0.9rem; resize: vertical; outline: none; font-family: inherit; }
        .reject-textarea:focus { border-color: #f87171; }
        .modal-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
        .btn-cancel { background: rgba(255,255,255,0.06); color: #9ba8d4; border: 1px solid rgba(99,130,255,0.2); border-radius: 50px; padding: 10px 24px; font-size: 0.88rem; cursor: pointer; }
        .btn-reject-confirm { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 50px; padding: 10px 24px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
        .btn-reject-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } .docs-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .detail-page { padding: 16px; } .docs-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
