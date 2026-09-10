'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { PauseCircle, Pencil, PlayCircle, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { IbLevel, IbLevelLimits, IbPayoutMode, RevenueBasis } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { RowActions } from '@/components/row-actions';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The commission ladder, drawn as a TREE of read-only cards.
 *
 * ## Why the cards do not contain the form
 *
 * They did, and it made every rung a page-height block of inputs — so a
 * two-rung ladder did not fit on a screen and the SHAPE of the ladder, which is
 * the thing this page exists to show, was the one thing you could not see.
 *
 * A card is now a summary: who stands here, what they earn, what their clients
 * get back. Editing opens the same dialog that creates a rung, reached from the
 * three-dot menu. One form, one set of validation, one place a mistake can be
 * made — rather than an inline form and a modal drifting apart.
 *
 * ## Why a tree rather than a list
 *
 * A list is a set of peers and these are not peers: level 2 sits BENEATH level
 * 1, and since 0114 it can be paid a share OF level 1's rate. A connecting line
 * says that; whitespace does not.
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

  /** The rung being edited, or `'new'` while adding one. */
  const [editing, setEditing] = React.useState<IbLevel | 'new' | null>(null);

  const query = useResource<IbLevel[]>(keys.ibLevels.all(), (signal) =>
    api.admin.getIbLevels(signal),
  );

  /*
   * How deep the commission engine actually walks. NOT a configurable ceiling
   * any more (0113) — still READ rather than hardcoded, because the bound is
   * the engine's and a copy here would drift the day the walk changes.
   */
  const limits = useResource<IbLevelLimits>(keys.ibLevels.limits(), (signal) =>
    api.admin.getIbLevelLimits(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.ibLevels.all() });

  const levels = query.data ?? [];
  const deepest = levels.reduce((max, level) => Math.max(max, level.level), 0);
  /*
   * Guessing LOW while the bound loads. Guessing high would show an "add a
   * level" control that withdraws when the answer arrives, and a button that
   * appears and then vanishes is worse than one that arrives late.
   */
  const maxLevels = limits.data?.maxLevels ?? 0;
  const canAddDeeper = canCreate && deepest < maxLevels;

  const toggleEnabled = useMutation({
    mutationFn: (level: IbLevel) =>
      api.admin.updateIbLevel(level.level, { enabled: !level.enabled }),
    onSuccess: async (_data, level) => {
      await invalidate();
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('ibLevels.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('ibLevels.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('ibLevels.loading')}
        endpoints={['GET /admin/ib-levels']}
        onRetry={query.refetch}
        errorMessage={t('ibLevels.loadFailed')}
        error={query.error}
        fill
      >
        <div className="flex flex-col items-center overflow-y-auto pb-4">
          {levels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-input p-8 text-center text-sm text-muted-foreground">
              {t('ibLevels.empty')}
            </p>
          ) : (
            levels.map((level, index) => (
              <React.Fragment key={level.id}>
                {/* A plain rule between cards — enough to read as a hierarchy
                    rather than a stack, without decorating it. */}
                {index > 0 && <span className="h-5 w-px bg-border" aria-hidden="true" />}
                <LevelCard
                  level={level}
                  parent={levels.find((candidate) => candidate.level === level.level - 1)}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  busy={toggleEnabled.isPending}
                  onEdit={() => setEditing(level)}
                  onToggle={() => toggleEnabled.mutate(level)}
                  onDelete={() => void askThenRemove(level)}
                />
              </React.Fragment>
            ))
          )}

          {/*
            The ROUNDED PLUS, at the bottom of the tree and on the cards' own
            centre line — so it reads as the next rung rather than as a toolbar
            button that happens to live down here.
          */}
          {canAddDeeper && (
            <>
              <span className="h-5 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setEditing('new')}
                aria-label={t('ibLevels.add', { level: String(deepest + 1) })}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-dashed border-input text-muted-foreground transition-transform duration-100 hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-[0.95] motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}

          {/* Stated rather than left to be inferred from a missing button. */}
          {canCreate && deepest >= maxLevels && maxLevels > 0 && (
            <p className="mt-4 max-w-md text-center text-xs text-muted-foreground">
              {t('ibLevels.atCeiling', { max: String(maxLevels) })}
            </p>
          )}
        </div>
      </AsyncBoundary>

      {editing !== null && (
        <LevelDialog
          /*
           * REMOUNTED per opening, which is what seeds the form. An effect
           * resetting six pieces of state on open is the obvious alternative
           * and is worse: it renders the stale draft for a frame before
           * replacing it, and `react-hooks/set-state-in-effect` refuses it.
           */
          key={editing === 'new' ? `new-${deepest + 1}` : editing.id}
          existing={editing === 'new' ? undefined : editing}
          level={editing === 'new' ? deepest + 1 : editing.level}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

/**
 * One rung, as a COMPACT read-only summary.
 *
 * What a person needs at a glance is who stands here and what they are paid.
 * The numbers are rendered rather than editable, so the whole ladder fits on a
 * screen and its shape is legible — which is the thing a tree is for.
 */
function LevelCard({
  level,
  parent,
  canEdit,
  canDelete,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  level: IbLevel;
  /** The rung directly above — what a `share_of_parent` rate resolves against. */
  parent: IbLevel | undefined;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      /*
       * SQUARE rather than a full-width strip. A row spanning the page reads as
       * a table row — and a table of rungs is exactly the flat list the tree is
       * here to replace. A compact box sitting on a centre line reads as a node.
       */
      className={`flex w-80 flex-col rounded-xl border bg-card p-5 shadow-sm ${
        level.enabled ? 'border-input' : 'border-dashed border-warning/50'
      }`}
      aria-label={t('ibLevels.cardLabel', { level: String(level.level) })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold tabular">
            {level.level}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{level.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {level.description?.trim() ||
                t(level.level === 1 ? 'ibLevels.whoIsHere_1' : 'ibLevels.whoIsHere_n', {
                  parent: String(level.level - 1),
                })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!level.enabled && (
            <span className="rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
              {t('ibLevels.disabled')}
            </span>
          )}
          {/*
            Edit, enable/disable and delete behind a THREE-DOT menu. A delete
            sitting in the open beside a rate is one mis-click from removing
            terms partners are paid by.
          */}
          {(canEdit || canDelete) && (
            <RowActions
              label={t('ibLevels.rowActions', { level: String(level.level) })}
              busy={busy}
              items={[
                ...(canEdit
                  ? [
                      { label: t('common.edit'), icon: Pencil, onSelect: onEdit },
                      {
                        label: level.enabled ? t('ibLevels.disable') : t('ibLevels.enable'),
                        icon: level.enabled ? PauseCircle : PlayCircle,
                        onSelect: onToggle,
                        /* Disabling stops the rung paying everybody on it. */
                        destructive: level.enabled,
                      },
                    ]
                  : []),
                /* Level 1 is never removable — every chain starts there, so
                   deleting it stops the ladder paying rather than shortening it. */
                ...(canDelete && level.level > 1
                  ? [
                      {
                        label: t('ibLevels.remove', { level: String(level.level) }),
                        icon: Trash2,
                        onSelect: onDelete,
                        destructive: true,
                        separatorBefore: true,
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      </div>

      <dl className="mt-4 space-y-2 border-t border-input pt-4 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">{t('ibLevels.commission')}</dt>
          <dd className="truncate text-right font-semibold tabular">
            {describeTerm(
              level.commissionMode,
              level.commissionRate,
              level.commissionAmountPerLot,
              parent,
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">{t('ibLevels.rebate')}</dt>
          <dd className="truncate text-right font-semibold tabular">
            {describeTerm(level.rebateMode, level.rebateRate, level.rebateAmountPerLot, parent)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">{t('ibLevels.partners')}</dt>
          <dd className="text-right font-semibold tabular">{level.partnerCount}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * The rung form — ONE dialog for both adding and editing.
 *
 * Shared deliberately rather than written twice. The two differ only in which
 * endpoint they call and whether the level number is fixed; everything worth
 * getting right — the mode-dependent unit, the share hint, the validation — is
 * identical, and two copies of it drift.
 */
function LevelDialog({
  existing,
  level,
  onClose,
  onSaved,
}: {
  /** Absent when adding. Present when editing, and seeds every field. */
  existing: IbLevel | undefined;
  level: number;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = React.useState(
    () => existing?.name ?? t('ibLevels.defaultName', { level: String(level) }),
  );
  const [description, setDescription] = React.useState(existing?.description ?? '');
  /*
   * Amounts only — every rung is priced per lot since 0117, so there is no mode
   * to hold and no percentage rate beside it.
   *
   * A rung configured before that migration has no stored per-lot amount (its
   * money lived in the rate column), so the field opens EMPTY rather than at a
   * default: the API refuses the save until a person states the amount, and
   * defaulting to "10" here would put a number nobody agreed into a rate card.
   */
  /* A rung configured before 0117, whose money lived in the rate column. The
     form cannot show that rate as a per-lot amount, so it says so and the
     operator states the figure the broker actually agreed. */
  const legacy = existing !== undefined && existing.commissionMode !== 'per_lot';
  const [amount, setAmount] = React.useState(
    existing ? (existing.commissionAmountPerLot ?? '') : '10',
  );
  const [rebateAmount, setRebateAmount] = React.useState(
    existing ? (existing.rebateAmountPerLot ?? '') : '0',
  );
  /*
   * Still SENT, never shown. It qualifies a percentage — of which there are
   * none since 0117 — but the column is NOT NULL, so a save that omitted it
   * would be refused. Held at whatever the rung already carries.
   */
  const [revenueBasis] = React.useState<RevenueBasis>(existing?.revenueBasis ?? 'commission_swap');

  const save = useMutation({
    mutationFn: () => {
      /*
       * `per_lot` is stated rather than left to a default: the DTO still names
       * the field, and a save that omitted it on a rung configured before 0117
       * would leave it on a retired mode the database now refuses.
       *
       * The rates are sent as hard zeroes for the same reason they are written
       * as zero server-side — a live-looking percentage beside the amount that
       * actually pays is how somebody reads the wrong number off the row later.
       */
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        commissionMode: 'per_lot' as const,
        commissionRate: '0',
        commissionAmountPerLot: amount,
        rebateMode: 'per_lot' as const,
        rebateRate: '0',
        rebateAmountPerLot: rebateAmount,
        revenueBasis,
      };
      return existing
        ? api.admin.updateIbLevel(existing.level, body)
        : api.admin.createIbLevel({ ...body, level, enabled: true });
    },
    onSuccess: async () => {
      await onSaved();
      toastSuccess(
        existing
          ? t('ibLevels.saveSucceeded', { level: String(level) })
          : t('ibLevels.addSucceeded', { level: String(level) }),
      );
      onClose();
    },
    onError: (error) =>
      toastError(error, existing ? t('ibLevels.saveFailed') : t('ibLevels.addFailed')),
  });

  /*
   * ── THE 100% GUARD IS GONE (0117) ─────────────────────────────────────────
   *
   * It summed the two legs and refused a rung paying out more than the revenue
   * behind it. Both legs had to be PERCENTAGES of one revenue figure for that
   * sum to mean anything, and neither can be a percentage any more — so the
   * check could only ever compare zero against 100.
   *
   * The bound that still applies to a per-lot rung is `ib_max_payout_per_lot`,
   * enforced by `checkPlausible` when a trade is priced. It has to be enforced
   * there rather than here because it compares against the trade's VOLUME,
   * which no form can see.
   *
   * The revenue-basis picker went with it. It named WHICH revenue a percentage
   * was a share of, and there are no percentages left for it to qualify.
   */

  return (
    <Modal
      open
      onClose={onClose}
      title={
        existing
          ? t('ibLevels.editTitle', { level: String(level) })
          : t('ibLevels.addTitle', { level: String(level) })
      }
      description={t('ibLevels.addDescription', { parent: String(level - 1) })}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block space-y-1.5" htmlFor="level-name">
          <span className="text-xs font-semibold">{t('ibLevels.name')}</span>
          <input
            id="level-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
          />
        </label>

        <label className="block space-y-1.5" htmlFor="level-description">
          <span className="text-xs font-semibold">{t('ibLevels.description')}</span>
          <textarea
            id="level-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={t('ibLevels.descriptionPlaceholder')}
            className="flex w-full rounded-lg border border-input bg-card p-3 text-xs focus-outline"
          />
        </label>

        {legacy && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-400"
          >
            {t('ibLevels.legacyMode')}
          </p>
        )}

        <TermField
          id="level-commission"
          label={t('ibLevels.commission')}
          hint={t('ibLevels.commissionHint')}
          amount={amount}
          onAmountChange={setAmount}
        />

        <TermField
          id="level-rebate"
          label={t('ibLevels.rebate')}
          hint={t('ibLevels.rebateHint')}
          amount={rebateAmount}
          onAmountChange={setRebateAmount}
        />

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
            disabled={save.isPending}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {save.isPending
              ? t('common.saving')
              : existing
                ? t('common.saveChanges')
                : t('ibLevels.addSave')}
          </button>
        </div>
      </form>
    </Modal>
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
/**
 * One term — a flat amount per standard lot.
 *
 * ## Why there is no mode picker any more (0117)
 *
 * It offered three: a percentage of broker revenue, a flat per-lot amount, and
 * a percentage of the rung above.
 *
 * `percent` was removed because its base is MT5's charged commission plus swap,
 * which is ZERO on a raw-spread group — so a rate card reading "30%" paid
 * nothing at all on a whole class of accounts, silently, because 30% of nothing
 * looks like a legitimate zero. That is the live bug this deployment already
 * hit, where every closed trade was marked processed having paid nobody.
 *
 * `share_of_parent` worked correctly — 30% of the rung above's $10 resolved to
 * $3 a lot, and it kept a ladder proportional when the top rate was
 * renegotiated. It was removed on an explicit instruction, and the reason is a
 * good one: with several sub-partner rungs, a rate nobody can read off the card
 * without resolving a chain upward is a rate somebody eventually gets wrong.
 *
 * The trade, stated plainly: raising level 1 from $10 to $12 no longer moves
 * level 2. Every rung is now edited on its own, deliberately.
 */
function TermField({
  id,
  label,
  hint,
  amount,
  onAmountChange,
}: {
  id: string;
  label: string;
  hint: string;
  amount: string;
  onAmountChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold">{label}</span>
      <div className="relative">
        <input
          id={id}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          required
          inputMode="decimal"
          aria-label={label}
          /*
           * EIGHT decimal places, because this is money: the column is
           * NUMERIC(28,8) and a figure rounded to four here would disagree with
           * the ledger it lands in (§6.1). The percentage pattern that used to
           * sit beside this one is gone with the mode it belonged to.
           */
          pattern="\d{1,8}(\.\d{1,8})?"
          className="flex h-10 w-full rounded-lg border border-input bg-card pl-3 pr-12 text-xs tabular focus-outline"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
          {t('ibLevels.unitPerLot')}
        </span>
      </div>
      <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
    </div>
  );
}

/**
 * One term in words, for the card — "$10 per lot", "30%", "30% of the level
 * above ($3 per lot)".
 *
 * The UNIT is never dropped: "10" means two entirely different payouts under
 * the two modes, and this is read while deciding somebody's pay. A share also
 * shows what it RESOLVES to, because a percentage of a number on another card
 * is not a figure anybody can hold in their head.
 */
function describeTerm(
  mode: IbPayoutMode,
  rate: string,
  amountPerLot: string | null,
  parent: IbLevel | undefined,
): string {
  if (mode === 'per_lot') {
    return t('ibLevels.termPerLot', { amount: trim(amountPerLot ?? '0') });
  }
  if (mode === 'share_of_parent') {
    const parentRate = parentPerLotRate(parent);
    return parentRate === undefined
      ? t('ibLevels.termShareUnresolved', { rate: trim(rate) })
      : t('ibLevels.termShare', {
          rate: trim(rate),
          result: parentRate.times(decimalOrZero(rate)).dividedBy(100).toFixed(2),
        });
  }
  return t('ibLevels.termPercent', { rate: trim(rate) });
}

/** `'10.00000000'` → `'10'`, for reading. String surgery, never arithmetic. */
function trim(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

/** The rung above's per-lot rate, when it has one to take a share of. */
function parentPerLotRate(parent: IbLevel | undefined): Decimal | undefined {
  if (!parent || parent.commissionMode !== 'per_lot') return undefined;
  return decimalOrZero(parent.commissionAmountPerLot ?? '0');
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
