'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface KycDetail {
  userId: string;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  rejectedFields?: string[];
  user?: { email: string; firstName: string; lastName: string };
  personalInfo?: Record<string, string>;
  document?: { docType?: string; frontFilePath?: string; backFilePath?: string; frontFileName?: string; backFileName?: string };
  selfie?: { filePath?: string; fileName?: string };
  addressProof?: { docType?: string; filePath?: string; fileName?: string; page2FilePath?: string };
}

function DocViewer({ filePath, label }: { filePath?: string; label: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isPdf = filePath?.toLowerCase().endsWith('.pdf');
  // Backend stores paths like "./uploads/kyc/<file>" or "uploads/kyc/<file>";
  // normalize to a root-relative path and serve through the /api proxy.
  const rel = filePath ? filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '') : '';
  const url = rel ? (rel.startsWith('uploads/') ? `/api/${rel}` : `/api/uploads/kyc/${rel}`) : '';

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-card/60">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      {filePath ? (
        isPdf ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-blue-500 hover:underline font-semibold text-xs py-3">
            📄 View Document PDF
          </a>
        ) : imgFailed ? (
          <div className="text-xs text-rose-400 py-6 text-center border border-dashed border-rose-500/40 rounded-lg">
            Could not load document.{' '}
            <a href={url} target="_blank" rel="noreferrer" className="underline">Open directly</a>
          </div>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border/80">
            <img
              src={url}
              alt={label}
              onError={() => setImgFailed(true)}
              className="w-full h-44 object-cover hover:opacity-90 transition-opacity cursor-pointer"
            />
          </a>
        )
      ) : (
        <div className="text-xs italic text-muted-foreground/60 py-6 text-center border border-dashed border-border/50 rounded-lg">
          Not uploaded
        </div>
      )}
    </div>
  );
}

const FIELD_OPTIONS = [
  { group: 'Personal Information', fields: [
    { id: 'firstName', label: 'First Name' },
    { id: 'lastName', label: 'Last Name' },
    { id: 'dateOfBirth', label: 'Date of Birth' },
    { id: 'phone', label: 'Phone Number' },
    { id: 'nationality', label: 'Nationality' },
    { id: 'country', label: 'Country' },
    { id: 'address', label: 'Address' },
  ]},
  { group: 'Documents & Verification', fields: [
    { id: 'doc_front', label: 'ID / Passport Photo' },
    { id: 'doc_back', label: 'ID Back Side' },
    { id: 'selfie', label: 'Selfie Photo' },
    { id: 'address_proof', label: 'Proof of Address' },
  ]},
];

export default function KycDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [data, setData] = useState<KycDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRejectedFields, setSelectedRejectedFields] = useState<string[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api.get(`/admin/kyc/${userId}`)
      .then((r) => setData(r.data))
      .catch((e: unknown) => {
        const err = e as { response?: { status?: number } };
        setLoadError(err?.response?.status === 404
          ? 'Submission not found.'
          : 'Failed to load the submission. Check your connection and try again.');
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Close whichever dialog is open on Escape
  useEffect(() => {
    if (!showRejectModal && !showApproveConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoading) {
        setShowRejectModal(false);
        setShowApproveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRejectModal, showApproveConfirm, actionLoading]);

  const errorMessage = (e: unknown, fallback: string) => {
    const err = e as { response?: { data?: { message?: string } } };
    return err?.response?.data?.message ?? fallback;
  };

  const approve = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/approve`);
      setData((d) => (d ? { ...d, status: 'approved' } : d));
      setShowApproveConfirm(false);
    } catch (e: unknown) {
      setActionError(errorMessage(e, 'Failed to approve the submission. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleFieldSelection = (fieldId: string) => {
    setSelectedRejectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((f) => f !== fieldId) : [...prev, fieldId]
    );
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/reject`, {
        reason: rejectReason.trim(),
        rejectedFields: selectedRejectedFields,
      });
      setData((d) =>
        d
          ? {
              ...d,
              status: 'rejected',
              rejectionReason: rejectReason.trim(),
              rejectedFields: selectedRejectedFields,
            }
          : d
      );
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedRejectedFields([]);
    } catch (e: unknown) {
      setActionError(errorMessage(e, 'Failed to reject the submission. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="detail-loading" role="status" aria-live="polite">
      <div className="spinner" />
      <p>Loading KYC submission...</p>
    </div>
  );
  if (loadError || !data) return (
    <div className="detail-loading">
      <p>{loadError || 'Submission not found.'}</p>
      <div className="flex gap-3">
        <button type="button" onClick={load} className="text-sm font-semibold text-blue-400 hover:underline">Retry</button>
        <Link href="/kyc" className="text-sm text-muted-foreground hover:underline">Back to KYC list</Link>
      </div>
    </div>
  );

  const canReview = data.status === 'submitted' || data.status === 'under_review';
  const docType = data.document?.docType ?? 'passport';
  const isPassport = docType === 'passport';

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
                <strong className={data.status === 'rejected' && data.rejectedFields?.includes(k) ? 'text-rose-400 font-bold' : ''}>{v}</strong>
              </div>
            )) : <p className="not-submitted">Not submitted</p>}
          </div>

          <div className="info-card">
            <h3>Document Type</h3>
            <div className="info-row">
              <span>Type</span>
              <strong className="uppercase tracking-wider text-blue-400">{docType.replace('_', ' ')}</strong>
            </div>
          </div>

          {data.status === 'rejected' && data.rejectionReason && (
            <div className="rejection-card">
              <h3>❌ Rejection Reason</h3>
              <p>{data.rejectionReason}</p>
              {data.rejectedFields && data.rejectedFields.length > 0 && (
                <div className="mt-3 pt-3 border-t border-rose-500/20">
                  <span className="text-xs font-bold text-rose-400 block mb-1">Flagged Fields for Correction:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.rejectedFields.map((f) => (
                      <span key={f} className="text-[11px] font-mono bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
            <h3>Uploaded Files ({docType.toUpperCase()})</h3>
            <div className="docs-grid">
              {isPassport ? (
                <>
                  <DocViewer filePath={data.document?.frontFilePath} label="Passport (Photo & Signature Page)" />
                  <DocViewer filePath={data.selfie?.filePath} label="Selfie Verification" />
                  <DocViewer filePath={data.addressProof?.filePath} label="Proof of Address" />
                </>
              ) : (
                <>
                  <DocViewer filePath={data.document?.frontFilePath} label="ID Document (Front)" />
                  <DocViewer filePath={data.document?.backFilePath} label="ID Document (Back)" />
                  <DocViewer filePath={data.selfie?.filePath} label="Selfie Verification" />
                  <DocViewer filePath={data.addressProof?.filePath} label="Proof of Address" />
                </>
              )}
            </div>
          </div>

          {canReview && (
            <div className="action-card">
              <h3>Review Decision</h3>
              <div className="action-btns">
                <button
                  className="btn-approve"
                  onClick={() => { setActionError(''); setShowApproveConfirm(true); }}
                  disabled={actionLoading}
                  aria-label="Approve KYC submission"
                >
                  ✓ Approve KYC
                </button>
                <button
                  className="btn-reject"
                  onClick={() => { setActionError(''); setShowRejectModal(true); }}
                  disabled={actionLoading}
                  aria-label="Reject KYC submission"
                >
                  ✕ Reject
                </button>
              </div>
              {actionError && !showRejectModal && !showApproveConfirm && (
                <p className="mt-3 text-xs font-semibold text-rose-400" role="alert">{actionError}</p>
              )}
            </div>
          )}
          {data.status === 'approved' && (
            <div className="approved-banner">✅ KYC has been approved. User verification level set to 1.</div>
          )}
        </div>
      </div>

      {/* Approve Confirmation */}
      {showApproveConfirm && (
        <div className="modal-overlay" onClick={() => !actionLoading && setShowApproveConfirm(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approve-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="approve-confirm-title">Approve KYC Submission</h3>
            <p className="text-xs text-muted-foreground mb-4">
              This advances {data.user?.firstName} {data.user?.lastName} to verification level 1 and
              unlocks gated features. This cannot be undone from the admin panel.
            </p>
            {actionError && <p className="text-xs font-semibold text-rose-400 mb-3" role="alert">{actionError}</p>}
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setShowApproveConfirm(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn-approve-confirm" onClick={approve} disabled={actionLoading} aria-busy={actionLoading}>
                {actionLoading ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            // Don't discard a typed reason on a stray backdrop click
            if (!actionLoading && !rejectReason.trim()) setShowRejectModal(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reject-modal-title">Reject KYC Submission</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Select specific invalid fields and provide a reason for rejection.
            </p>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 mb-4">
              {FIELD_OPTIONS.map((grp) => (
                <div key={grp.group} className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">{grp.group}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {grp.fields.map((f) => {
                      const isChecked = selectedRejectedFields.includes(f.id);
                      return (
                        <label
                          key={f.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                            isChecked
                              ? 'border-rose-500 bg-rose-500/10 text-rose-300 font-semibold'
                              : 'border-border bg-card/40 text-muted-foreground hover:border-border/80'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFieldSelection(f.id)}
                            className="rounded border-input text-rose-600 focus:ring-rose-600"
                          />
                          <span>{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Rejection Reason Note <span className="text-rose-500">*</span></label>
              <textarea
                className="reject-textarea"
                placeholder="e.g. Passport image is blurry and date of birth has a typo..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                aria-required="true"
              />
            </div>

            {actionError && <p className="mt-3 text-xs font-semibold text-rose-400" role="alert">{actionError}</p>}

            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setShowRejectModal(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                className="btn-reject-confirm"
                onClick={reject}
                disabled={!rejectReason.trim() || actionLoading}
                aria-busy={actionLoading}
              >
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
        .modal { background: #1a1f3d; border: 1px solid rgba(99,130,255,0.25); border-radius: 20px; padding: 32px; max-width: 520px; width: 100%; animation: modalIn 0.25s ease both; }
        @keyframes modalIn { from { transform: scale(0.95); opacity: 0; } }
        .modal h3 { font-size: 1.1rem; color: #e8eeff; margin-bottom: 8px; }
        .modal p { color: #7c87b4; font-size: 0.88rem; }
        .reject-textarea { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(99,130,255,0.2); border-radius: 10px; padding: 12px 16px; color: #e8eeff; font-size: 0.9rem; resize: vertical; outline: none; font-family: inherit; }
        .reject-textarea:focus { border-color: #f87171; }
        .modal-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
        .btn-cancel { background: rgba(255,255,255,0.06); color: #9ba8d4; border: 1px solid rgba(99,130,255,0.2); border-radius: 50px; padding: 10px 24px; font-size: 0.88rem; cursor: pointer; }
        .btn-reject-confirm { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 50px; padding: 10px 24px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
        .btn-reject-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-approve-confirm { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 50px; padding: 10px 24px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
        .btn-approve-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } .docs-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .detail-page { padding: 16px; } .docs-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
