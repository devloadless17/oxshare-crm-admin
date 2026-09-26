'use client';

import type { RefObject } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RejectionReason } from '@/lib/api/admin';
import type { ReviewFieldGroup as FieldGroup } from './review-sections';
import { t } from '@/lib/i18n';

/**
 * Rejection dialog: a configured reason (FR-ADM-03), an optional free-text note,
 * and the set of fields the client must re-submit.
 *
 * `canConfirm` is computed by the page and gates the confirm button — a rejection
 * with no recorded reason is not reviewable later and leaves the client nothing to
 * act on. src/app/kyc/[userId]/page.test.tsx pins that.
 */
export function RejectDialog({
  panelRef,
  reasons,
  selectedReasonId,
  note,
  selectedFields,
  fieldGroups,
  canConfirm,
  loading,
  error,
  onReasonChange,
  onNoteChange,
  onToggleField,
  onCancel,
  onConfirm,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  reasons: RejectionReason[];
  selectedReasonId: string;
  note: string;
  selectedFields: string[];
  /** Derived from the live KYC step config — see field-options.ts. */
  fieldGroups: FieldGroup[];
  canConfirm: boolean;
  loading: boolean;
  error: string;
  onReasonChange: (id: string) => void;
  onNoteChange: (note: string) => void;
  onToggleField: (fieldId: string) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      className="modal-overlay"
      onClick={() => {
        // Don't discard a typed reason on a stray backdrop click
        if (!loading && !note.trim()) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reject-modal-title">{t('kyc.rejectTitle')}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t('kyc.rejectBody')}</p>

        {reasons.length > 0 && (
          <div className="space-y-1.5 mb-4">
            <label className="text-xs font-bold text-foreground">
              {t('kyc.rejectionReason')} <span className="text-destructive">*</span>
            </label>
            <Select value={selectedReasonId} onValueChange={(val) => onReasonChange(val)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={t('withdrawals.selectReason')} />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-4 max-h-[50vh] overflow-y-auto pe-1 mb-4">
          {fieldGroups.map((grp) => (
            <div key={grp.group} className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-destructive block">
                {grp.group}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {grp.fields.map((f) => {
                  const isChecked = selectedFields.includes(f.id);
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all ${
                        isChecked
                          ? 'border-destructive bg-destructive/10 text-destructive font-semibold'
                          : 'border-border bg-card/40 text-muted-foreground hover:border-border/80'
                      }`}
                    >
                      <Checkbox
                        id={`reject-field-${f.id}`}
                        checked={isChecked}
                        onCheckedChange={() => onToggleField(f.id)}
                        className="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground"
                      />
                      <label htmlFor={`reject-field-${f.id}`} className="flex-1 cursor-pointer">
                        {f.label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">
            {reasons.length > 0 ? (
              'Additional Note (optional)'
            ) : (
              <>
                {t('kyc.rejectionReason')} <span className="text-destructive">*</span>
              </>
            )}
          </label>
          <textarea
            className="reject-textarea"
            placeholder={t('kyc.rejectPlaceholder')}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus={reasons.length === 0}
            aria-required={reasons.length === 0}
          />
        </div>

        {error && (
          <p className="mt-3 text-xs font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="modal-btns">
          <button className="btn-cancel" onClick={() => onCancel()} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-reject-confirm"
            onClick={() => void onConfirm()}
            disabled={!canConfirm || loading}
            aria-busy={loading}
          >
            {loading ? 'Rejecting...' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}
