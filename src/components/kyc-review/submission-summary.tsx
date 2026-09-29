'use client';

import type { components } from '@/lib/api/types.gen';
import { AttemptHistory } from './attempt-history';
import { Paperclip } from 'lucide-react';
import { MaskedValue } from '@/components/masked-value';
import {
  additionalSections,
  flagLabels,
  identitySection,
  type ReviewSection,
} from './review-sections';
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
  attempts,
  onOpenFile,
}: {
  data: KycDetail;
  attempts: KycAttempt[];
  onOpenFile?: (filePath: string) => void;
}) {
  const identity = identitySection(data);
  // The account fields with the response's mask beside them, for MaskedValue.
  const userRow = { ...(data.user ?? {}), maskedFields: data.maskedFields ?? [] };
  const additional = additionalSections(data);
  const flagged = flagLabels(data);
  const layout = data.layout;
  /*
   * What the reviewer returned, while it is still with the client — the same
   * rule that turns a typed answer red in `SectionCard`. Documents are flagged
   * by PAGE (`doc_back`, `address_proof_2`) and the selfie by `selfie`; they
   * used to show "Uploaded" in black whatever the flags said (reported
   * 28 Sep 2026: the red worked for answers, never for a passport or a bill).
   */
  const returned = new Set(data.status === 'rejected' ? (data.rejectedFields ?? []) : []);

  return (
    <div className="detail-left">
      {data.reverificationRequestedAt && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          {t('kycReview.reverificationRequested')}
        </p>
      )}

      {/*
        THE LAYOUT IS THE SERVER'S (26 Sep 2026): the client's identity in the
        platform's order, the documents by their exact names, then the broker's
        own questions grouped by the step they were asked on — never mixed, and
        never labelled from today's builder when the client answered yesterday's.
      */}
      <SectionCard section={identity} data={data} onOpenFile={onOpenFile} />

      {layout && (
        <div className="info-card">
          <h3>{t('kycReview.identityDocumentTitle')}</h3>
          <DocumentRows
            label={layout.identityDocument.label}
            pages={layout.identityDocument.pages}
            present={{
              doc_front: data.document?.frontFilePath,
              doc_back: data.document?.backFilePath,
            }}
            returned={returned}
          />
          <h3 className="mt-4">{t('kycReview.proofOfAddressTitle')}</h3>
          {layout.proofOfAddress.asked ? (
            <DocumentRows
              label={layout.proofOfAddress.label}
              pages={layout.proofOfAddress.pages}
              present={{
                address_proof: data.addressProof?.filePath,
                address_proof_2: data.addressProof?.page2FilePath,
              }}
              returned={returned}
            />
          ) : (
            <p className="not-submitted">{t('kycReview.notAsked')}</p>
          )}
          {/* Its OWN heading: without one the selfie row read as a page of the
              proof of address above it (reported 28 Sep 2026). */}
          <h3 className="mt-4">{t('kycReview.selfieTitle')}</h3>
          <div className="info-row">
            <span>{t('kycReview.docSelfie')}</span>
            <strong
              className={
                returned.has('selfie')
                  ? 'text-destructive font-bold'
                  : data.selfie?.filePath
                    ? ''
                    : 'font-normal text-muted-foreground'
              }
            >
              {!layout.selfie.asked
                ? t('kycReview.notAsked')
                : returned.has('selfie')
                  ? t('kycReview.pageReturned')
                  : data.selfie?.filePath
                    ? t('kycReview.pageUploaded')
                    : t('kycReview.pageMissing')}
            </strong>
          </div>
        </div>
      )}

      {additional.map((section) => (
        <SectionCard key={section.id} section={section} data={data} onOpenFile={onOpenFile} />
      ))}

      {/*
        WHAT THE SELFIE PROVES, said once and where the decision is made: a
        photograph compared with the ID by a person, NOT a liveness check.
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
        {/* HIDDEN is not NONE: a masked country used to make the row vanish and a
            masked date read "—", both telling the reviewer there was nothing on
            file. MaskedValue says "hidden" instead (RBAC-03). */}
        <div className="info-row">
          <span>{t('kycReview.country')}</span>
          <strong>
            <MaskedValue field="client.country" row={userRow} />
          </strong>
        </div>
        <div className="info-row">
          <span>{t('kycReview.accountAge')}</span>
          <strong>
            <MaskedValue field="client.createdAt" row={userRow}>
              {data.user?.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : null}
            </MaskedValue>
          </strong>
        </div>
      </div>

      {data.status === 'rejected' && data.rejectionReason && (
        <div className="rejection-card">
          <h3>{t('kycReview.rejectionReasonLabel')}</h3>
          <p>{data.rejectionReason}</p>
          {flagged.length > 0 && (
            <div className="mt-3 pt-3 border-t border-destructive/20">
              <span className="text-xs font-bold text-destructive block mb-1">
                {t('kycReview.flaggedFields')}
              </span>
              {/* By the label the client read, never the stored key — a builder
                  field's key is `customField_<timestamp>`. */}
              <div className="flex flex-wrap gap-1.5">
                {flagged.map((label) => (
                  <span
                    key={label}
                    className="text-[11px] bg-destructive/15 text-destructive px-2 py-0.5 rounded border border-destructive/30"
                  >
                    {label}
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

/** One section of rows: a label, the value — "—" when blank — and a file opens the viewer. */
function SectionCard({
  section,
  data,
  onOpenFile,
}: {
  section: ReviewSection;
  data: KycDetail;
  onOpenFile?: (filePath: string) => void;
}) {
  if (section.rows.length === 0) return null;
  return (
    <div className="info-card">
      <h3>{section.title}</h3>
      {section.rows.map((row) => (
        <div key={row.key} className="info-row">
          <span>{row.label}</span>
          <strong
            className={[
              data.status === 'rejected' && row.flagged ? 'text-destructive font-bold' : '',
              // Dimmed rather than blank: "nothing here" is an answer the
              // reviewer needs, and an empty cell reads as a rendering fault.
              row.empty ? 'text-muted-foreground font-normal' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {row.file && onOpenFile ? (
              <button
                type="button"
                onClick={() => onOpenFile(row.file!.filePath)}
                className="inline-flex max-w-full items-center gap-1 text-link hover:underline focus-outline"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{row.value}</span>
                <span className="shrink-0 font-normal">· {t('kycReview.viewFile')}</span>
              </button>
            ) : (
              row.value
            )}
          </strong>
        </div>
      ))}
    </div>
  );
}

/**
 * A document ON FILE by its exact name, whether each of its pages arrived, and —
 * in red — each page the reviewer returned.
 */
function DocumentRows({
  label,
  pages,
  present,
  returned,
}: {
  label: string;
  pages: { slot: string; label: string }[];
  present: Record<string, string | undefined>;
  returned: ReadonlySet<string>;
}) {
  return (
    <>
      {pages
        .filter((page, index) => index === 0 || present[page.slot])
        .map((page) => {
          const isReturned = returned.has(page.slot);
          return (
            <div key={page.slot} className="info-row">
              <span>{pages.length > 1 ? `${label} — ${page.label}` : label}</span>
              <strong
                className={
                  isReturned
                    ? 'text-destructive font-bold'
                    : present[page.slot]
                      ? ''
                      : 'font-normal text-muted-foreground'
                }
              >
                {isReturned
                  ? t('kycReview.pageReturned')
                  : present[page.slot]
                    ? t('kycReview.pageUploaded')
                    : t('kycReview.pageMissing')}
              </strong>
            </div>
          );
        })}
    </>
  );
}
