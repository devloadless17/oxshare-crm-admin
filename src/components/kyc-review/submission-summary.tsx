'use client';

import type { components } from '@/lib/api/types.gen';
import { AttemptHistory } from './attempt-history';
import { personalInfoGroups } from './personal-info-rows';
import { useKycStepConfig } from './use-kyc-step-config';
import { t, type MessageKey } from '@/lib/i18n';

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

/**
 * The timeline label for a decided submission.
 *
 * "Reviewed" is true of an approval and a rejection alike, which is what made
 * it useless: a reviewer scanning the card learned a decision happened and not
 * which one. `under_review` and anything earlier keep it, because nothing has
 * been decided yet and "Approved" would be a lie with a date beside it.
 */
function decisionLabelKey(status: string): MessageKey {
  if (status === 'approved') return 'kycReview.approvedOn';
  if (status === 'rejected') return 'kycReview.rejectedOn';
  return 'kycReview.reviewed';
}

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
  const steps = useKycStepConfig();
  const groups = personalInfoGroups(data.personalInfo, steps, data.stepData);

  return (
    <div className="detail-left">
      {/*
        One card per configured STEP, so the reviewer reads the submission in the
        same shape the client filled it in — rather than one flat list in
        whatever order the JSON happened to hold. See personal-info-rows.ts.
      */}
      {groups.length > 0 ? (
        groups.map((group) => (
          <div key={group.title} className="info-card">
            <h3>{group.title}</h3>
            {group.rows.map((row) => (
              <div key={row.key} className="info-row">
                <span>{row.label}</span>
                <strong
                  className={[
                    data.status === 'rejected' && data.rejectedFields?.includes(row.key)
                      ? 'text-destructive font-bold'
                      : '',
                    // Dimmed rather than blank: "submitted nothing here" is an
                    // answer the reviewer needs, and an empty cell reads as a
                    // rendering fault.
                    row.empty ? 'text-muted-foreground font-normal' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {row.value}
                </strong>
              </div>
            ))}
          </div>
        ))
      ) : (
        <div className="info-card">
          <h3>{t('kycReview.personalInfo')}</h3>
          <p className="not-submitted">{t('kycReview.notSubmitted')}</p>
        </div>
      )}

      {/*
        WHAT THE SELFIE PROVES, said once and where the decision is made.

        A reviewer sees a face photograph beside an ID and the natural reading is
        that something checked it. Nothing did: the portal opens the front camera
        and uploads what it captures, and `POST /kyc/upload` accepts any JPEG
        from any client — so a printed photo, or a phone held up to the lens,
        arrives looking exactly like a live capture.

        That is a fair control at this stage and it is NOT liveness. Saying so is
        the cheapest honest thing available: a reviewer who knows they are
        judging a photograph compares it against the ID, and one who believes it
        was verified does not. It costs nothing and it is the difference between
        a control and a belief about a control.
      */}
      <p className="not-submitted text-[11px] leading-snug">{t('kycReview.selfieCaveat')}</p>

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
        {/*
          WHO decided, not just when.

          The row read "Reviewed · 15 Sep 2026, 18:42" and named nobody, so the
          one screen that records a client's identity verification could not
          answer the first question anyone asks about one: who signed it off. The
          name was already on the wire — `reviewedByName` is resolved for every
          row with a reviewer, decided or not — and only this screen dropped it.

          On a money system that is not a nicety. "Who verified this client"
          is what a regulator asks, what a fraud investigation starts from, and
          what an internal review needs before it can ask anybody anything. The
          answer lived in the database and in the audit log; it just was not on
          the record itself.

          The LABEL carries the outcome and the VALUE carries the person, which
          is the shape the withdrawals desk already uses for exactly this
          (`transactions/page.tsx`) — two screens that answer the same question
          should answer it the same way.

          A deleted administrator falls back to the date alone rather than a
          placeholder name, also matching that screen: an absence stated as an
          absence, never guessed at.
        */}
        <div className="info-row">
          <span>{t(decisionLabelKey(data.status))}</span>
          <strong>
            {data.reviewedAt
              ? data.reviewedByName
                ? `${data.reviewedByName} · ${new Date(data.reviewedAt).toLocaleString()}`
                : new Date(data.reviewedAt).toLocaleString()
              : '—'}
          </strong>
        </div>
      </div>
    </div>
  );
}
