'use client';

import * as React from 'react';
import type { IbLevel } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface IbLevelFormValues {
  level: number;
  name: string;
  payoutModel: 'revenue_share' | 'per_lot';
  rateValue: string;
  maxDirectPartners: number | null;
  enabled: boolean;
}

/**
 * Add a rung to the payout ladder, or edit one.
 *
 * ## The level number is not editable once it exists
 *
 * It is the primary key and partner records reference it, so renumbering is a
 * data migration across the partner table rather than an edit. Shown read-only
 * on edit rather than hidden: hiding it leaves the operator wondering which row
 * they are changing, while a disabled field says "this one, and it is fixed".
 *
 * ## The rate's UNIT changes with the model
 *
 * `70` means 70% under revenue share and $70 per lot under per-lot, which is a
 * genuinely dangerous ambiguity on a payout screen. The suffix beside the input
 * and the hint beneath it both follow the selected model, so the number is
 * never displayed without its unit.
 */
export function IbLevelFormModal({
  open,
  level,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing; absent when creating. */
  level?: IbLevel;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: IbLevelFormValues) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={level ? t('ibLevels.editTitle') : t('ibLevels.createTitle')}
    >
      {/*
        KEYED, so opening the modal on a different level REMOUNTS the form and
        its state starts from that level's values. A `useEffect` re-seeding six
        useStates is what `react-hooks/set-state-in-effect` exists to catch: it
        renders once with the PREVIOUS level's numbers before correcting itself,
        and on a payout screen that intermediate state is one somebody could
        read and act on. Same pattern as `CurrencyFormModal` and `TagFormModal`.
      */}
      <IbLevelForm
        key={`${level?.level ?? 'new'}-${String(open)}`}
        level={level}
        saving={saving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function IbLevelForm({
  level,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  level?: IbLevel;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: IbLevelFormValues) => void;
}) {
  const editing = Boolean(level);

  const [levelNumber, setLevelNumber] = React.useState(level?.level ?? 1);
  const [name, setName] = React.useState(level?.name ?? '');
  const [payoutModel, setPayoutModel] = React.useState<'revenue_share' | 'per_lot'>(
    level?.payoutModel ?? 'revenue_share',
  );
  const [rateValue, setRateValue] = React.useState(level?.rateValue ?? '0.0000');
  // An empty string is "unlimited", which is what null means on the wire. A
  // number input cannot hold null, and 0 would be a real limit meaning nobody.
  const [maxDirect, setMaxDirect] = React.useState(
    level?.maxDirectPartners === null || level?.maxDirectPartners === undefined
      ? ''
      : String(level.maxDirectPartners),
  );
  const [enabled, setEnabled] = React.useState(level?.enabled ?? true);

  const isPercentage = payoutModel === 'revenue_share';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      level: levelNumber,
      name: name.trim(),
      payoutModel,
      // Sent as a STRING, never parsed to a number: it multiplies money, and a
      // round trip through a float is exactly what §6.1 forbids.
      rateValue: rateValue.trim(),
      maxDirectPartners: maxDirect.trim() === '' ? null : Number(maxDirect),
      enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.level')}</span>
          <input
            type="number"
            min={1}
            max={10}
            value={levelNumber}
            onChange={(e) => setLevelNumber(Number(e.target.value))}
            readOnly={editing}
            required
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs read-only:cursor-not-allowed read-only:opacity-60 focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {editing ? t('ibLevels.levelLocked') : t('ibLevels.levelHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Master Partner"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('ibLevels.payoutModel')}</span>
        <Select
          value={payoutModel}
          onValueChange={(value) => setPayoutModel(value as 'revenue_share' | 'per_lot')}
        >
          <SelectTrigger className="h-10 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue_share" className="text-xs">
              {t('ibLevels.modelRevenueShare')}
            </SelectItem>
            <SelectItem value="per_lot" className="text-xs">
              {t('ibLevels.modelPerLot')}
            </SelectItem>
          </SelectContent>
        </Select>
        <span className="block text-[11px] text-muted-foreground">
          {isPercentage ? t('ibLevels.modelRevenueShareHint') : t('ibLevels.modelPerLotHint')}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.rate')}</span>
          <div className="relative">
            <input
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              required
              inputMode="decimal"
              pattern="\d{1,8}(\.\d{1,4})?"
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-3 pr-10 text-xs tabular focus-outline"
            />
            {/* The unit, always beside the number. "70" alone means 70% under
                one model and $70 under the other. */}
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
              {isPercentage ? '%' : t('ibLevels.perLotSuffix')}
            </span>
          </div>
          <span className="block text-[11px] text-muted-foreground">
            {isPercentage ? t('ibLevels.rateHintPercent') : t('ibLevels.rateHintPerLot')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.maxDirect')}</span>
          <input
            type="number"
            min={1}
            value={maxDirect}
            onChange={(e) => setMaxDirect(e.target.value)}
            placeholder={t('ibLevels.unlimited')}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('ibLevels.maxDirectHint')}
          </span>
        </label>
      </div>

      {/*
        A `<div>` paired by `htmlFor`, NOT a wrapping `<label>`.

        Radix renders a `<button role="checkbox">`, and a button's accessible
        name comes from its CONTENT before its wrapper — the content here is a
        decorative tick, so wrapping would leave the control announcing as
        nothing while still toggling on click. `components/ui/checkbox.tsx`
        spells out all three ways this differs from a native input.
      */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
        <Checkbox
          id="ib-level-enabled"
          checked={enabled}
          // `boolean | 'indeterminate'` off Radix, and this state is a plain
          // boolean — `=== true` is the coercion, not a redundant comparison.
          onCheckedChange={(checked) => setEnabled(checked === true)}
          className="mt-0.5"
        />
        <label htmlFor="ib-level-enabled" className="cursor-pointer space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            {t('ibLevels.enabled')}
          </span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('ibLevels.enabledHint')}
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('ibLevels.saving') : t('ibLevels.save')}
        </button>
      </div>
    </form>
  );
}
