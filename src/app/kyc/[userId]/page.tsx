'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import Link from 'next/link';
import api from '@/lib/api';
import type { RejectionReason } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { DocViewer } from '@/components/kyc-review/doc-viewer';
import { ApproveDialog } from '@/components/kyc-review/approve-dialog';
import { RejectDialog } from '@/components/kyc-review/reject-dialog';
import { t } from '@/lib/i18n';

interface KycDetail {
  userId: string;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  rejectedFields?: string[];
  user?: { email: string; firstName: string; lastName: string };
  personalInfo?: Record<string, string>;
  document?: {
    docType?: string;
    frontFilePath?: string;
    backFilePath?: string;
    frontFileName?: string;
    backFileName?: string;
  };
  selfie?: { filePath?: string; fileName?: string };
  addressProof?: { docType?: string; filePath?: string; fileName?: string; page2FilePath?: string };
}

export default function KycDetailPage() {
  const params = useParams();
  const userId = params.userId as string;

  const [rejectReason, setRejectReason] = useState('');
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [selectedRejectedFields, setSelectedRejectedFields] = useState<string[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const queryClient = useQueryClient();
  const query = useResource<KycDetail>(
    ['kyc', userId],
    async (signal) => (await api.get<KycDetail>(`/admin/kyc/${userId}`, { signal })).data,
  );

  const data = query.data ?? null;
  const loading = query.status === 'loading';
  const loadError =
    query.status === 'unavailable'
      ? 'Submission not found.'
      : query.status === 'error'
        ? 'Failed to load the submission. Check your connection and try again.'
        : '';
  const load = query.refetch;

  // Escape, Tab cycling, and focus restore — these two dialogs keep their own
  // markup (this page is styled-jsx, not Tailwind) but share the behaviour.
  const approvePanelRef = useRef<HTMLDivElement>(null);
  const rejectPanelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(
    approvePanelRef,
    showApproveConfirm,
    () => setShowApproveConfirm(false),
    !actionLoading,
  );
  useFocusTrap(rejectPanelRef, showRejectModal, () => setShowRejectModal(false), !actionLoading);

  // FR-ADM-03: reasons come from the configurable list; free text is the
  // fallback and doubles as an optional note alongside a selected reason.
  useEffect(() => {
    if (!showRejectModal || reasons.length > 0) return;
    api.admin
      .getRejectionReasons('kyc')
      .then(setReasons)
      .catch(() => setReasons([]));
  }, [showRejectModal, reasons.length]);

  const approve = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/approve`);
      await queryClient.invalidateQueries({ queryKey: ['kyc'] });
      setShowApproveConfirm(false);
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, 'Failed to approve the submission. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const claim = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/claim`);
      await queryClient.invalidateQueries({ queryKey: ['kyc'] });
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, 'Failed to claim the submission for review.'));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleFieldSelection = (fieldId: string) => {
    setSelectedRejectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((f) => f !== fieldId) : [...prev, fieldId],
    );
  };

  const canConfirmReject = selectedReasonId !== '' || rejectReason.trim() !== '';

  const reject = async () => {
    if (!canConfirmReject) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/reject`, {
        reasonId: selectedReasonId || undefined,
        reason: rejectReason.trim() || undefined,
        rejectedFields: selectedRejectedFields,
      });
      await queryClient.invalidateQueries({ queryKey: ['kyc'] });
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedReasonId('');
      setSelectedRejectedFields([]);
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, 'Failed to reject the submission. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loader text="Loading KYC submission..." fullPage />;
  if (loadError || !data)
    return (
      <div className="detail-loading">
        <p>{loadError || 'Submission not found.'}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-semibold text-link hover:underline"
          >
            {t('common.retryShort')}
          </button>
          <Link href="/kyc" className="text-sm text-muted-foreground hover:underline">
            {t('kycReview.backToList')}
          </Link>
        </div>
      </div>
    );

  const canReview = data.status === 'submitted' || data.status === 'under_review';
  const docType = data.document?.docType ?? 'passport';
  const isPassport = docType === 'passport';

  return (
    <div className="detail-page">
      <div className="detail-header">
        <Link href="/kyc" className="back-link inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          <span>{t('kycReview.backToList')}</span>
        </Link>
        <div className="detail-title-row">
          <div>
            <h1>
              {data.user?.firstName} {data.user?.lastName}
            </h1>
            <p>{data.user?.email}</p>
          </div>
          <span className={`status-pill status-${data.status}`}>
            {data.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="detail-grid">
        {/* Left: Info */}
        <div className="detail-left">
          <div className="info-card">
            <h3>{t('kycReview.personalInfo')}</h3>
            {data.personalInfo ? (
              Object.entries(data.personalInfo).map(([k, v]) => (
                <div key={k} className="info-row">
                  <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
                  <strong
                    className={
                      data.status === 'rejected' && data.rejectedFields?.includes(k)
                        ? 'text-destructive font-bold'
                        : ''
                    }
                  >
                    {v}
                  </strong>
                </div>
              ))
            ) : (
              <p className="not-submitted">{t('kycReview.notSubmitted')}</p>
            )}
          </div>

          <div className="info-card">
            <h3>{t('kycReview.documentType')}</h3>
            <div className="info-row">
              <span>{t('kycReview.typeLabel')}</span>
              <strong className="uppercase tracking-wider text-link">
                {docType.replace('_', ' ')}
              </strong>
            </div>
          </div>

          {data.status === 'rejected' && data.rejectionReason && (
            <div className="rejection-card">
              <h3>{t('kycReview.rejectionReasonLabel')}</h3>
              <p>{data.rejectionReason}</p>
              {data.rejectedFields && data.rejectedFields.length > 0 && (
                <div className="mt-3 pt-3 border-t border-destructive/20">
                  <span className="text-xs font-bold text-destructive block mb-1">
                    {t('kycReview.flaggedFields')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.rejectedFields.map((f) => (
                      <span
                        key={f}
                        className="text-[11px] font-mono bg-destructive/15 text-destructive px-2 py-0.5 rounded border border-destructive/30"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="timeline-card">
            <h3>{t('kycReview.timeline')}</h3>
            <div className="info-row">
              <span>{t('kycReview.colSubmitted')}</span>
              <strong>
                {data.submittedAt ? new Date(data.submittedAt).toLocaleString() : '—'}
              </strong>
            </div>
            <div className="info-row">
              <span>{t('kycReview.reviewed')}</span>
              <strong>{data.reviewedAt ? new Date(data.reviewedAt).toLocaleString() : '—'}</strong>
            </div>
          </div>
        </div>

        {/* Right: Documents */}
        <div className="detail-right">
          <div className="docs-card">
            <h3>Uploaded Files ({docType.toUpperCase()})</h3>
            <div className="docs-grid">
              {isPassport ? (
                <>
                  <DocViewer
                    filePath={data.document?.frontFilePath}
                    label="Passport (Photo & Signature Page)"
                  />
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
              <h3>{t('kycReview.decision')}</h3>
              {data.status === 'submitted' && (
                <button
                  className="btn-claim"
                  onClick={() => void claim()}
                  disabled={actionLoading}
                  title="Marks this submission as under review by you, so another admin doesn't review it at the same time"
                >
                  {t('kycReview.claim')}
                </button>
              )}
              <div className="action-btns">
                <button
                  className="btn-approve"
                  onClick={() => {
                    setActionError('');
                    setShowApproveConfirm(true);
                  }}
                  disabled={actionLoading}
                  aria-label="Approve KYC submission"
                >
                  {t('kycReview.approveCta')}
                </button>
                <button
                  className="btn-reject"
                  onClick={() => {
                    setActionError('');
                    setShowRejectModal(true);
                  }}
                  disabled={actionLoading}
                  aria-label="Reject KYC submission"
                >
                  {t('kycReview.rejectCta')}
                </button>
              </div>
              {actionError && !showRejectModal && !showApproveConfirm && (
                <p className="mt-3 text-xs font-semibold text-destructive" role="alert">
                  {actionError}
                </p>
              )}
            </div>
          )}
          {data.status === 'approved' && (
            <div className="approved-banner">
              {t('kycReview.approvedNote')} User verification level set to 1.
            </div>
          )}
        </div>
      </div>

      {/* Approve Confirmation */}
      {showApproveConfirm && (
        <ApproveDialog
          panelRef={approvePanelRef}
          clientName={`${data.user?.firstName ?? ''} ${data.user?.lastName ?? ''}`.trim()}
          loading={actionLoading}
          error={actionError}
          onCancel={() => !actionLoading && setShowApproveConfirm(false)}
          onConfirm={approve}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <RejectDialog
          panelRef={rejectPanelRef}
          reasons={reasons}
          selectedReasonId={selectedReasonId}
          note={rejectReason}
          selectedFields={selectedRejectedFields}
          canConfirm={canConfirmReject}
          loading={actionLoading}
          error={actionError}
          onReasonChange={setSelectedReasonId}
          onNoteChange={setRejectReason}
          onToggleField={toggleFieldSelection}
          onCancel={() => !actionLoading && setShowRejectModal(false)}
          onConfirm={reject}
        />
      )}

      <style jsx>{`
        .detail-page {
          width: 100%;
        }
        .detail-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 50vh;
          gap: 16px;
          color: var(--muted-foreground);
        }
        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid var(--muted);
          border-top-color: var(--ring);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .back-link {
          color: var(--muted-foreground);
          text-decoration: none;
          font-size: 0.85rem;
          display: inline-block;
          margin-bottom: 20px;
        }
        .back-link:hover {
          color: var(--link);
        }
        .detail-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 32px;
        }
        h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--foreground);
        }
        .detail-header p {
          color: var(--muted-foreground);
          font-size: 0.88rem;
          margin-top: 4px;
        }

        .status-pill {
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: capitalize;
        }
        .status-pill.status-submitted {
          background: var(--muted);
          color: var(--link);
        }
        .status-pill.status-under_review {
          background: color-mix(in srgb, var(--info) 15%, transparent);
          color: var(--info);
        }
        .status-pill.status-approved {
          background: color-mix(in srgb, var(--success) 15%, transparent);
          color: var(--success);
        }
        .status-pill.status-rejected {
          background: color-mix(in srgb, var(--destructive) 15%, transparent);
          color: var(--destructive);
        }
        .status-pill.status-in_progress {
          background: color-mix(in srgb, var(--warning) 15%, transparent);
          color: var(--warning);
        }

        .detail-grid {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 24px;
        }
        .detail-left {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .detail-right {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .info-card,
        .docs-card,
        .action-card,
        .timeline-card,
        .rejection-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px 24px;
        }
        h3 {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--muted-foreground);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
          font-size: 0.85rem;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-row span {
          color: var(--muted-foreground);
        }
        .info-row strong {
          color: var(--foreground);
          text-align: right;
          max-width: 60%;
          text-transform: capitalize;
        }
        .not-submitted {
          color: var(--muted-foreground);
          font-size: 0.85rem;
        }
        .rejection-card {
          border-color: color-mix(in srgb, var(--destructive) 25%, transparent);
          background: color-mix(in srgb, var(--destructive) 5%, transparent);
        }
        .rejection-card h3 {
          color: var(--destructive);
        }
        .rejection-card p {
          color: var(--destructive);
          font-size: 0.88rem;
          line-height: 1.6;
        }

        .docs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .action-btns {
          display: flex;
          gap: 12px;
        }
        .btn-claim {
          width: 100%;
          margin-bottom: 12px;
          background: var(--muted);
          color: var(--link);
          border: 1px solid var(--input);
          border-radius: 12px;
          padding: 10px 16px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .btn-claim:hover {
          border-color: var(--ring);
        }
        .btn-claim:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .reject-select {
          width: 100%;
          background: var(--background);
          border: 1px solid var(--input);
          border-radius: 10px;
          padding: 10px 12px;
          color: var(--foreground);
          font-size: 0.9rem;
          outline: none;
        }
        .reject-select:focus {
          border-color: var(--destructive);
        }
        .btn-approve {
          flex: 1;
          background: var(--success);
          color: var(--success-foreground);
          border: none;
          border-radius: 12px;
          padding: 14px 20px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
        }
        .btn-approve:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px color-mix(in srgb, var(--success) 35%, transparent);
        }
        .btn-approve:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .btn-reject {
          padding: 14px 20px;
          background: color-mix(in srgb, var(--destructive) 10%, transparent);
          color: var(--destructive);
          border: 1px solid color-mix(in srgb, var(--destructive) 25%, transparent);
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
        }
        .btn-reject:hover {
          background: color-mix(in srgb, var(--destructive) 20%, transparent);
        }
        .btn-reject:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .approved-banner {
          background: color-mix(in srgb, var(--success) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
          border-radius: 12px;
          padding: 16px 20px;
          color: var(--success);
          font-size: 0.88rem;
          font-weight: 600;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 32px;
          max-width: 520px;
          width: 100%;
          animation: modalIn 0.25s ease both;
        }
        @keyframes modalIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
        }
        .modal h3 {
          font-size: 1.1rem;
          color: var(--foreground);
          margin-bottom: 8px;
        }
        .modal p {
          color: var(--muted-foreground);
          font-size: 0.88rem;
        }
        .reject-textarea {
          width: 100%;
          background: var(--background);
          border: 1px solid var(--input);
          border-radius: 10px;
          padding: 12px 16px;
          color: var(--foreground);
          font-size: 0.9rem;
          resize: vertical;
          outline: none;
          font-family: inherit;
        }
        .reject-textarea:focus {
          border-color: var(--destructive);
        }
        .reject-textarea::placeholder {
          color: var(--muted-foreground);
        }
        .back-link:focus-visible,
        .btn-claim:focus-visible,
        .btn-approve:focus-visible,
        .btn-reject:focus-visible,
        .btn-cancel:focus-visible,
        .btn-approve-confirm:focus-visible,
        .btn-reject-confirm:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .modal-btns {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 20px;
        }
        .btn-cancel {
          background: var(--muted);
          color: var(--muted-foreground);
          border: 1px solid var(--input);
          border-radius: 50px;
          padding: 10px 24px;
          font-size: 0.88rem;
          cursor: pointer;
        }
        .btn-reject-confirm {
          background: var(--destructive);
          color: var(--destructive-foreground);
          border: none;
          border-radius: 50px;
          padding: 10px 24px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-reject-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-approve-confirm {
          background: var(--success);
          color: var(--success-foreground);
          border: none;
          border-radius: 50px;
          padding: 10px 24px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-approve-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 900px) {
          .detail-grid {
            grid-template-columns: 1fr;
          }
          .docs-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 600px) {
          .detail-page {
            padding: 16px;
          }
          .docs-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
