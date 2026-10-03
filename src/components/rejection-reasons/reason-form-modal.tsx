'use client';

import * as React from 'react';
import type { RejectionContext, RejectionReason } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { ArabicTextField } from '@/components/arabic-text-field';
import { t } from '@/lib/i18n';

/** The server's bound for a reason, English and Arabic alike (`REJECTION_REASON_MAX`). */
const REASON_MAX = 500;

export interface ReasonFormValues {
  label: string;
  /** The trimmed Arabic, or `null` for a blank box — which on an edit CLEARS it. */
  labelAr: string | null;
}

const INPUT = 'mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline';

/**
 * Add or edit one rejection reason: its English (what reviewers pick and the
 * canonical text) and its optional Arabic (what a client reading the portal in
 * Arabic is shown). The context is fixed — a reason is filed under the queue it
 * was added from and never moves, since a reason that changed queues would
 * change what past decisions in its old queue are translated as.
 */
export function ReasonFormModal({
  open,
  context,
  reason,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  context: RejectionContext;
  /** Present when editing; absent when adding. */
  reason?: RejectionReason;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: ReasonFormValues) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reason ? t('reasons.editTitle') : t('reasons.createTitle')}
      description={t('reasons.usedFor', { context: t(`reasons.context.${context}`) })}
    >
      {/* Keyed so a different reason REMOUNTS the form with its own values. */}
      <ReasonForm
        key={`${reason?.id ?? 'new'}-${context}-${String(open)}`}
        reason={reason}
        saving={saving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function ReasonForm({
  reason,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  reason?: RejectionReason;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: ReasonFormValues) => void;
}) {
  const [label, setLabel] = React.useState(reason?.label ?? '');
  const [labelAr, setLabelAr] = React.useState(reason?.labelAr ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedAr = labelAr.trim();
        onSubmit({ label: label.trim(), labelAr: trimmedAr === '' ? null : trimmedAr });
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="reason-label" className="text-xs font-semibold">
          {t('reasons.labelField')}
        </label>
        <input
          id="reason-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          maxLength={REASON_MAX}
          placeholder={t('reasons.labelPlaceholder')}
          className={INPUT}
        />
      </div>

      <ArabicTextField
        id="reason-label-ar"
        label={t('reasons.arabicField')}
        value={labelAr}
        onChange={setLabelAr}
        maxLength={REASON_MAX}
        className={INPUT}
      />

      {error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || label.trim() === ''}
          className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
