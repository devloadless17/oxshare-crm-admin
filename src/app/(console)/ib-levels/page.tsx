'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { PauseCircle, PlayCircle, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type {
  IbLevel,
  IbLevelLimits,
  IbPayoutMode,
  RevenueBasis,
  UpdateIbLevel,
} from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The commission ladder — one card per RUNG of the partner tree.
 *
 * ## What this replaced, and why the shape of the screen changed with it
 *
 * `/ib-programs` was a CATALOGUE: a list of named cards, each with its own
 * create and edit page, assigned to partners one at a time. A rate was keyed on
 * DEPTH — how many hops a trade sat below the earner — so the same partner was
 * paid differently on their own clients than on a sub-partner's.
 *
 * A level is keyed on where the earner STANDS. Level 1 deals with the broker
 * directly; a partner they recruit is level 2. There is one ladder, it is two
 * rungs long by default, and nobody is assigned to anything — a partner's rung
 * follows from who recruited them.
 *
 * So this is ONE screen with the whole ladder on it, saved rung by rung, rather
 * than a list linking to a form. A catalogue needs a list because it grows; a
 * ladder does not.
 *
 * ## Each rung has TWO terms, and each is priced independently
 *
 * `commission*` pays the PARTNER, `rebate*` pays the trading CLIENT, and either
 * may be a percentage of broker revenue or a flat amount per standard lot. The
 * three programme "modes" are gone with the catalogue: they were a label
 * describing which of two numbers were set, and the numbers say that
 * themselves.
 *
 * ## Nothing here restates money already earned
 *
 * A rate change applies to the NEXT trade. Accruals record the rate AND the
 * rung that priced them, so re-reading a level can never change what a partner
 * was already paid.
 */
export default function IbLevelsPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'ib.levels.create');
  const canEdit = hasPermission(admin, 'ib.levels.edit');
  const canDelete = hasPermission(admin, 'ib.levels.delete');

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const query = useResource<IbLevel[]>(keys.ibLevels.all(), (signal) =>
    api.admin.getIbLevels(signal),
  );

  /*
   * How deep the commission engine actually walks. NOT a configurable ceiling
   * any more (0113): `ib_max_levels` capped this and defaulted to 2, so adding
   * a third rung meant first raising a number on the Trading settings tab.
   *
   * Still READ rather than hardcoded, because the bound is the engine's and a
   * copy here would drift the day the walk changes.
   */
  const limits = useResource<IbLevelLimits>(keys.ibLevels.limits(), (signal) =>
    api.admin.getIbLevelLimits(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.ibLevels.all() });

  const levels = query.data ?? [];
  const deepest = levels.reduce((max, level) => Math.max(max, level.level), 0);
  /*
   * Guessing LOW while the ceiling loads. Guessing high would show an "add a
   * level" button that withdraws when the answer arrives, and a control that
   * appears and then vanishes is worse than one that arrives late.
   */
  const maxLevels = limits.data?.maxLevels ?? 0;
  const canAddDeeper = canCreate && deepest < maxLevels;

  const addLevel = useMutation({
    mutationFn: (level: number) =>
      api.admin.createIbLevel({
        level,
        name: t('ibLevels.defaultName', { level: String(level) }),
        /*
         * Percent at zero, which pays nobody and says so. A new rung must not
         * start paying on a number nobody chose — and zero is visibly
         * unconfigured on the card, unlike a plausible-looking default.
         */
        commissionMode: 'percent',
        commissionRate: '0',
        rebateMode: 'percent',
        rebateRate: '0',
        enabled: true,
      }),
    onSuccess: async (created) => {
      await invalidate();
      toastSuccess(t('ibLevels.addSucceeded', { level: String(created.level) }));
    },
    onError: (error) => toastError(error, t('ibLevels.addFailed')),
  });

  const removeLevel = useMutation({
    mutationFn: (level: IbLevel) => api.admin.deleteIbLevel(level.level),
    onSuccess: async (_data, level) => {
      await invalidate();
      toastSuccess(t('ibLevels.deleteSucceeded', { level: String(level.level) }));
    },
    /*
     * The API's own message. It refuses level 1, a rung partners stand on, and
     * one with deeper rungs below it — each with a different sentence, and a
     * generic failure would turn all three into "it did not work".
     */
    onError: (error) => toastError(error, t('ibLevels.deleteFailed')),
  });

  const askThenRemove = async (level: IbLevel) => {
    const ok = await confirm({
      title: t('ibLevels.confirmDeleteTitle', { level: String(level.level) }),
      /*
       * The partner count is in the question, because it is the whole answer.
       * "Remove level 2?" and "Remove level 2, which 14 partners are paid by?"
       * are different decisions — and the API refuses the second anyway, so
       * asking with the number turns a refusal into an informed cancellation.
       */
      description:
        level.partnerCount > 0
          ? t('ibLevels.confirmDeleteOccupied', {
              level: String(level.level),
              count: String(level.partnerCount),
            })
          : t('ibLevels.confirmDelete', { level: String(level.level) }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) removeLevel.mutate(level);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('ibLevels.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('ibLevels.subtitle')}</p>
        </div>
        {canAddDeeper && (
          <button
            type="button"
            onClick={() => addLevel.mutate(deepest + 1)}
            disabled={addLevel.isPending}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('ibLevels.add', { level: String(deepest + 1) })}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('ibLevels.loading')}
        endpoints={['GET /admin/ib-levels']}
        onRetry={query.refetch}
        errorMessage={apiErrorMessage(query.error, t('ibLevels.loadFailed'))}
        error={query.error}
        fill
      >
        <div className="flex flex-col gap-4 overflow-y-auto pb-2">
          {levels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-input p-8 text-center text-sm text-muted-foreground">
              {t('ibLevels.empty')}
            </p>
          ) : (
            levels.map((level) => (
              <LevelCard
                key={level.id}
                level={level}
                canEdit={canEdit}
                canDelete={canDelete}
                onDelete={() => void askThenRemove(level)}
                onSaved={invalidate}
              />
            ))
          )}

          {/*
            Stated rather than left to be inferred from a missing button. An
            operator who cannot find "add a level" needs to know it is a
            ceiling they control, not a limit of the product.
          */}
          {canCreate && deepest >= maxLevels && maxLevels > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('ibLevels.atCeiling', { max: String(maxLevels) })}
            </p>
          )}
        </div>
      </AsyncBoundary>
    </div>
  );
}

/**
 * One rung, editable in place.
 *
 * A local draft rather than a controlled mirror of the query: the operator is
 * mid-edit while react-query may refetch underneath them, and a refetch that
 * reset their half-typed rate would be indistinguishable from the form
 * discarding their work.
 */
function LevelCard({
  level,
  canEdit,
  canDelete,
  onDelete,
  onSaved,
}: {
  level: IbLevel;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = React.useState(level.name);
  const [commissionMode, setCommissionMode] = React.useState<IbPayoutMode>(level.commissionMode);
  const [commissionRate, setCommissionRate] = React.useState(level.commissionRate);
  const [commissionAmount, setCommissionAmount] = React.useState(
    level.commissionAmountPerLot ?? '0',
  );
  const [rebateMode, setRebateMode] = React.useState<IbPayoutMode>(level.rebateMode);
  const [rebateRate, setRebateRate] = React.useState(level.rebateRate);
  const [rebateAmount, setRebateAmount] = React.useState(level.rebateAmountPerLot ?? '0');
  const [revenueBasis, setRevenueBasis] = React.useState<RevenueBasis>(level.revenueBasis);

  /*
   * Re-seed when the SERVER's copy changes — after a save, or after somebody
   * else's. Keyed on `updatedAt` rather than on the whole row so an identical
   * refetch does not stamp on a draft the operator is still typing.
   */
  const seededAt = React.useRef(level.updatedAt);
  React.useEffect(() => {
    if (seededAt.current === level.updatedAt) return;
    seededAt.current = level.updatedAt;
    setName(level.name);
    setCommissionMode(level.commissionMode);
    setCommissionRate(level.commissionRate);
    setCommissionAmount(level.commissionAmountPerLot ?? '0');
    setRebateMode(level.rebateMode);
    setRebateRate(level.rebateRate);
    setRebateAmount(level.rebateAmountPerLot ?? '0');
    setRevenueBasis(level.revenueBasis);
  }, [level]);

  const save = useMutation({
    mutationFn: (body: UpdateIbLevel) => api.admin.updateIbLevel(level.level, body),
    onSuccess: async () => {
      await onSaved();
      toastSuccess(t('ibLevels.saveSucceeded', { level: String(level.level) }));
    },
    onError: (error) => toastError(error, t('ibLevels.saveFailed')),
  });

  const toggleEnabled = useMutation({
    mutationFn: () => api.admin.updateIbLevel(level.level, { enabled: !level.enabled }),
    onSuccess: async () => {
      await onSaved();
      toastSuccess(
        level.enabled
          ? t('ibLevels.disabledSucceeded', { level: String(level.level) })
          : t('ibLevels.enabledSucceeded', { level: String(level.level) }),
      );
    },
    /*
     * The API refuses to disable a rung partners stand on and names the count.
     * Surfaced verbatim — that number is the only part an operator can act on.
     */
    onError: (error) => toastError(error, t('ibLevels.toggleFailed')),
  });

  /*
   * Both legs are shares of the SAME revenue, so they add — and only the
   * PERCENTAGE ones do. "$10 a lot plus 30%" has no meaningful total, and
   * showing one would refuse an honest mixed rung. Per-lot legs are bounded
   * instead at accrual time, where the lot count is actually known.
   */
  const share = React.useMemo(() => {
    const commission =
      commissionMode === 'percent' ? decimalOrZero(commissionRate) : new Decimal(0);
    const rebate = rebateMode === 'percent' ? decimalOrZero(rebateRate) : new Decimal(0);
    return commission.plus(rebate);
  }, [commissionMode, commissionRate, rebateMode, rebateRate]);
  const overAllocated = share.greaterThan(100);

  /*
   * The basis names WHICH revenue a PERCENTAGE is a share of, so it decides
   * nothing on a rung where both terms are flat amounts. Hidden then — but only
   * then: one percentage term still needs it, and hiding it there would leave
   * that term priced on a basis nobody could see.
   */
  const pricesOnRevenue = commissionMode === 'percent' || rebateMode === 'percent';

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate({
      name: name.trim(),
      commissionMode,
      /*
       * BOTH shapes are sent for each term, not just the active one. The API
       * writes the column its mode reads and NULLs the other, and a PATCH that
       * omitted the newly-relevant field would switch a rung to per-lot with no
       * amount — which the database refuses, correctly, as a term that pays on
       * nothing.
       */
      commissionRate,
      commissionAmountPerLot: commissionAmount,
      rebateMode,
      rebateRate,
      rebateAmountPerLot: rebateAmount,
      revenueBasis,
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-input bg-card p-5 shadow-sm"
      aria-label={t('ibLevels.cardLabel', { level: String(level.level) })}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold tabular">
            {level.level}
          </span>
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              required
              maxLength={80}
              aria-label={t('ibLevels.name')}
              className="h-8 w-56 rounded-lg border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-input focus-outline disabled:cursor-not-allowed"
            />
            <p className="px-1 text-[11px] text-muted-foreground">
              {t(level.level === 1 ? 'ibLevels.whoIsHere_1' : 'ibLevels.whoIsHere_n', {
                parent: String(level.level - 1),
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {t('ibLevels.partnerCount', { count: String(level.partnerCount) })}
          </span>
          {!level.enabled && (
            <span className="rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
              {t('ibLevels.disabled')}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => toggleEnabled.mutate()}
              disabled={toggleEnabled.isPending}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-2.5 text-[11px] font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 focus-outline"
            >
              {level.enabled ? (
                <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {level.enabled ? t('ibLevels.disable') : t('ibLevels.enable')}
            </button>
          )}
          {/* Level 1 is never removable — every chain starts there, so deleting
              it would stop the ladder paying rather than shortening it. */}
          {canDelete && level.level > 1 && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={t('ibLevels.remove', { level: String(level.level) })}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-input text-destructive hover:bg-destructive/10 focus-outline"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <TermField
          idPrefix={`level-${level.level}-commission`}
          label={t('ibLevels.commission')}
          hint={t('ibLevels.commissionHint')}
          mode={commissionMode}
          onModeChange={setCommissionMode}
          rate={commissionRate}
          onRateChange={setCommissionRate}
          amount={commissionAmount}
          onAmountChange={setCommissionAmount}
          disabled={!canEdit}
        />
        <TermField
          idPrefix={`level-${level.level}-rebate`}
          label={t('ibLevels.rebate')}
          hint={t('ibLevels.rebateHint')}
          mode={rebateMode}
          onModeChange={setRebateMode}
          rate={rebateRate}
          onRateChange={setRebateRate}
          amount={rebateAmount}
          onAmountChange={setRebateAmount}
          disabled={!canEdit}
        />
      </div>

      {pricesOnRevenue && (
        <label className="mt-5 block space-y-1.5" htmlFor={`level-${level.level}-basis`}>
          <span className="text-xs font-semibold text-foreground">{t('ibLevels.basis')}</span>
          <select
            id={`level-${level.level}-basis`}
            value={revenueBasis}
            onChange={(e) => setRevenueBasis(e.target.value as RevenueBasis)}
            disabled={!canEdit}
            className="flex h-10 w-full max-w-md rounded-lg border border-input bg-card px-3 text-xs focus-outline disabled:cursor-not-allowed"
          >
            <option value="commission_swap">{t('ibLevels.basis_commission_swap')}</option>
            <option value="spread">{t('ibLevels.basis_spread')}</option>
            <option value="commission_swap_spread">
              {t('ibLevels.basis_commission_swap_spread')}
            </option>
          </select>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('ibLevels.basisHint')}
          </span>
          {/*
            The IRREVERSIBLE one, and it is warned about where it is chosen.
            Under `spread`, a product whose markup is still 0 produces zero
            revenue — and a zero-revenue deal is marked DONE rather than
            retried, so switching before the markups are populated drains the
            queue paying nothing, permanently.
          */}
          {revenueBasis !== 'commission_swap' && (
            <span className="block text-[11px] leading-relaxed text-warning">
              {t('ibLevels.basisSpreadWarning')}
            </span>
          )}
        </label>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-input pt-4">
        <p
          className={`text-[11px] ${overAllocated ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {t('ibLevels.shareTotal', { total: share.toString() })}
          {overAllocated && ` — ${t('ibLevels.overAllocated')}`}
        </p>
        {canEdit && (
          <button
            type="submit"
            disabled={save.isPending || overAllocated}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-transform duration-100 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
          >
            {save.isPending ? t('common.saving') : t('common.saveChanges')}
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * One TERM — a mode selector and the number that mode reads.
 *
 * Both inputs stay mounted and only one is shown, so switching modes does not
 * discard what was typed in the other: an operator comparing "$10 a lot" with
 * "30%" flips between them, and losing the figure each time would make the
 * comparison impossible.
 */
function TermField({
  idPrefix,
  label,
  hint,
  mode,
  onModeChange,
  rate,
  onRateChange,
  amount,
  onAmountChange,
  disabled,
}: {
  idPrefix: string;
  label: string;
  hint: string;
  mode: IbPayoutMode;
  onModeChange: (mode: IbPayoutMode) => void;
  rate: string;
  onRateChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  disabled: boolean;
}) {
  const perLot = mode === 'per_lot';

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <input
            id={`${idPrefix}-value`}
            value={perLot ? amount : rate}
            onChange={(e) => (perLot ? onAmountChange : onRateChange)(e.target.value)}
            disabled={disabled}
            required
            inputMode="decimal"
            aria-label={label}
            /*
             * The pattern follows the MODE, because the two are different kinds
             * of number: a percentage with eight decimals is a typo, and money
             * rounded to four is a payout that disagrees with the ledger it
             * lands in (§6.1).
             */
            pattern={perLot ? '\\d{1,8}(\\.\\d{1,8})?' : '\\d{1,8}(\\.\\d{1,4})?'}
            className="flex h-10 w-full rounded-lg border border-input bg-card pl-3 pr-12 text-xs tabular focus-outline disabled:cursor-not-allowed"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
            {perLot ? t('ibLevels.unitPerLot') : '%'}
          </span>
        </div>
        <select
          aria-label={t('ibLevels.modeFor', { term: label })}
          value={mode}
          onChange={(e) => onModeChange(e.target.value as IbPayoutMode)}
          disabled={disabled}
          className="h-10 shrink-0 rounded-lg border border-input bg-card px-2 text-[11px] focus-outline disabled:cursor-not-allowed"
        >
          <option value="percent">{t('ibLevels.payoutMode_percent')}</option>
          <option value="per_lot">{t('ibLevels.payoutMode_per_lot')}</option>
        </select>
      </div>
      <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
    </div>
  );
}

/**
 * A rate as a `Decimal`, or zero while it is being typed.
 *
 * `new Decimal('')` THROWS, and this runs on every keystroke — including the
 * moment a field is empty because somebody selected all and started retyping.
 * Zero is the right reading for the running total: an unfinished number
 * contributes nothing until it is one.
 */
function decimalOrZero(value: string): Decimal {
  try {
    return new Decimal(value.trim() === '' ? 0 : value);
  } catch {
    return new Decimal(0);
  }
}
