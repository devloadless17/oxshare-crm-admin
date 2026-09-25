'use client';

import * as React from 'react';
import { Spinner } from '@/components/ui/loader';
import type { IbCommissionType } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

export interface CommissionTypeFormValues {
  name: string;
  description: string | null;
  /**
   * Decimal STRINGS, and they stay strings all the way to the column.
   *
   * `NUMERIC(28,8)` on the backend. A JSON number would round-trip through a
   * float somewhere between this input and the database, and a "7.5" that
   * arrives as 7.4999999999 is the kind of wrong that survives review because
   * it looks almost right. Same rule as every other amount in this console.
   */
  commissionPerLot: string;
  rebatePerLot: string;
  enabled: boolean;
  sortOrder: number;
}

/**
 * Add a commission type, or edit one that exists.
 *
 * ## Two amounts, and the hint says whose each one is
 *
 * "Commission" and "rebate" are both money per lot and both leave the broker,
 * but they go to different people: the first is the pool the partners above
 * the client share, the second is what returns to the client. An operator who
 * typed the client's figure into the partners' box would re-price every
 * product on this type, so each field says who it pays rather than just what
 * it is called.
 */
export function CommissionTypeFormModal({
  open,
  type,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Absent means create. */
  type?: IbCommissionType;
  saving: boolean;
  error: unknown;
  onSubmit: (values: CommissionTypeFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={type ? t('commissionTypes.editTitle') : t('commissionTypes.createTitle')}
    >
      {/* Keyed, so opening on a different type remounts the form with that
          type's values — see the note in product-form-modal.tsx. */}
      <CommissionTypeForm
        key={type?.id ?? 'new'}
        type={type}
        saving={saving}
        error={error}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}

function CommissionTypeForm({
  type,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  type?: IbCommissionType;
  saving: boolean;
  error: unknown;
  onSubmit: (values: CommissionTypeFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(type?.name ?? '');
  const [description, setDescription] = React.useState(type?.description ?? '');
  /*
   * Seeded from the stored STRINGS, never from a number. `String(x)` on a
   * parsed value would already have lost the trailing zeros the column keeps,
   * so an operator opening the form would see a different number from the one
   * they saved.
   */
  const [commissionPerLot, setCommissionPerLot] = React.useState(type?.commissionPerLot ?? '');
  const [rebatePerLot, setRebatePerLot] = React.useState(type?.rebatePerLot ?? '0');
  /*
   * NOT a field, and never reset by this form.
   *
   * A new type is ACTIVE — nobody creates a rate card they do not intend to
   * sell on — and deactivating one is a decision made from the table, where
   * the row action says which way it is going. An editing form carries the
   * stored value through untouched, so opening an inactive type to fix a typo
   * cannot silently put it back into service.
   */
  const enabled = type?.enabled ?? true;
  const sortOrder = type?.sortOrder ?? 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      commissionPerLot: commissionPerLot.trim() === '' ? '0' : commissionPerLot.trim(),
      rebatePerLot: rebatePerLot.trim() === '' ? '0' : rebatePerLot.trim(),
      enabled,
      sortOrder,
    });
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('commissionTypes.name')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          placeholder={t('commissionTypes.namePlaceholder')}
          className={INPUT_CLASS}
        />
      </label>

      <AmountField
        label={t('commissionTypes.commission')}
        hint={t('commissionTypes.commissionHint')}
        value={commissionPerLot}
        onChange={setCommissionPerLot}
      />

      <AmountField
        label={t('commissionTypes.rebate')}
        hint={t('commissionTypes.rebateHint')}
        value={rebatePerLot}
        onChange={setRebatePerLot}
      />

      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('commissionTypes.description')}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t('commissionTypes.descriptionPlaceholder')}
          className={`${INPUT_CLASS} h-auto py-2 leading-relaxed`}
        />
      </label>

      {error !== null && error !== undefined && (
        <p role="alert" className="text-xs leading-relaxed text-destructive sm:col-span-2">
          {apiErrorMessage(error, t('commissionTypes.saveFailed'))}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3 sm:col-span-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted focus-outline"
        >
          {t('commissionTypes.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          {saving && <Spinner />}
          {saving ? t('commissionTypes.saving') : t('commissionTypes.save')}
        </button>
      </div>
    </form>
  );
}

/**
 * One amount per lot.
 *
 * `type="text"` with `inputMode="decimal"`, deliberately. A number input hands
 * back a NUMBER, which is the one thing this value must never become between
 * the form and a NUMERIC(28,8) column — and it lets a browser's spinner round a
 * value nobody touched. The API validates the shape and refuses anything else.
 */
function AmountField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-semibold">{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          pattern="\d{1,8}(\.\d{1,8})?"
          placeholder="0"
          aria-label={label}
          className={`${INPUT_CLASS} pr-12 tabular`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
          {t('commissionTypes.unitPerLot')}
        </span>
      </div>
      <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
    </label>
  );
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
