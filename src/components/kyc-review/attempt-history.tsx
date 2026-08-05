'use client';

import { useState } from 'react';
import type { components } from '@/lib/api/types.gen';
import { DocViewer } from './doc-viewer';
import { t } from '@/lib/i18n';

type KycAttempt = components['schemas']['KycAttemptDto'];

/**
 * A client's previously decided KYC attempts.
 *
 * ## Why a reviewer needs this
 *
 * Until `kyc_submission_attempts` existed, a resubmission overwrote the original
 * in place: the rejection reason was cleared, the document paths replaced, the
 * reviewer overwritten. So a client refused twice and approved on the third try
 * presented to the next reviewer exactly as one approved first time. Repeat
 * rejection is a fraud signal, and it was invisible.
 *
 * It is also the answer to what a compliance review actually asks — "show me
 * what you refused, and why" — and this is where it gets answered.
 *
 * ## Collapsed on purpose
 *
 * Each attempt is a summary row; its documents render only when expanded.
 * Reading a KYC document is an audited event (PLATFORM-CONVENTIONS R-6.6) and
 * every fetch writes a row naming the admin who read it — so rendering four
 * documents per historical attempt up front would fill the PII access log with
 * reads nobody performed, and bury the ones that matter.
 */
export function AttemptHistory({ attempts }: { attempts: KycAttempt[] }) {
  const [openAttempt, setOpenAttempt] = useState<number | null>(null);

  if (attempts.length === 0) return null;

  return (
    <div className="info-card">
      <h3>{t('kycReview.historyTitle', { count: attempts.length })}</h3>
      <div className="flex flex-col gap-2">
        {attempts.map((a) => {
          const isOpen = openAttempt === a.attemptNo;
          const rejected = a.status === 'rejected';

          return (
            <div
              key={a.attemptNo}
              className={`rounded-lg border ${
                rejected
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-success/30 bg-success/5'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenAttempt(isOpen ? null : a.attemptNo)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start focus-outline cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {t('kycReview.attemptNo', { n: a.attemptNo })}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      rejected ? 'text-destructive' : 'text-success'
                    }`}
                  >
                    {rejected ? t('kycStatus.rejected') : t('kycStatus.approved')}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {a.reviewedAt ? new Date(a.reviewedAt).toLocaleDateString() : '—'}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-border/60 px-3 py-3">
                  {/* Why this attempt was refused — the thing a resubmission
                      used to erase. */}
                  {a.rejectionReason && (
                    <div className="text-xs">
                      <span className="block font-semibold text-destructive">
                        {t('kycReview.rejectionReasonLabel')}
                      </span>
                      <span className="text-foreground">{a.rejectionReason}</span>
                    </div>
                  )}
                  {a.rejectedFields && a.rejectedFields.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.rejectedFields.map((f) => (
                        <span
                          key={f}
                          className="rounded border border-destructive/30 bg-destructive/15 px-2 py-0.5 font-mono text-xs text-destructive"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* The documents AS THEY WERE. Comparing what was refused
                      against what came next is how a reviewer tells a genuine
                      correction from the same file sent again. */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DocViewer
                      filePath={a.document?.frontFilePath}
                      fileName={a.document?.frontFileName}
                      label={
                        (a.document?.docType ?? 'passport') === 'passport'
                          ? t('kycReview.docPassport')
                          : t('kycReview.docIdFront')
                      }
                    />
                    <DocViewer
                      filePath={a.selfie?.filePath}
                      fileName={a.selfie?.fileName}
                      label={t('kycReview.docSelfie')}
                    />
                    <DocViewer
                      filePath={a.addressProof?.filePath}
                      fileName={a.addressProof?.fileName}
                      label={t('kycReview.docAddress')}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
