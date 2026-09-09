'use client';

import { Check, Eye, Undo2, X } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * The decision controls, as a dock floating at the bottom of the review screen.
 *
 * ## Why they left the right-hand column
 *
 * They used to sit in an `action-card` below the documents. That put the three
 * decisions at the BOTTOM OF A SCROLLING COLUMN — so on any submission with a
 * few documents, the reviewer scrolled down to read, then scrolled further to
 * act, and the buttons were wherever the page happened to end. The one thing
 * this screen exists to do was the least reachable thing on it.
 *
 * Docked, they are in the same place on every submission, at every scroll
 * position, on every screen height.
 *
 * ## Why labelled buttons rather than bare icons
 *
 * A circular icon-only controller is tempting and wrong here. These three
 * actions are irreversible decisions about somebody's identity documents —
 * approve raises a verification level and unlocks withdrawals, reject emails a
 * refusal — and an icon is a guess until you hover it. The icons are kept as
 * the fast visual anchor and the words carry the meaning, which is the standard
 * an audited action should meet.
 *
 * ## Fixed, and the page pays for the space
 *
 * `position: fixed` means this is out of flow and would otherwise sit on top of
 * whatever the page ends with. The page adds bottom padding (`.detail-page`
 * carries it) so the last card can always be scrolled clear of the dock — a
 * floating bar that covers the content it belongs to is worse than one that is
 * hard to reach.
 */
export function ReviewDock({
  /** `submitted` still offers Claim; `under_review` is already claimed. */
  status,
  /**
   * WHO is holding it, when somebody is.
   *
   * The dock used to justify hiding Claim with "the status pill in the header
   * already says who has it". The pill says "Under review" and nothing else —
   * it never named anyone. So the one state where a reviewer needs to know
   * whether to walk over to a colleague or just take the work told them
   * neither, and offered no way out of the claim either.
   */
  reviewedByName,
  loading,
  error,
  onApprove,
  onReject,
  onClaim,
  onRelease,
}: {
  status: string;
  reviewedByName?: string | null;
  loading: boolean;
  /** Shown ABOVE the dock — a failure has to be visible from where the click was. */
  error?: string;
  onApprove: () => void;
  /** Hand a claimed submission back to the queue. */
  onRelease: () => void;
  onReject: () => void;
  onClaim: () => void;
}) {
  return (
    /*
     * `pointer-events-none` on the positioner and `auto` on the dock itself.
     *
     * The wrapper spans the viewport width to centre its child, and without
     * this it would be an invisible full-width strip swallowing clicks on
     * whatever sits under it at the bottom of the page.
     */
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-4 sm:p-6">
      {error && (
        <p
          role="alert"
          className="pointer-events-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs font-semibold text-destructive shadow-sm backdrop-blur"
        >
          {error}
        </p>
      )}

      <div
        /*
         * `backdrop-blur` plus a translucent surface rather than a solid bar:
         * the reviewer needs to keep seeing the document they are deciding on
         * while the controls sit over it.
         */
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-md"
      >
        <button
          type="button"
          onClick={onReject}
          disabled={loading}
          /*
           * A fuller accessible name than the visible word, and it CONTAINS the
           * visible word — the label-in-name rule. "Reject" alone is ambiguous
           * to somebody tabbing a list of buttons with no surrounding context,
           * on an action that emails a client a refusal.
           */
          aria-label={t('kycReview.rejectAria')}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span>{t('kycReview.rejectCta')}</span>
        </button>

        {/*
          Only while the submission is unclaimed. Once it is `under_review` the
          button would be a no-op that still looks actionable — and the status
          pill in the header already says who has it.
        */}
        {/*
          Claimed: say by whom, and offer the way out. Both halves matter — a
          name with no release leaves a colleague's absence unresolvable, and a
          release with no name makes taking somebody's work back a guess.
        */}
        {status === 'under_review' && (
          <>
            <span aria-hidden="true" className="h-6 w-px bg-border" />
            <span className="text-xs font-medium text-muted-foreground">
              {reviewedByName
                ? t('kycReview.claimedBy', { name: reviewedByName })
                : t('kycReview.claimedByUnknown')}
            </span>
            <button
              type="button"
              onClick={onRelease}
              disabled={loading}
              title={t('kycReview.releaseHint')}
              aria-label={t('kycReview.releaseAria')}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              <span>{t('kycReview.release')}</span>
            </button>
          </>
        )}

        {status === 'submitted' && (
          <>
            <span aria-hidden="true" className="h-6 w-px bg-border" />
            <button
              type="button"
              onClick={onClaim}
              disabled={loading}
              title={t('kycReview.claimHint')}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>{t('kycReview.claim')}</span>
            </button>
          </>
        )}

        <span aria-hidden="true" className="h-6 w-px bg-border" />

        {/*
          The only FILLED button of the three. Approve is the outcome most
          submissions get, and giving it the single solid affordance is what
          makes the dock readable at a glance — reject stays deliberately quiet
          rather than competing as a second bright target next to it.
        */}
        <button
          type="button"
          onClick={onApprove}
          disabled={loading}
          aria-label={t('kycReview.approveAria')}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-success px-5 text-xs font-semibold text-success-foreground shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>{t('kycReview.approveCta')}</span>
        </button>
      </div>
    </div>
  );
}
