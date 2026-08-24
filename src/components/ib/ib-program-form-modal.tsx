'use client';

import * as React from 'react';
import Decimal from 'decimal.js';
import type { IbProgram, IbProgramMode } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

export interface IbProgramFormValues {
  name: string;
  mode: IbProgramMode;
  level1Rate: string;
  level2Rate: string;
  rebateRate: string;
  enabled: boolean;
}

const MODES: IbProgramMode[] = ['commission_only', 'rebate_only', 'hybrid'];

/**
 * Create or edit a commission programme — the terms a partner is paid on.
 *
 * ## The two rates are per DEPTH, and the labels have to say so
 *
 * "Level 1" and "level 2" as bare words read as the RUNG a partner stands on,
 * which is a different fact and the one an operator would misprice on. So the
 * fields are labelled by whose client traded: your partner's own clients, or
 * their sub-partners'.
 *
 * ## The running total is shown, even though the API enforces it
 *
 * Every leg is a share of the SAME revenue, so they add — a refusal after the
 * fact tells an operator they were wrong, while a total tells them before they
 * try. The API stays the authority and its message names the numbers; this is
 * the part that stops the message being needed.
 *
 * Summed with decimal.js rather than `Number`: an ordinary 27.6 / 39.4286 /
 * 32.9714 split totals 100.00000000000001 as floats, which is exactly the bug
 * that painted a correct ladder red on the levels screen.
 *
 * ## The mode decides which fields matter, and hides the rest
 *
 * A rebate box on a commission-only programme is a number an operator can fill
 * in and watch do nothing. Hidden rather than disabled, because a disabled
 * field still reads as part of the terms.
 */
export function IbProgramFormModal({
  open,
  program,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing; absent when creating. */
  program?: IbProgram;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: IbProgramFormValues) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={program ? t('ibPrograms.editTitle') : t('ibPrograms.createTitle')}
    >
      {/* KEYED, so opening on a different programme REMOUNTS the form with that
          programme's numbers. Re-seeding state in an effect renders once with
          the PREVIOUS programme's rates before correcting itself, and on a
          payout screen that intermediate state is one somebody could read and
          act on. Same pattern as `IbLevelFormModal`. */}
      <IbProgramForm
        key={`${program?.id ?? 'new'}-${String(open)}`}
        program={program}
        saving={saving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function IbProgramForm({
  program,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  program?: IbProgram;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: IbProgramFormValues) => void;
}) {
  const [name, setName] = React.useState(program?.name ?? '');
  const [mode, setMode] = React.useState<IbProgramMode>(program?.mode ?? 'commission_only');
  const [level1Rate, setLevel1Rate] = React.useState(program?.level1Rate ?? '0.0000');
  const [level2Rate, setLevel2Rate] = React.useState(program?.level2Rate ?? '0.0000');
  const [rebateRate, setRebateRate] = React.useState(program?.rebateRate ?? '0.0000');
  const [enabled, setEnabled] = React.useState(program?.enabled ?? true);

  const paysCommission = mode !== 'rebate_only';
  const paysRebate = mode !== 'commission_only';

  /*
   * ── EVERY rate counts, including the ones this mode does not pay ──────────
   *
   * This used to sum only the legs the current mode pays, which read as the
   * more informative answer and was the wrong one: the API's `assertShareFits`
   * and the database CHECK both add all three unconditionally. So a
   * commission-only programme carrying a stored 40% rebate showed "85% kept"
   * and was then refused for paying out 105% — the form disagreeing with the
   * server about the only number on the screen.
   *
   * A hidden field's value is still SENT and still stored, so an operator who
   * switches modes later finds the number they typed. That is exactly why it
   * has to be counted: it is a rate this programme carries, one mode change
   * away from being paid.
   */
  const total = React.useMemo(() => {
    const decimal = (value: string) => {
      try {
        return new Decimal(value.trim() === '' ? 0 : value);
      } catch {
        // Mid-typing, "12." is not a number yet. Treating it as zero keeps the
        // total from flashing an error at somebody who has not finished.
        return new Decimal(0);
      }
    };

    return decimal(level1Rate).plus(decimal(level2Rate)).plus(decimal(rebateRate));
  }, [level1Rate, level2Rate, rebateRate]);

  const overAllocated = total.greaterThan(100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      mode,
      // STRINGS, never parsed to numbers: they multiply money, and a round trip
      // through a float is exactly what §6.1 forbids.
      level1Rate: level1Rate.trim(),
      level2Rate: level2Rate.trim(),
      rebateRate: rebateRate.trim(),
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
          <span className="text-xs font-semibold text-foreground">{t('ibPrograms.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Gold"
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('ibPrograms.nameHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('ibPrograms.mode')}</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as IbProgramMode)}
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
          >
            {MODES.map((value) => (
              <option key={value} value={value}>
                {t(`ibPrograms.mode_${value}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
          <span className="block text-[11px] text-muted-foreground">
            {t(`ibPrograms.modeHint_${mode}` as Parameters<typeof t>[0])}
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {paysCommission && (
          <>
            <RateField
              id="ib-program-level1"
              label={t('ibPrograms.level1')}
              hint={t('ibPrograms.level1Hint')}
              value={level1Rate}
              onChange={setLevel1Rate}
            />
            <RateField
              id="ib-program-level2"
              label={t('ibPrograms.level2')}
              hint={t('ibPrograms.level2Hint')}
              value={level2Rate}
              onChange={setLevel2Rate}
            />
          </>
        )}
        {paysRebate && (
          <RateField
            id="ib-program-rebate"
            label={t('ibPrograms.rebate')}
            hint={t('ibPrograms.rebateHint')}
            value={rebateRate}
            onChange={setRebateRate}
          />
        )}
      </div>

      {/*
        The running total, and the broker's own share beside it. An operator
        setting terms is deciding what the house keeps, and that number is
        nowhere on the screen unless it is put there.
      */}
      <div
        className={`rounded-lg border p-3 text-xs ${
          overAllocated
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/20 text-muted-foreground'
        }`}
      >
        {overAllocated
          ? t('ibPrograms.overAllocated', { total: total.toString() })
          : t('ibPrograms.allocated', {
              total: total.toString(),
              broker: new Decimal(100).minus(total).toString(),
            })}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
        <Checkbox
          id="ib-program-enabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked === true)}
          className="mt-0.5"
        />
        <label htmlFor="ib-program-enabled" className="cursor-pointer space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            {t('ibPrograms.enabled')}
          </span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('ibPrograms.enabledHint')}
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
          /*
           * NOT disabled on `overAllocated`. The API is the authority and its
           * refusal names the numbers; a button that silently will not press is
           * a worse explanation than a sentence. The banner above already says
           * what is wrong.
           */
          disabled={saving}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('ibPrograms.saving') : t('ibPrograms.save')}
        </button>
      </div>
    </form>
  );
}

function RateField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5" htmlFor={id}>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          inputMode="decimal"
          pattern="\d{1,8}(\.\d{1,4})?"
          className="flex h-10 w-full rounded-lg border border-input bg-card pl-3 pr-10 text-xs tabular focus-outline"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
          %
        </span>
      </div>
      <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
    </label>
  );
}
