'use client';

import * as React from 'react';
import type { IbLevel } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

export interface IbLevelFormValues {
  /**
   * ABSENT on create, so the API appends below the deepest rung.
   *
   * Present on edit, where it is the primary key `ib_accounts.level` references
   * — the form does not offer to change it, it carries the one it was opened
   * with.
   */
  level?: number;
  name: string;
  rateValue: string;
  enabled: boolean;
}

/**
 * Add a rung to the payout ladder, or edit one.
 *
 * ## Two fields, because two things decide what a partner is paid
 *
 * What the rung is CALLED and what share it TAKES. The form used to ask for
 * five, and the other three each answered a question the operator did not have:
 *
 *  - LEVEL NUMBER. A rung's number is its position in a ladder read top-down,
 *    and the form demanded one before the thing had a name. Appending below the
 *    deepest rung is what "add a level" meant every time.
 *  - PAYOUT MODEL. Commission is cut from what the broker earned on a CLOSED
 *    position, which is a share of revenue by definition — so one option was
 *    correct and the other silently reinterpreted the rate beside it.
 *  - MAX DIRECT PARTNERS. A recruiting cap, defaulted to unlimited and left
 *    there.
 *
 * None were deleted from the API. `level` still fills a gap left by a delete,
 * `per_lot` is still honoured for a level already on it, and the cap is still
 * enforced where one is set — they are simply no longer questions this screen
 * asks.
 *
 * ## The level number is still not editable
 *
 * It is the primary key and partner records reference it, so renumbering is a
 * data migration across the partner table rather than an edit. The form says
 * where the rung sits instead of offering to move it.
 *
 * ## The rate is always a percentage
 *
 * With the model gone, `70` can only mean 70% of the broker's revenue. The
 * suffix is fixed rather than following a selector, so the number is still never
 * displayed without its unit.
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

  const [name, setName] = React.useState(level?.name ?? '');
  const [rateValue, setRateValue] = React.useState(level?.rateValue ?? '0.0000');
  const [enabled, setEnabled] = React.useState(level?.enabled ?? true);

  /*
   * ── Three fields are GONE, and each for its own reason ─────────────────────
   *
   * LEVEL NUMBER. A rung's number is its POSITION in a ladder read top-down,
   * not something an operator has an opinion about — and the form asked for one
   * before they had named the thing. Omitting it makes the API append below the
   * deepest rung, which is what "add a level" meant every time. It stays in the
   * contract for the one case the form cannot express: refilling a gap left by
   * a delete.
   *
   * PAYOUT MODEL. A partner's commission is cut from what the broker earned on a
   * CLOSED position, which is a share of revenue by definition — so the choice
   * offered exactly one right answer and one that silently reinterprets the
   * rate beside it ("70" meaning $70 per lot rather than 70%). `per_lot` is
   * still honoured by the engine for any level already on it; it is unreachable
   * from here, not deleted.
   *
   * MAX DIRECT PARTNERS. A recruiting cap the ladder does not otherwise express,
   * defaulted to unlimited and left there. The API still enforces one if a level
   * carries it.
   *
   * What remains is the pair that decides what a partner is paid: what the rung
   * is called, and what share it takes. `enabled` stays with them — it is not a
   * property of the payout, it is the switch that stops a rung earning and
   * stops new partners being placed on it, and there is no other control for
   * that anywhere in the console.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      // Omitted on create so the API appends; preserved on edit, where the level
      // is the primary key and the route already names it.
      ...(level ? { level: level.level } : {}),
      name: name.trim(),
      // Sent as a STRING, never parsed to a number: it multiplies money, and a
      // round trip through a float is exactly what §6.1 forbids.
      rateValue: rateValue.trim(),
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
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Master Partner"
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
          />
          {/* Where this rung lands, said rather than asked. On create the API
              appends below the deepest level; on edit the number is the primary
              key and `ib_accounts.level` references it, so it cannot move. */}
          <span className="block text-[11px] text-muted-foreground">
            {editing ? t('ibLevels.levelLocked') : t('ibLevels.levelAppended')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.rate')}</span>
          <div className="relative">
            <input
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              required
              inputMode="decimal"
              pattern="\d{1,8}(\.\d{1,4})?"
              className="flex h-10 w-full rounded-lg border border-input bg-card pl-3 pr-10 text-xs tabular focus-outline"
            />
            {/* Always a percentage now: the payout model is no longer a choice,
                so "70" can only mean 70% of what the broker earned. */}
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
              %
            </span>
          </div>
          <span className="block text-[11px] text-muted-foreground">
            {t('ibLevels.rateHintPercent')}
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
