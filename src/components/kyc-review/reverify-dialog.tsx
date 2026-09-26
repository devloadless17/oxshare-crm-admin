'use client';

import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { t } from '@/lib/i18n';
import type { ReviewFieldGroup } from './review-sections';

/**
 * RETURN AN APPROVED VERIFICATION TO THE CLIENT (the owner's ruling, 26 Sep 2026).
 *
 * The dead end this closes: a verified detail that changed materially had no
 * path, and the API's only lever was a REJECTION — emailed as "your application
 * needs correction", which reads as a verdict on a client who did nothing
 * wrong. This asks them to UPDATE: the reason is emailed to them as written,
 * the items ticked are what their form marks to redo, and the screen says
 * plainly that deposits and withdrawals pause until the update is approved.
 *
 * A typo is not this — "Correct details" fixes it without taking anything away.
 */
export function ReverifyDialog({
  clientName,
  groups,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  clientName: string;
  groups: ReviewFieldGroup[];
  loading: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (request: { reason: string; items: string[] }) => Promise<void>;
}) {
  const [items, setItems] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState('');
  const panel = React.useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true, onCancel, !loading);

  const toggle = (id: string) =>
    setItems((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const canConfirm = items.length > 0 && reason.trim().length >= 10 && !loading;

  return (
    <div className="modal-overlay" onClick={() => !loading && !reason.trim() && onCancel()}>
      <div
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reverify-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reverify-title">{t('kycReview.reverifyTitle', { client: clientName })}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{t('kycReview.reverifyBody')}</p>

        <p className="mb-2 text-xs font-bold text-foreground">
          {t('kycReview.reverifyItems')} <span className="text-destructive">*</span>
        </p>
        <div className="mb-4 max-h-[40vh] space-y-4 overflow-y-auto pe-1">
          {groups.map((group) => (
            <fieldset key={group.group} className="space-y-2">
              <legend className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.group}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {group.fields.map((field) => (
                  <label
                    key={field.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card/40 p-2 text-xs"
                  >
                    <Checkbox
                      checked={items.includes(field.id)}
                      onCheckedChange={() => toggle(field.id)}
                      disabled={loading}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <label className="mb-1 block text-xs font-bold" htmlFor="reverify-reason">
          {t('kycReview.reverifyReason')} <span className="text-destructive">*</span>
        </label>
        <textarea
          id="reverify-reason"
          className="reject-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={loading}
          placeholder={t('kycReview.reverifyReasonPlaceholder')}
        />

        <p className="my-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          {t('kycReview.reverifyMoneyPause')}
        </p>

        {error && (
          <p className="mb-3 text-xs font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="modal-btns">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-reject-confirm"
            disabled={!canConfirm}
            onClick={() => void onConfirm({ reason: reason.trim(), items })}
          >
            {loading ? t('common.saving') : t('kycReview.reverifyConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
