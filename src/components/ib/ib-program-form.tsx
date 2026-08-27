'use client';

import * as React from 'react';
import Decimal from 'decimal.js';
import { Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type {
  IbProgram,
  IbProgramLimits,
  IbProgramMode,
  IbProgramTier,
  RevenueBasis,
} from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { t } from '@/lib/i18n';

/**
 * The ceiling to assume while the real one is still loading.
 *
 * ONE, not ten, and the direction is deliberate. Guessing HIGH would let an
 * operator add levels for a moment and then have them refused when the answer
 * arrives; guessing LOW only disables a button for the length of one request.
 * A control that appears and then withdraws is worse than one that arrives.
 *
 * The real ceiling is `IB_MAX_LEVELS` — a deployment setting, default 2 — read
 * from `GET /admin/ib-programs/limits`. Hardcoding it here would drift the day
 * a broker negotiates a third level.
 */
const ASSUMED_MAX_TIERS = 1;

/**
 * An order the API will take, or `undefined` for "append".
 *
 * `Number(value) || 0` is deliberately not used. It is the idiom that turns a
 * typo into a silent 0 — and 0 is the LOWEST order, so on this particular form
 * it would quietly make the programme the default that every newly approved
 * partner is paid on. A blank box means append; so does anything that is not a
 * whole number in range, rather than being guessed at.
 */
function parseSortOrder(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) return undefined;
  return parsed;
}

export interface IbProgramFormValues {
  name: string;
  mode: IbProgramMode;
  /**
   * The ladder, depth 1 first — FR-IB-06's "tier ladder".
   *
   * Replaced a fixed `level1Rate` / `level2Rate` pair, which put a two-level
   * ceiling in the form itself. The LENGTH of this array is how far the
   * programme's earnings reach, so adding a row is how a broker extends a
   * programme to a third level.
   *
   * Sent whole on every save: the API treats `tiers` as replace-all, because
   * "the ladder is now just level 1" has to be expressible and a merge cannot
   * say it.
   */
  tiers: IbProgramTier[];
  rebateRate: string;
  /*
   * NO `enabled` HERE. It is a row action with a confirmation, not a field —
   * see the component's own note. A create POSTs without it and the API
   * defaults to true, which is the only sensible state for a programme
   * somebody just took the trouble to define.
   */
  /**
   * WHICH revenue this programme's rates are a percentage of — FR-IB-16.
   *
   * The base is half of what a partner agreed to: "30% of the spread markup"
   * and "30% of commission and swap" are different contracts. It sits on the
   * programme rather than on a platform switch so that changing one broker's
   * terms does not re-price every partner at once.
   */
  revenueBasis: RevenueBasis;
  /**
   * Where this programme sits in the order — and therefore whether a NEWLY
   * approved partner lands on it.
   *
   * `IbStore.defaultProgramId()` takes the ENABLED programme with the lowest
   * order, ties broken by name. The API has always accepted this; the form had
   * no control, so the order was assigned as max+1 at creation and could never
   * be changed. An operator could build Gold, Silver and Platinum with no way
   * to say which one new partners start on.
   *
   * Optional, and absent means APPEND — which is what the API already does for
   * a create, and the right behaviour for "I am adding a programme, not
   * reordering the ladder".
   */
  sortOrder?: number;
}

const MODES: IbProgramMode[] = ['commission_only', 'rebate_only', 'hybrid'];

/*
 * The bases a programme may price on, in the order they are offered.
 *
 * `commission_swap` FIRST and selected by default, and that ordering is a
 * safety rule rather than a preference: it is what every deployment computes
 * on, and the other two multiply a product's spread markup — which is 0 until
 * somebody populates it. A programme quietly saved on `spread` against unset
 * markups pays NOTHING on every deal it touches, permanently, because a
 * zero-revenue deal is marked done rather than retried.
 */
const REVENUE_BASES: RevenueBasis[] = ['commission_swap', 'spread', 'commission_swap_spread'];

/** What a brand-new commission programme starts as: one level, paying nothing yet. */
const STARTER_TIERS: IbProgramTier[] = [{ depth: 1, rate: '0.0000' }];

/**
 * Create or edit a commission programme — the terms a partner is paid on.
 *
 * ## The ladder is a LIST, and its length is the feature
 *
 * This form used to have two rate boxes, "level 1" and "level 2", which was the
 * two-level cap rendered as a layout. FR-IB-17 makes reach a commercial
 * decision — "the exact per-level split is configured per the agreed program
 * ladder" — so levels are ADDED and REMOVED here, and the count is stated in
 * words beneath them. An operator who wants three levels adds a row.
 *
 * ## The rates are per DEPTH, and the labels have to say so
 *
 * "Level 1" as a bare phrase reads as the RUNG a partner stands on, which is a
 * different fact and the one an operator would misprice on. So each row is
 * labelled by WHOSE CLIENT TRADED: their own clients, a sub-partner's, and so
 * on down.
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
/**
 * The programme editor — A PAGE, not a modal.
 *
 * ## Why it stopped being a modal
 *
 * A programme is a rate card: a name, a mode, the revenue it is priced on, a
 * ladder of any length, a client rebate and an order. The ladder alone grows a
 * row per level, so the tallest thing on the screen is the part an operator is
 * actually reasoning about — and a modal answers that by scrolling INSIDE
 * itself, which hides the running total and the save button at the same time.
 *
 * The full width matters for the same reason: the ladder reads as "depth 1
 * pays X, depth 2 pays Y", and a 28rem column turns each rung into two wrapped
 * lines. `roles/` made this move first; this follows it.
 *
 * ## `enabled` IS NOT ON THIS FORM
 *
 * It was a checkbox here and is a row action with a confirmation now. Editing a
 * rate and switching a programme OFF are not the same kind of act: the first
 * takes effect on the next trade, the second stops the programme paying
 * anybody and refuses new partners immediately. Bundled behind one Save button
 * they were one click, and the destructive half was silent.
 */
export function IbProgramForm({
  program,
  saving,
  error,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  /** Present when editing; absent when creating. */
  program?: IbProgram;
  saving: boolean;
  error?: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: IbProgramFormValues) => void;
}) {
  const [name, setName] = React.useState(program?.name ?? '');
  const [mode, setMode] = React.useState<IbProgramMode>(program?.mode ?? 'commission_only');
  /*
   * An EXISTING programme's ladder, or one starter level when creating.
   *
   * A `rebate_only` programme legitimately has none, and an empty array is
   * carried through as an empty array — the API refuses tiers on that mode, so
   * inventing a starter row for one would be a field the operator cannot save.
   */
  const [tiers, setTiers] = React.useState<IbProgramTier[]>(
    program ? program.tiers : STARTER_TIERS,
  );
  const [rebateRate, setRebateRate] = React.useState(program?.rebateRate ?? '0.0000');
  /*
   * Blank while creating, so the API appends. Seeded with the stored value when
   * editing, because that is the number the operator is deciding about — and
   * because re-sending it unchanged is what stops an unrelated edit, like
   * fixing a name, from moving the programme.
   */
  const [sortOrder, setSortOrder] = React.useState(
    program === undefined ? '' : String(program.sortOrder),
  );

  const [revenueBasis, setRevenueBasis] = React.useState<RevenueBasis>(
    program?.revenueBasis ?? 'commission_swap',
  );

  /*
   * How deep this deployment lets a ladder go. Cached by react-query under its
   * own key, so opening the modal repeatedly costs one request in total.
   */
  const limits = useResource<IbProgramLimits>(['admin', 'ib-program-limits'], (signal) =>
    api.admin.getIbProgramLimits(signal),
  );
  const maxTiers = limits.data?.maxLevels ?? ASSUMED_MAX_TIERS;

  const paysCommission = mode !== 'rebate_only';
  const paysRebate = mode !== 'commission_only';

  /*
   * Depths are ALWAYS renumbered 1..n from position, never edited directly.
   *
   * The API refuses a ladder with a gap, because the row count is what decides
   * reach and 1-then-3 claims a reach it does not have. Deriving the depth from
   * the row's position means a gap is not a thing this form can produce —
   * removing level 2 of three renumbers the third to 2, which is the only
   * interpretation of "delete this level" that leaves a valid ladder.
   */
  const setRate = (index: number, rate: string) =>
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, rate } : tier)));

  const addTier = () =>
    setTiers((current) =>
      current.length >= maxTiers
        ? current
        : [...current, { depth: current.length + 1, rate: '0.0000' }],
    );

  const removeTier = (index: number) =>
    setTiers((current) =>
      current.filter((_, i) => i !== index).map((tier, i) => ({ ...tier, depth: i + 1 })),
    );

  /*
   * ── EVERY rate counts, including the ones this mode does not pay ──────────
   *
   * This used to sum only the legs the current mode pays, which read as the
   * more informative answer and was the wrong one: the API's `assertShareFits`
   * and the database trigger both add everything unconditionally. So a
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

    return tiers.reduce((sum, tier) => sum.plus(decimal(tier.rate)), decimal(rebateRate));
  }, [tiers, rebateRate]);

  const overAllocated = total.greaterThan(100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      mode,
      /*
       * STRINGS, never parsed to numbers: they multiply money, and a round trip
       * through a float is exactly what §6.1 forbids.
       *
       * A `rebate_only` programme sends NO tiers. The API refuses them on that
       * mode — `calculate` skips the commission legs outright, so a saved ladder
       * there is a rate card that never pays and the operator has no way to tell
       * it from one that does.
       */
      tiers: paysCommission
        ? tiers.map((tier, index) => ({ depth: index + 1, rate: tier.rate.trim() }))
        : [],
      rebateRate: rebateRate.trim(),
      revenueBasis,
      sortOrder: parseSortOrder(sortOrder),
    });
  };

  return (
    /* `w-full`, not a modal's fixed column: the ladder reads as a row per rung
       and a narrow measure wraps each one onto two lines. */
    <form onSubmit={handleSubmit} className="w-full space-y-4">
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
            /*
             * NAMED explicitly, on both selects here.
             *
             * These are wrapping `<label>`s, so the accessible name is the
             * label's whole text content — the title AND the hint paragraph
             * under it. That makes the name long, unstable against copy edits,
             * and nearly unusable from a screen reader's control list. The
             * `aria-label` is exactly the visible title, so it disagrees with
             * nothing on screen.
             */
            aria-label={t('ibPrograms.mode')}
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

      {/*
        FR-IB-16 — which revenue this programme's rates are a percentage OF.

        Full width beneath the pair above, because the warning matters more than
        the control: `spread` and `commission_swap_spread` price against a
        product's spread markup, and on a deployment where those are still 0 a
        programme saved on either pays NOTHING on every deal it touches. That is
        not recoverable — a zero-revenue deal is marked done rather than
        retried — so the consequence is spelled out on the screen rather than
        left to the operator to discover.
      */}
      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('ibPrograms.basis')}</span>
        <select
          aria-label={t('ibPrograms.basis')}
          value={revenueBasis}
          onChange={(e) => setRevenueBasis(e.target.value as RevenueBasis)}
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
        >
          {REVENUE_BASES.map((value) => (
            <option key={value} value={value}>
              {t(`ibPrograms.basis_${value}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <span className="block text-[11px] text-muted-foreground">
          {t(`ibPrograms.basisHint_${revenueBasis}` as Parameters<typeof t>[0])}
        </span>
        {revenueBasis !== 'commission_swap' && (
          <span
            role="note"
            className="block rounded-lg border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning-foreground"
          >
            {t('ibPrograms.basisSpreadWarning')}
          </span>
        )}
      </label>

      {paysCommission && (
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-foreground">
            {t('ibPrograms.ladder')}
          </legend>
          {/*
            The reach, in words, above the rows. A count of table rows is a
            thing an operator has to work out; "earnings reach 3 levels below
            this partner" is the decision they are actually making.
          */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tiers.length === 0
              ? t('ibPrograms.ladderEmpty')
              : t('ibPrograms.ladderReach', { count: String(tiers.length) })}
          </p>

          <div className="space-y-2">
            {tiers.map((tier, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1">
                  <RateField
                    id={`ib-program-tier-${index}`}
                    label={t('ibPrograms.tierLabel', { depth: String(index + 1) })}
                    hint={index === 0 ? t('ibPrograms.tierHintOwn') : t('ibPrograms.tierHintSub')}
                    value={tier.rate}
                    onChange={(value) => setRate(index, value)}
                  />
                </div>
                {/*
                  Only the DEEPEST level can be removed, and that is not a
                  limitation — removing a middle one renumbers everything below
                  it, so an operator deleting "level 2" of four silently
                  re-prices levels 3 and 4. Shortening from the bottom is the
                  only edit whose meaning is unambiguous.
                */}
                <button
                  type="button"
                  onClick={() => removeTier(index)}
                  disabled={index !== tiers.length - 1}
                  aria-label={t('ibPrograms.removeTier', { depth: String(index + 1) })}
                  title={
                    index === tiers.length - 1
                      ? t('ibPrograms.removeTier', { depth: String(index + 1) })
                      : t('ibPrograms.removeDeepestOnly')
                  }
                  className="mb-[22px] inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 focus-outline"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={addTier}
              disabled={tiers.length >= maxTiers}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-muted disabled:opacity-40 focus-outline"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t('ibPrograms.addTier')}
            </button>

            {/*
              WHY the button is dim, said next to it. A disabled control with no
              explanation reads as broken; this one is a deployment setting, and
              an operator who needs a third level needs to know that is the
              thing to change rather than filing a bug against the form.
            */}
            {tiers.length >= maxTiers && (
              <span className="text-[11px] text-muted-foreground">
                {t('ibPrograms.maxTiersReached', { max: String(maxTiers) })}
              </span>
            )}
          </div>
        </fieldset>
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

      <label className="space-y-1.5">
        <span className="block text-xs font-semibold">{t('ibPrograms.order')}</span>
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          min={0}
          max={1000}
          placeholder={t('ibPrograms.orderAppend')}
          className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {/*
          The hint IS the feature. An order field with no explanation reads as
          cosmetic list-sorting, and this one decides which terms every newly
          approved partner is paid on.
        */}
        <span className="block text-[11px] leading-relaxed text-muted-foreground">
          {t('ibPrograms.orderHint')}
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
          {saving ? t('ibPrograms.saving') : submitLabel}
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
