'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

export interface LeverageFormValues {
  ratio: number;
  label: string;
  enabled: boolean;
  sortOrder: number;
}

const INPUT_CLASS =
  'focus-outline h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50';

/**
 * Add a rung, or edit one.
 *
 * ## The RATIO is fixed once created
 *
 * It is the primary key and the identity of the rung — accounts opened at 500:1
 * carry that number, and renumbering the row would leave them pointing at a
 * leverage the ladder no longer explains. So the field is disabled when
 * editing, rather than absent: an operator looking at this form needs to see
 * WHICH rung they are editing, and a form that silently drops the identifying
 * value is one you can save against the wrong row.
 *
 * ## Numbers are parsed, never `Number(x) || fallback`
 *
 * That idiom turns a mid-edit blank into a saved 0 — and 0:1 is not leverage,
 * it is a rung the API would reject after the operator had already left the
 * form. The state is a STRING while typing and parsed once on submit, which is
 * the same shape `trading-settings-panel.tsx` uses and for the same reason.
 */
export function LeverageFormModal({
  open,
  editing,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Null when adding. The ratio is fixed for an existing rung. */
  editing: LeverageFormValues | null;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: LeverageFormValues) => void;
}) {
  /*
   * SEEDED AT MOUNT, not reset in an effect.
   *
   * The obvious version syncs the fields with `useEffect` when `editing`
   * changes — which is a `setState` inside an effect, so React renders the
   * stale form first and corrects it on a second pass. This project's lint
   * rules refuse it, and rightly: the operator sees the previous rung's values
   * for a frame.
   *
   * The caller keys this component on the subject instead, so switching rows
   * unmounts and remounts it and these initialisers run afresh. That is React's
   * own answer to "reset all state when a prop changes".
   */
  const [ratio, setRatio] = React.useState(editing ? String(editing.ratio) : '');
  const [label, setLabel] = React.useState(editing?.label ?? '');
  const [enabled, setEnabled] = React.useState(editing?.enabled ?? true);
  const [sortOrder, setSortOrder] = React.useState(editing ? String(editing.sortOrder) : '');

  const parsedRatio = Number.parseInt(ratio.trim(), 10);
  const parsedSort = Number.parseInt(sortOrder.trim(), 10);

  /*
   * Mirrors `LeveragesService.assertRatio` so the operator is told before the
   * round trip — the API is still the authority and refuses independently.
   */
  const ratioValid = Number.isInteger(parsedRatio) && parsedRatio > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('leverages.editTitle') : t('leverages.addTitle')}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ratioValid) return;
          onSubmit({
            ratio: parsedRatio,
            label: label.trim(),
            enabled,
            // Blank means "leave it where it is" when editing, and "append"
            // when adding — the API does the appending.
            sortOrder: Number.isInteger(parsedSort) ? parsedSort : (editing?.sortOrder ?? 0),
          });
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="leverage-ratio" className="text-xs font-semibold">
            {t('leverages.fieldRatio')}
          </label>
          <input
            id="leverage-ratio"
            type="number"
            min={1}
            step={1}
            value={ratio}
            onChange={(e) => setRatio(e.target.value)}
            /* Fixed once created — see the header. */
            disabled={editing !== null || saving}
            required
            placeholder="500"
            className={`${INPUT_CLASS} font-mono`}
          />
          <p className="text-[11px] text-muted-foreground">
            {editing ? t('leverages.fieldRatioFixed') : t('leverages.fieldRatioHint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="leverage-label" className="text-xs font-semibold">
            {t('leverages.fieldLabel')}
          </label>
          <input
            id="leverage-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={saving}
            maxLength={40}
            placeholder={ratioValid ? `1:${parsedRatio}` : '1:500'}
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-muted-foreground">{t('leverages.fieldLabelHint')}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="leverage-sort" className="text-xs font-semibold">
            {t('leverages.fieldSortOrder')}
          </label>
          <input
            id="leverage-sort"
            type="number"
            step={1}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={saving}
            placeholder={t('leverages.fieldSortOrderPlaceholder')}
            className={`${INPUT_CLASS} font-mono`}
          />
          <p className="text-[11px] text-muted-foreground">{t('leverages.fieldSortOrderHint')}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={saving}
            className="h-3.5 w-3.5"
          />
          <span className="text-sm">{t('leverages.fieldEnabled')}</span>
        </label>
        <p className="-mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('leverages.fieldEnabledHint')}
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="focus-outline inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || !ratioValid}
            className="focus-outline inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('leverages.saving') : t('leverages.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
