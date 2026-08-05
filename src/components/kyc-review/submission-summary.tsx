'use client';

import type { components } from '@/lib/api/types.gen';
import { AttemptHistory } from './attempt-history';
import { t } from '@/lib/i18n';

type KycDetail = components['schemas']['KycSubmissionDto'];

/**
 * The left-hand column of the review screen: who this is, what they submitted,
 * why it was refused if it was, and when each thing happened.
 *
 * Extracted from `app/kyc/[userId]/page.tsx`, which had grown past its pinned
 * `max-lines` cap. The cap is a ratchet — the repo's rule is that the files
 * already over 400 lines may not grow and the caps are only ever lowered — so
 * adding the account card meant taking something out, not raising the number.
 * Same pattern as `DocViewer`, `ApproveDialog` and `RejectDialog`, which came
 * out of the same page for the same reason.
 *
 * The page keeps its styled-jsx, and these class names resolve against it.
 */
type KycAttempt = components['schemas']['KycAttemptDto'];

export function SubmissionSummary({
  data,
  docType,
  attempts,
}: {
  data: KycDetail;
  docType: string;
  /** Previously decided attempts, oldest first. Empty for a first submission. */
  attempts: KycAttempt[];
}) {
  return (
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

      {/* Signals the reviewer needs, which the API was already sending.
          `reviewerView` returns emailVerified, country and createdAt and the
          screen rendered none of them — so an account opened this morning and
          one opened two years ago looked identical, which is exactly the
          difference a fraud check turns on. */}
      <div className="info-card">
        <h3>{t('kycReview.accountLabel')}</h3>
        <div className="info-row">
          <span>{t('kycReview.emailStatus')}</span>
          <strong className={data.user?.emailVerified ? 'text-success' : 'text-destructive'}>
            {data.user?.emailVerified
              ? t('kycReview.emailVerified')
              : t('kycReview.emailUnverified')}
          </strong>
        </div>
        {data.user?.country && (
          <div className="info-row">
            <span>{t('kycReview.country')}</span>
            <strong>{data.user.country}</strong>
          </div>
        )}
        <div className="info-row">
          <span>{t('kycReview.accountAge')}</span>
          <strong>
            {data.user?.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : '—'}
          </strong>
        </div>
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

      <AttemptHistory attempts={attempts} />

      <div className="timeline-card">
        <h3>{t('kycReview.timeline')}</h3>
        <div className="info-row">
          <span>{t('kycReview.colSubmitted')}</span>
          <strong>{data.submittedAt ? new Date(data.submittedAt).toLocaleString() : '—'}</strong>
        </div>
        <div className="info-row">
          <span>{t('kycReview.reviewed')}</span>
          <strong>{data.reviewedAt ? new Date(data.reviewedAt).toLocaleString() : '—'}</strong>
        </div>
      </div>
    </div>
  );
}
