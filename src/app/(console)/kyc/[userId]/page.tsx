'use client';

import { useRef, useState } from 'react';
import type { components } from '@/lib/api/types.gen';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import Link from 'next/link';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { CopyableId } from '@/components/copyable-id';
import { DocViewer } from '@/components/kyc-review/doc-viewer';
import { ApproveDialog } from '@/components/kyc-review/approve-dialog';
import { RejectDialog } from '@/components/kyc-review/reject-dialog';
import { DocLightbox } from '@/components/kyc-review/doc-lightbox';
import { documentsOf } from '@/components/kyc-review/documents-of';
import { useRejectOptions } from '@/components/kyc-review/use-reject-options';
import { SubmissionSummary } from '@/components/kyc-review/submission-summary';
import { ReviewDock } from '@/components/kyc-review/review-dock';
import { kycStatusColor, kycStatusLabel } from '@/lib/kyc-status';
import { t } from '@/lib/i18n';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { keys } from '@/lib/query-keys';

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
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [selectedRejectedFields, setSelectedRejectedFields] = useState<string[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  /** Which document the lightbox is showing, or null when it is closed. */
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const query = useResource<KycDetail>(
    keys.kyc.detail(userId),
    async (signal) => (await api.get<KycDetail>(`/admin/kyc/${userId}`, { signal })).data,
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
  const loading = query.status === 'loading';
  const loadError =
    query.status === 'unavailable'
      ? t('kycReview.notFound')
      : query.status === 'error'
        ? t('kycReview.loadFailed')
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

  // Both configurable lists the reject dialog offers, loaded when it opens.
  const { reasons, fieldGroups } = useRejectOptions(showRejectModal);

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
        rejectedFields: selectedRejectedFields,
      });
      await refreshAfterDecision();
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedReasonId('');
      setSelectedRejectedFields([]);
    } catch (e: unknown) {
      setActionError(apiErrorMessage(e, t('kycReview.rejectFailed')));
    } finally {
      setActionLoading(false);
    }
  };

  /*
   * CENTRED IN THE SPACE THE PAGE ACTUALLY HAS, not in the first 60% of it.
   *
   * `PageLoader`'s own `min-h-[60vh]` centres within 60% of the viewport, which
   * on this screen put the spinner around a third of the way down with the rest
   * of the area empty — it read as content that had finished loading rather
   * than as a page still working. The wrapper takes the full height the console
   * layout gives (`flex-1` against an `h-screen` ancestor with `min-h-0`), and
   * `min-h-0` on the loader overrides its own floor so it centres in that
   * instead. `cn` is twMerge-based, so the later class wins.
   */
  if (loading)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <PageLoader label={t('kycReview.loading')} className="min-h-0" />
      </div>
    );
  if (loadError || !data)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{loadError || t('kycReview.notFound')}</p>
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

  /*
   * A decision is owed AND this admin may make it. The route is open to
   * `kyc.view` on purpose (a compliance READER may open the queue), so without
   * the second half a read-only reviewer was shown Approve / Reject / Claim —
   * three irreversible buttons the API answers with 403.
   */
  const canReview =
    (data.status === 'submitted' || data.status === 'under_review') &&
    hasPermission(admin, 'kyc.review');
  const waitingDays = daysWaiting(data.status, data.submittedAt);
  // One derived list, shared by the grid and the lightbox, so the two cannot
  // disagree about which documents exist.
  const documents = documentsOf(data);
  const docType = data.document?.docType ?? 'passport';

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
                {data.user?.firstName} {data.user?.lastName}
              </h1>
              <p className="truncate">{data.user?.email}</p>
              {/* The route param, not `data.user.id` — same identifier, but the
                  param is present even on a response whose user block is not. */}
              <CopyableId value={userId} />
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
                {t('kycReview.waitingDays', { days: waitingDays })}
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
        <SubmissionSummary data={data} docType={docType} attempts={history.data ?? []} />

        {/* Right: Documents */}
        <div className="detail-right">
          <div className="docs-card">
            <h3>
              {t('kycReview.uploadedFiles', { docType: docType.replace('_', ' ').toUpperCase() })}
            </h3>
            <div className="docs-grid">
              {documents.map((d, i) => (
                <DocViewer
                  key={d.filePath}
                  filePath={d.filePath}
                  fileName={d.fileName}
                  label={d.label}
                  onOpen={() => setLightboxAt(i)}
                />
              ))}
            </div>
          </div>

          {/* The decision controls are DOCKED at the foot of the screen — see
              ReviewDock. They used to sit here, at the bottom of this scrolling
              column, which put the whole point of the page below however many
              documents the client happened to upload. */}
          {data.status === 'approved' && (
            <div className="approved-banner">{t('kycReview.approvedNote')}</div>
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
          fieldGroups={fieldGroups}
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
