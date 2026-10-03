'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { PauseCircle, Pencil, PlayCircle, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { IbCommissionType, IbLevel, IbLevelLimits } from '@/lib/api/admin';
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
import { OutsideTerritoryCount } from '@/components/clients/outside-territory-count';

/**
 * The commission ladder, drawn as a TREE of read-only cards.
 *
 * ## What a rung holds now (0140)
 *
 * Two PERCENTAGES: the partner's share of the traded product's commission per
 * lot, and the client's share of its rebate per lot. The money itself lives on
 * the product's commission type — see Commission Types — so one ladder prices
 * the whole catalogue, and a card here never shows an amount as if it were the
 * whole answer. What it shows instead is the share, and beneath it what that
 * share comes to on each type, because a percentage of a number on another
 * screen is not a figure anybody can hold in their head.
 *
 * ## The shares are independent
 *
 * On a sub-partner's client's trade, the sub takes their share AND the main
 * partner takes their own in full — recruiting must not reduce what the main
 * partner earns (0114). So "100% / 30%" on a $10 type is $10 to the main
 * partner and $3 to the sub, and the ladder does not have to add up to 100.
 *
 * ## Why the cards do not contain the form
 *
 * A card is a summary: who stands here, what they earn, what their clients get
 * back. Editing opens the same dialog that creates a rung, from the three-dot
 * menu. One form, one set of validation, one place a mistake can be made.
 *
 * ## Nothing here restates money already earned
 *
 * A share change applies to the NEXT trade. Accruals record the share AND the
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

  /*
   * The rate cards the shares are taken of, so each card can say what its
   * percentage comes to in money. Enabled ones only: a disabled type pays
   * nobody, and a preview on it would be a number that never arrives.
   */
  const types = useResource<IbCommissionType[]>(keys.ibCommissionTypes.all(), (signal) =>
    api.admin.getIbCommissionTypes(signal),
  );
  const activeTypes = React.useMemo(
    () => (types.data ?? []).filter((type) => type.enabled),
    [types.data],
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
        // Everyone on the rung, the reader's territory or not: the API refuses
        // on the whole count, so the question has to ask about all of it.
        level.partnerCount + level.partnersOutsideScope > 0
          ? t('ibLevels.confirmDeleteOccupied', {
              level: String(level.level),
              count: String(level.partnerCount + level.partnersOutsideScope),
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
                  types={activeTypes}
                  typesLoaded={types.status === 'ready'}
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
           * resetting the state on open is the obvious alternative and is
           * worse: it renders the stale draft for a frame before replacing it,
           * and `react-hooks/set-state-in-effect` refuses it.
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
 * The shares are rendered rather than editable, so the whole ladder fits on a
 * screen and its shape is legible — which is the thing a tree is for.
 */
function LevelCard({
  level,
  types,
  typesLoaded,
  canEdit,
  canDelete,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  level: IbLevel;
  /** The enabled rate cards, for the per-type preview. */
  types: IbCommissionType[];
  typesLoaded: boolean;
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
            sitting in the open beside a share is one mis-click from removing
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
            {t('ibLevels.termCommission', { share: trim(level.commissionShare) })}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">{t('ibLevels.rebate')}</dt>
          <dd className="truncate text-right font-semibold tabular">
            {t('ibLevels.termRebate', { share: trim(level.rebateShare) })}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">{t('ibLevels.partners')}</dt>
          <dd className="text-right font-semibold tabular">
            {level.partnerCount}
            <OutsideTerritoryCount count={level.partnersOutsideScope} />
          </dd>
        </div>
      </dl>

      {/*
        What the shares come to in MONEY, per rate card. "70%" is only readable
        beside "$7.00 on Standard", and the type is on a different screen.
      */}
      {typesLoaded && (
        <div className="mt-3 border-t border-dashed border-input pt-3 text-[11px] text-muted-foreground">
          <p className="font-semibold">{t('ibLevels.perTypeHeading')}</p>
          {types.length === 0 ? (
            <p className="mt-1">{t('ibLevels.noTypes')}</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {types.map((type) => (
                <li key={type.id} className="tabular">
                  {t('ibLevels.perType', {
                    name: type.name,
                    commission: shareOf(type.commissionPerLot, level.commissionShare),
                    rebate: shareOf(type.rebatePerLot, level.rebateShare),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The rung form — ONE dialog for both adding and editing.
 *
 * Shared deliberately rather than written twice. The two differ only in which
 * endpoint they call and whether the level number is fixed; everything worth
 * getting right — the bound, the hints, the validation — is identical, and two
 * copies of it drift.
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
   * Seeded from the stored STRINGS. A new rung opens at 0 — a level paying
   * nothing looks the same as one nobody configured, which is why the dialog
   * exists at all, but defaulting to some percentage would put a number nobody
   * agreed into a rate card.
   */
  const [commissionShare, setCommissionShare] = React.useState(
    existing ? trim(existing.commissionShare) : '0',
  );
  const [rebateShare, setRebateShare] = React.useState(existing ? trim(existing.rebateShare) : '0');

  /*
   * A share is a fraction of ONE figure on the product, so it cannot exceed
   * the whole of it. Checked with decimal.js, never `Number()` — the value
   * multiplies money one request later — and checked here so the refusal is a
   * sentence beside the field rather than a toast after the save.
   */
  const tooLarge =
    decimalOrZero(commissionShare).greaterThan(100) || decimalOrZero(rebateShare).greaterThan(100);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        commissionShare: commissionShare.trim() === '' ? '0' : commissionShare.trim(),
        rebateShare: rebateShare.trim() === '' ? '0' : rebateShare.trim(),
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

  return (
    <Modal
      busy={save.isPending}
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
          if (tooLarge) return;
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

        <ShareField
          id="level-commission"
          label={t('ibLevels.commission')}
          hint={t('ibLevels.commissionHint')}
          value={commissionShare}
          onChange={setCommissionShare}
        />

        <ShareField
          id="level-rebate"
          label={t('ibLevels.rebate')}
          hint={t('ibLevels.rebateHint')}
          value={rebateShare}
          onChange={setRebateShare}
        />

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('ibLevels.independentNote')}
        </p>

        {tooLarge && (
          <p role="alert" className="text-[11px] leading-relaxed text-destructive">
            {t('ibLevels.shareTooLarge')}
          </p>
        )}

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
            disabled={save.isPending || tooLarge}
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
 * One share — a percentage of the product's figure.
 *
 * `type="text"` with `inputMode="decimal"`: a number input hands back a NUMBER,
 * and this value multiplies money. Four decimal places, matching NUMERIC(12,4).
 */
function ShareField({
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
    <div className="space-y-1.5">
      <span className="text-xs font-semibold">{label}</span>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          inputMode="decimal"
          aria-label={label}
          pattern="\d{1,3}(\.\d{1,4})?"
          className="flex h-10 w-full rounded-lg border border-input bg-card pl-3 pr-10 text-xs tabular focus-outline"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
          {t('ibLevels.unitPercent')}
        </span>
      </div>
      <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>
    </div>
  );
}

/** `'70.0000'` → `'70'`, for reading. String surgery, never arithmetic. */
function trim(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

/**
 * What a share of an amount comes to, to the cent — the preview on the card.
 *
 * A DISPLAY figure only: the engine rounds at eight places and this at two,
 * so the two can differ in the last fraction of a cent. Nothing here is sent
 * anywhere.
 */
function shareOf(amountPerLot: string, share: string): string {
  return decimalOrZero(amountPerLot).times(decimalOrZero(share)).dividedBy(100).toFixed(2);
}

/**
 * A value as a `Decimal`, or zero while it is being typed.
 *
 * `new Decimal('')` THROWS, and this runs on every keystroke — including the
 * moment a field is empty because somebody selected all and started retyping.
 */
function decimalOrZero(value: string): Decimal {
  try {
    return new Decimal(value.trim() === '' ? 0 : value);
  } catch {
    return new Decimal(0);
  }
}
