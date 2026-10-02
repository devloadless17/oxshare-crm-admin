'use client';

import * as React from 'react';
import api from '@/lib/api';
import type { RejectionReason } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/**
 * The value carried by the "no catalogued reason" option.
 *
 * Radix reserves `''` for "nothing selected", so an item with that value is
 * unreachable. Rejecting without picking from the catalogue is allowed — the
 * free-text note carries the explanation — so this stands in for it and is
 * mapped back to `''` before it leaves the component.
 */
const NO_REASON = '__none__';

/**
 * Turning a partner application down, with a reason the applicant will read.
 *
 * Simpler than the KYC reject dialog on purpose. That one also asks which
 * FIELDS the client must re-submit, because a KYC rejection is a request to fix
 * specific documents. A partner rejection is a decision about the person, not
 * about a form — there is nothing for them to correct field by field — so the
 * dialog asks for a reason and stops.
 *
 * ## The reasons load on OPEN, and a failure does not block
 *
 * Same trade as `use-reject-options.ts`: most applications are approved, so
 * fetching the list with the page would issue a request per review that is
 * usually thrown away. And a reviewer who cannot reach the config endpoint can
 * still reject — they fall back to free text, which is what the requirement
 * actually needs. Refusing to open would let an unreachable list of LABELS
 * block a decision.
 */
export function PartnerRejectDialog({
  open,
  applicantName,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  applicantName: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (input: { reason?: string; note?: string }) => void;
}) {
  return (
    <Modal busy={saving} open={open} onClose={onCancel} title={t('partnerReview.rejectTitle')}>
      {/* Keyed, so reopening on a different application starts from empty
          rather than carrying the previous applicant's note across. Same
          reason as IbLevelFormModal — an effect that re-seeds state renders the
          stale value once first. */}
      <RejectForm
        key={`${applicantName}-${String(open)}`}
        applicantName={applicantName}
        saving={saving}
        error={error}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}

function RejectForm({
  applicantName,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  applicantName: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (input: { reason?: string; note?: string }) => void;
}) {
  const [reasons, setReasons] = React.useState<RejectionReason[]>([]);
  const [selected, setSelected] = React.useState('');
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    api.admin
      .getRejectionReasons('partner')
      .then((rows) => {
        if (!cancelled) setReasons(rows);
      })
      // Deliberately swallowed, and this is the one place it is right to: the
      // fallback is free text, which still satisfies "a reason was given".
      .catch(() => {
        if (!cancelled) setReasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API refuses when both are empty, and so does this — but here it can be
  // said before the click rather than after it.
  const canConfirm = Boolean(selected || note.trim());

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({ reason: selected || undefined, note: note.trim() || undefined });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('partnerReview.rejectIntro', { name: applicantName })}
      </p>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('partnerReview.rejectReason')}
        </span>
        {/*
          "No reason" carries the sentinel `NO_REASON`, not `''`.

          Radix reserves `''` for "nothing selected", so an item with that value
          is unreachable — and here it is a real choice rather than an unset
          field: rejecting without a catalogued reason is allowed, with the free
          text below carrying the explanation. Mapped back to `''` on the way
          out, which is what the caller already expects.
        */}
        <Select
          value={selected === '' ? NO_REASON : selected}
          onValueChange={(value) => setSelected(value === NO_REASON ? '' : value)}
        >
          <SelectTrigger className="h-10 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_REASON} className="text-xs">
              {t('partnerReview.rejectReasonNone')}
            </SelectItem>
            {reasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.label} className="text-xs">
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('partnerReview.rejectNote')}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t('partnerReview.rejectNotePlaceholder')}
          className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-xs leading-relaxed focus-outline"
        />
        {/* The applicant reads the label and the note joined together, so the
            reviewer should know they are writing the second half of a sentence
            somebody else will see. */}
        <span className="block text-[11px] text-muted-foreground">
          {t('partnerReview.rejectNoteHint')}
        </span>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!canConfirm || saving}
          className="inline-flex h-9 items-center rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('partnerReview.rejecting') : t('partnerReview.confirmReject')}
        </button>
      </div>
    </div>
  );
}
