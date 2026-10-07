'use client';

import { clientLabel, clientProfileHref } from '@/components/clients/client-identity';
import { PermittedLink } from '@/components/permitted-link';
import { useRef, useState } from 'react';
import type { components } from '@/lib/api/types.gen';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import Link from 'next/link';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { CopyableId } from '@/components/copyable-id';
import { DocumentGroups } from '@/components/kyc-review/document-groups';
import { ApproveDialog } from '@/components/kyc-review/approve-dialog';
import { RejectDialog } from '@/components/kyc-review/reject-dialog';
import { DocLightbox } from '@/components/kyc-review/doc-lightbox';
import {
  reviewDocumentGroups,
  reviewDocuments,
  reviewFieldGroups,
} from '@/components/kyc-review/review-sections';
import { useRejectOptions } from '@/components/kyc-review/use-reject-options';
import { SubmissionSummary } from '@/components/kyc-review/submission-summary';
import {
  CorrectIdentityDialog,
  type CorrectionPatch,
} from '@/components/kyc-review/correct-identity-dialog';
import { ReverifyDialog } from '@/components/kyc-review/reverify-dialog';
import { arabicOrNull } from '@/components/arabic-text-field';
import { isMasked } from '@/lib/masking';
import { ReviewDock } from '@/components/kyc-review/review-dock';
import { kycStatusColor, kycStatusLabel } from '@/lib/kyc-status';
import { t } from '@/lib/i18n';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { apiErrorCode } from '@/lib/api/errors';
import { keys } from '@/lib/query-keys';
import { waitingLabel } from '@/lib/waiting';
import { useMarkSubjectRead } from '@/components/notifications/use-mark-subject-read';

/**
 * An ALIAS, not a hand-written copy — R-1.1.
 *
 * The generated `KycSubmissionDto` already describes this response. Declaring it
 * by hand removes the one mechanism that turns backend drift into a compile
 * error, and does it silently: the page goes on building against a description
 * of an API that has moved.
 */
type KycDetail = components['schemas']['KycSubmissionDto'];
type KycAttempt = components['schemas']['KycAttemptDto'];

/*
 * The local `statusLabel` is gone — it lives in `lib/kyc-status.ts` now,
 * alongside the colour, so the queue's pill and this one cannot disagree.
 */

/**
 * Whole days this submission has been waiting for a decision, or `null` if it
 * is not waiting for one.
 *
 * The same rule the queue applies: only `submitted` and `under_review` are
 * waiting — a client still filling in their details has not asked for a
 * decision, and a decided one is not waiting. Duplicated deliberately rather
 * than shared: the queue's copy also feeds its sort, and one number computed
 * two ways is cheaper to read here than an import that couples two screens.
 */
function daysWaiting(status: string, submittedAt: string | null | undefined): number | null {
  if (status !== 'submitted' && status !== 'under_review') return null;
  if (!submittedAt) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000));
}

export default function KycDetailPage() {
  const { admin } = useAdmin();
  const params = useParams();
  const userId = params.userId as string;

  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonAr, setRejectReasonAr] = useState('');
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [selectedRejectedFields, setSelectedRejectedFields] = useState<string[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showCorrectDialog, setShowCorrectDialog] = useState(false);
  /*
   * Held apart from `actionError` on purpose — see `correctIdentity`. One means
   * the request failed; the other means it succeeded in telling us the record
   * is wrong, and they need different words and a different remedy.
   */
  const [correctionRefusal, setCorrectionRefusal] = useState('');
  const [correctionErrors, setCorrectionErrors] = useState<Record<string, string>>({});
  const [showReverify, setShowReverify] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  /** Which document the lightbox is showing, or null when it is closed. */
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const query = useResource<KycDetail>(
    keys.kyc.detail(userId),
    async (signal) => (await api.get<KycDetail>(`/admin/kyc/${userId}`, { signal })).data,
  );
  // Reading the submission reads its "Review KYC" task, whose subject is the
  // client by Portal ID. The response's id, not the URL's: the URL may carry
  // `#1000245` or a leading space that the API tolerates and the marker must not.
  useMarkSubjectRead(
    'kyc',
    query.status === 'ready' && query.data ? String(query.data.userId) : undefined,
  );

  /*
   * Previously decided attempts.
   *
   * A separate query rather than part of the submission: it is empty for most
   * clients (a first submission has no history), it is a different lifetime —
   * the past does not change while this screen is open — and a failure to load
   * it must not stop the reviewer deciding on what is in front of them.
   */
  const history = useResource<KycAttempt[]>(
    keys.kyc.history(userId),
    async (signal) =>
      (await api.get<KycAttempt[]>(`/admin/kyc/${userId}/history`, { signal })).data,
  );

  /**
   * Everything a KYC decision changes, in one place.
   *
   * ⚠️ This used to be `invalidateQueries({ queryKey: ['kyc'] })` and it was
   * REPORTED FROM PRODUCTION: approve a document and the sidebar's "KYC
   * review" count keeps reading 1 until the page is refreshed. The badge sat
   * at `['admin','kyc','pending-count']`, which shares no prefix with
   * `['kyc']`, so the invalidate matched nothing, resolved happily and
   * refetched nothing — the silent failure the key registry exists to remove.
   * The badge is `keys.kyc.pendingCount()` now, UNDER `keys.kyc.all()`, so the
   * first line below covers the queue, this detail page and the badge at once.
   *
   * The other three are surfaces a reviewer reaches straight afterwards, each
   * of which reads something an approval just wrote: the dashboard counts
   * pending reviews, the client's profile shows their verification level (the
   * approval sets it, plus their verified phone and country), and the clients
   * list carries a KYC status column and a KYC filter.
   */
  const refreshAfterDecision = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.kyc.all() }),
      queryClient.invalidateQueries({ queryKey: keys.stats.all() }),
      queryClient.invalidateQueries({ queryKey: keys.clients.detail(userId) }),
      queryClient.invalidateQueries({ queryKey: keys.clients.all() }),
    ]);
  };

  const data = query.data ?? null;

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

  // The configured reasons, loaded when the dialog opens; the items from the layout.
  const { reasons, fieldGroups } = useRejectOptions(showRejectModal, data);

  /*
   * `?correct=1` opens "Correct details" on arrival. The client profile's Edit
   * profile links here for the fields a verification locked (owner, 26 Sep
   * 2026) — a locked field that only says "go somewhere else" is a dead end.
   * Once per visit, and only where the correction is actually offered —
   * decided the first render the submission is here, during render rather
   * than in an effect (React's pattern for state that follows data).
   */
  const [correctionAsked, setCorrectionAsked] = useState(false);
  if (!correctionAsked && data) {
    setCorrectionAsked(true);
    const asked =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('correct') === '1';
    if (asked && data.status === 'approved' && hasPermission(admin, 'kyc.identity.correct')) {
      setShowCorrectDialog(true);
    }
  }

  const approve = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/approve`);
      await refreshAfterDecision();
      setShowApproveConfirm(false);
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, t('kycReview.approveFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  const correctIdentity = async (patch: CorrectionPatch) => {
    setActionLoading(true);
    setActionError('');
    setCorrectionRefusal('');
    setCorrectionErrors({});
    try {
      await api.patch(`/admin/kyc/${userId}/personal-info`, patch);
      await refreshAfterDecision();
      setShowCorrectDialog(false);
    } catch (e: unknown) {
      // The profile's own sentence, under the field it is about.
      const fields = apiFieldErrors(e);
      if (Object.keys(fields).length > 0) {
        setCorrectionErrors(fields);
        return;
      }
      /*
       * A REFUSAL is not a failure. `KYC_CORRECTION_REFUSED` means the request
       * landed and the corrected value would not have been accepted at
       * submission — so the operator has discovered that an APPROVED record is
       * disqualifying, which is a finding about the client rather than about
       * their typing. Rendering it in the same red line as "the network died"
       * would tell them to try again, and another attempt cannot succeed.
       */
      if (apiErrorCode(e) === 'KYC_CORRECTION_REFUSED') {
        setCorrectionRefusal(apiErrorMessage(e, t('kycReview.correctRefusedTitle')));
      } else {
        setActionError(apiErrorMessage(e, t('kycReview.correctFailed')));
      }
    } finally {
      setActionLoading(false);
    }
  };

  /** Return this APPROVED verification to the client to update — see ReverifyDialog. */
  const requestReverification = async (request: {
    reason: string;
    reasonAr?: string;
    items: string[];
  }) => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/admin/kyc/${userId}/reverify`, request);
      await refreshAfterDecision();
      setShowReverify(false);
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, t('kycReview.reverifyFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  const claim = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/claim`);
      await refreshAfterDecision();
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, t('kycReview.claimFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Hand a claimed submission back to the queue.
   *
   * The same refresh as a decision, because it changes the same things: the
   * row leaves `under_review`, the queue's counts move, and the sidebar badge
   * counts `submitted + under_review` so it stays put — which is correct, and
   * is why the badge is not the thing to watch when testing this.
   */
  const release = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await api.patch(`/admin/kyc/${userId}/release`);
      await refreshAfterDecision();
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, t('kycReview.releaseFailed')));
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
        reasonAr: arabicOrNull(rejectReasonAr) ?? undefined,
        rejectedFields: selectedRejectedFields,
      });
      await refreshAfterDecision();
      setShowRejectModal(false);
      setRejectReason('');
      setRejectReasonAr('');
      setSelectedReasonId('');
      setSelectedRejectedFields([]);
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, t('kycReview.rejectFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  /*
   * 404 IS NOT "NOT BUILT", so it keeps its own branch.
   *
   * `AsyncBoundary`'s `unavailable` state renders `BackendPending`, which tells
   * the reader an endpoint has not been written yet. That is right almost
   * everywhere and wrong here: on this route a 404 means the SUBMISSION does
   * not exist, and a reviewer who followed a stale link needs to be told that,
   * not that compliance review is unimplemented. Its own render test caught
   * this the moment the boundary swallowed it.
   */
  if (query.status === 'notFound')
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t('kycReview.notFound')}</p>
        <Link href="/kyc" className="text-sm text-muted-foreground hover:underline">
          {t('kycReview.backToList')}
        </Link>
      </div>
    );

  /*
   * EVERY OTHER non-ready state through one boundary.
   *
   * This screen used to test `loading`, then `unavailable`, then `error`, and
   * let everything else fall through to `!data` — which rendered "not found".
   * So a reviewer denied the detail by RBAC-03 was told the submission does not
   * exist. `useResource` distinguishes `forbidden` and `unauthenticated`
   * precisely so a screen need not guess, and `AsyncBoundary` renders each: a
   * closed-door card with no retry for a 403, and nothing alarming for a 401
   * because the interceptor is already navigating.
   */
  if (query.status !== 'ready' || !data)
    return (
      <AsyncBoundary
        status={query.status}
        label={t('kycReview.loading')}
        endpoints={[`GET /admin/kyc/${userId}`]}
        onRetry={query.refetch}
        errorMessage={t('kycReview.loadFailed')}
        error={query.error}
        fill
      >
        {null}
      </AsyncBoundary>
    );

  /*
   * A decision is owed AND this admin may make it. The route is open to
   * `kyc.view` on purpose (a compliance READER may open the queue), so without
   * the second half a read-only reviewer was shown Approve / Reject / Claim —
   * three irreversible buttons the API answers with 403.
   */
  const canReview =
    (data.status === 'submitted' || data.status === 'under_review') &&
    hasPermission(admin, 'kyc.review');
  /*
   * APPROVED-only, and behind its OWN permission.
   *
   * Every other KYC state lets the client fix their own details in the wizard,
   * so an admin correction there would be a second way to do something they can
   * already do, with more privilege and less context. Approved is the one state
   * with no path — `resetKyc` refuses it and tells the client to contact
   * support, and support had nothing until this route existed.
   *
   * `kyc.identity.correct` rather than `kyc.review`: writing a new date of
   * birth onto a VERIFIED record is not the same power as deciding a
   * submission, and a reviewer holding one should not silently hold the other.
   */
  const canCorrectIdentity =
    data.status === 'approved' && hasPermission(admin, 'kyc.identity.correct');
  // The same power as a rejection — returning a decided verification.
  const canReverify = data.status === 'approved' && hasPermission(admin, 'kyc.review');
  const waitingDays = daysWaiting(data.status, data.submittedAt);
  // One derived list, shared by the grid and the lightbox, so the two cannot
  // disagree about which documents exist — named from the server's layout.
  const documents = reviewDocuments(data);
  const canOpenDocuments =
    hasPermission(admin, 'kyc.documents.view') || hasPermission(admin, 'kyc.review');
  // Name, else email, else the Portal ID — a masked name must not blank the heading.
  const clientName = data.user ? clientLabel(data.user, '') : '';

  return (
    <div className="detail-page">
      <div className="detail-header">
        <Link href="/kyc" className="back-link inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          <span>{t('kycReview.backToList')}</span>
        </Link>
        {/*
          An identity card rather than a bare heading: the reviewer's first job
          is to know WHO this is, and a monogram, name and address read as a
          person where a lone `<h1>` read as a page title.
        */}
        <div className="detail-title-row">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
            >
              {(data.user?.firstName?.[0] ?? '?').toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate">
                {data.user?.portalId !== undefined ? (
                  <PermittedLink
                    href={clientProfileHref(data.user.portalId)}
                    className="hover:underline focus-outline rounded-sm"
                  >
                    {clientName}
                  </PermittedLink>
                ) : (
                  clientName
                )}
              </h1>
              <p className="truncate">{data.user?.email}</p>
              {/*
                The PORTAL ID — the number staff and the client use, and what
                this page's own URL carries. Absent only if the user block is.
              */}
              {data.user?.portalId !== undefined && (
                <CopyableId
                  value={String(data.user.portalId)}
                  full
                  copyLabel={t('common.copyPortalId')}
                />
              )}
            </div>
          </div>
          {/*
            The status, and — when one is owed — how long the client has been
            waiting for it. The queue shows that number and the screen where the
            decision is actually made did not, so the reviewer lost the one piece
            of context that says which submission is urgent.
          */}
          <div className="flex shrink-0 items-center gap-2">
            {waitingDays !== null && (
              <span
                className={`text-xs font-semibold ${
                  waitingDays >= 3 ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {data.submittedAt && waitingLabel(data.submittedAt)}
              </span>
            )}
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap"
              style={{
                background: `color-mix(in srgb, ${kycStatusColor(data.status)} 13%, transparent)`,
                color: kycStatusColor(data.status),
                border: `1px solid color-mix(in srgb, ${kycStatusColor(data.status)} 27%, transparent)`,
              }}
            >
              {kycStatusLabel(data.status)}
            </span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        {/* Left: who this is, what they sent, and when — see SubmissionSummary. */}
        <SubmissionSummary
          data={data}
          attempts={history.data ?? []}
          onOpenFile={(filePath) => {
            const at = documents.findIndex((d) => d.filePath === filePath);
            if (at >= 0) setLightboxAt(at);
          }}
        />

        {/* Right: Documents */}
        <div className="detail-right">
          <div className="docs-card">
            <h3>{t('kycReview.documentsTitle')}</h3>
            {/*
              The files open only with `kyc.documents.view` — or `kyc.review`,
              which the API treats as implying it (a reviewer must see what they
              decide on). Without either every thumbnail was a broken image and
              every click a 403 (Oct 2026 audit).
            */}
            {canOpenDocuments ? (
              <DocumentGroups groups={reviewDocumentGroups(data)} onOpen={setLightboxAt} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('kycReview.documentsNotAllowed')}</p>
            )}
          </div>

          {/* The decision controls are DOCKED at the foot of the screen — see
              ReviewDock. They used to sit here, at the bottom of this scrolling
              column, which put the whole point of the page below however many
              documents the client happened to upload. */}
          {data.status === 'approved' && (
            <div className="approved-banner">
              {t('kycReview.approvedNote')}
              {/*
                The ONE thing that can still be changed on an approved
                verification, offered where the approval is stated rather than
                in the docked decision bar — that bar is for deciding, and this
                submission is decided.
              */}
              {canCorrectIdentity && (
                <button
                  type="button"
                  onClick={() => {
                    setActionError('');
                    setCorrectionRefusal('');
                    setCorrectionErrors({});
                    setShowCorrectDialog(true);
                  }}
                  className="ms-2 font-semibold underline focus-outline"
                >
                  {t('kycReview.correctAction')}
                </button>
              )}
              {canReverify && (
                <button
                  type="button"
                  onClick={() => {
                    setActionError('');
                    setShowReverify(true);
                  }}
                  className="ms-3 font-semibold underline focus-outline"
                >
                  {t('kycReview.reverifyAction')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approve Confirmation */}
      {showApproveConfirm && (
        <ApproveDialog
          panelRef={approvePanelRef}
          clientName={clientName}
          loading={actionLoading}
          error={actionError}
          onCancel={() => !actionLoading && setShowApproveConfirm(false)}
          onConfirm={approve}
        />
      )}

      {showCorrectDialog && (
        <CorrectIdentityDialog
          clientName={clientName}
          current={data.personalInfo ?? {}}
          isHidden={(key) =>
            isMasked(`kyc.personalInfo.${key}`, data.maskedFields) ||
            isMasked(`client.${key}`, data.maskedFields)
          }
          loading={actionLoading}
          error={actionError}
          fieldErrors={correctionErrors}
          refusal={correctionRefusal}
          onCancel={() => !actionLoading && setShowCorrectDialog(false)}
          onConfirm={correctIdentity}
        />
      )}

      {showReverify && (
        <ReverifyDialog
          clientName={clientName}
          groups={reviewFieldGroups(data)}
          loading={actionLoading}
          error={actionError}
          onCancel={() => !actionLoading && setShowReverify(false)}
          onConfirm={requestReverification}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <RejectDialog
          panelRef={rejectPanelRef}
          reasons={reasons}
          selectedReasonId={selectedReasonId}
          note={rejectReason}
          noteAr={rejectReasonAr}
          selectedFields={selectedRejectedFields}
          fieldGroups={fieldGroups}
          canConfirm={canConfirmReject}
          loading={actionLoading}
          error={actionError}
          onReasonChange={setSelectedReasonId}
          onNoteChange={setRejectReason}
          onNoteArChange={setRejectReasonAr}
          onToggleField={toggleFieldSelection}
          onCancel={() => !actionLoading && setShowRejectModal(false)}
          onConfirm={reject}
        />
      )}

      {lightboxAt !== null && (
        <DocLightbox
          docs={documents}
          index={lightboxAt}
          onClose={() => setLightboxAt(null)}
          onNavigate={setLightboxAt}
        />
      )}

      {/*
        Rendered LAST and only while a decision is owed.

        Hidden behind the lightbox check as well: the lightbox is a full-screen
        overlay for reading a document, and a floating action bar sitting on top
        of it would offer an approve button over an image the reviewer is still
        examining.
      */}
      {canReview && lightboxAt === null && (
        <ReviewDock
          status={data.status}
          reviewedByName={data.reviewedByName}
          heldByColleague={
            data.status === 'under_review' && !!data.reviewedBy && data.reviewedBy !== admin?.id
          }
          canOverrideClaim={hasPermission(admin, 'kyc.claim.override')}
          loading={actionLoading}
          error={!showRejectModal && !showApproveConfirm ? actionError : ''}
          onApprove={() => {
            setActionError('');
            setShowApproveConfirm(true);
          }}
          onReject={() => {
            setActionError('');
            setShowRejectModal(true);
          }}
          onClaim={() => void claim()}
          onRelease={() => void release()}
        />
      )}

      {/*
        The `<style jsx>` block that used to live here is gone — its rules are in
        src/app/globals.css now.

        styled-jsx is SCOPED: it stamps an attribute on the elements this component
        renders and confines every selector to them. That was fine while this page
        rendered all of its own markup. When it was split into kyc-review/*, the
        elements moved into child components — outside the scope — and their styles
        silently stopped applying. `.info-row` was still defined and no longer
        matched anything, so the review screen showed "CountryUAE" and
        "Last NameDoe" run together while this page's own header stayed styled.

        Nothing failed: a className is a string, an unmatched CSS rule is not an
        error, and the tests assert on text and roles rather than layout.
        scripts/check-css-classes.mjs is the guard that would have caught it.
      */}
    </div>
  );
}
