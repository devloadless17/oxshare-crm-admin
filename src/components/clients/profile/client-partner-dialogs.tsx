'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { IbLevel, IbPartnerDetail } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { formatDecimal } from '@/lib/money';
import Decimal from 'decimal.js';
import { keys } from '@/lib/query-keys';
import {
  DialogFooter as Footer,
  MainPartnerPicker,
  invalidatePartnerViews,
} from './partner-structure-dialogs';

/**
 * The two partner edits that need a CHOICE, so neither fits in a confirm.
 *
 * Suspending is a yes/no and lives in the actions menu behind `confirm()`.
 * Changing a partner's TERMS and reassigning their PARENT both need the
 * operator to pick from a list the screen has to fetch — and both are writes
 * against a live money relationship, so each states its consequence above the
 * control rather than after the fact.
 *
 * Each invalidates BOTH the profile and the partner detail, for the reason the
 * actions menu records: they are separate requests about the same person, and
 * refreshing one leaves the header and the tab disagreeing.
 */

/**
 * Move a partner to a different LEVEL — what decides their terms (0112).
 *
 * `ChangeProgramDialog` stood here, moving a partner between named commission
 * programmes. Terms come from a partner's RUNG now, derived from who recruited
 * them, so the catalogue it picked from no longer exists.
 *
 * ## Why a rung is editable at all, when it is derived
 *
 * Approval writes it from the parent's level, which is right in the ordinary
 * case and cannot be right in every one: a partner recruited by somebody later
 * cut loose to deal direct, or one the broker has agreed to treat as a main
 * partner despite sitting under another. Without this the number was decided
 * once by the shape of the tree on one particular afternoon.
 *
 * ## ENABLED rungs only, and the terms are shown beside each
 *
 * The API refuses a disabled or unconfigured level, so offering one here would
 * be a choice whose only outcome is a refusal — and the operator would read
 * that refusal as the move being impossible rather than the rung being switched
 * off. The rates are on the option because "Level 2" alone does not say what
 * this partner is about to be paid.
 */
export function ChangeLevelDialog({
  open,
  onClose,
  partner,
  name,
}: {
  open: boolean;
  onClose: () => void;
  partner: IbPartnerDetail;
  name: string;
}) {
  const queryClient = useQueryClient();
  const [level, setLevel] = React.useState(partner.level);
  const [parentId, setParentId] = React.useState<ClientRef | null>(null);

  /*
   * The level IS the position (0197), so a different level is a MOVE (owner,
   * 7 Oct 2026): 2 → 1 detaches them and removes "introduced by"; 1 → 2 needs
   * the main partner to sit under, who becomes their introducer.
   */
  const positional = partner.parent || partner.parentOutsideTerritory ? 2 : 1;
  const movingDown = level === 2 && positional === 1;
  const movingUp = level === 1 && positional === 2;
  const hasSubPartners = partner.directPartners.length + partner.directPartnersOutsideScope > 0;

  const levels = useResource(keys.ibLevels.all(), (signal) => api.admin.getIbLevels(signal), {
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      api.admin.changeIbPartnerLevel(partner.userId, level, movingDown ? parentId : undefined),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.levelChanged'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.levelFailed')),
  });

  // Two levels: a main partner (1) and a sub-partner (2).
  const options = (levels.data ?? []).filter((entry) => entry.enabled && entry.level <= 2);

  return (
    <Modal
      busy={save.isPending}
      open={open}
      onClose={onClose}
      title={t('clientProfile.changeLevelTitle', { name })}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('clientProfile.changeLevelBody')}
        </p>

        <div className="space-y-1.5">
          {options.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 ${
                level === entry.level ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <span className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="ib-level"
                  checked={level === entry.level}
                  onChange={() => setLevel(entry.level)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {t('clientProfile.levelOption', {
                      level: String(entry.level),
                      name: entry.name,
                    })}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {describeShares(entry)}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>

        {options.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
            {t('clientProfile.levelNoneEnabled')}
          </p>
        )}

        {movingUp && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs">
            {t('clientProfile.levelToMainNote')}
          </p>
        )}

        {movingDown &&
          (hasSubPartners ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              {t('clientProfile.levelToSubHasSubs')}
            </p>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('clientProfile.levelToSubChoose')}</h3>
              <p className="text-xs text-muted-foreground">{t('clientProfile.levelToSubNote')}</p>
              <MainPartnerPicker
                value={parentId}
                onChange={setParentId}
                exclude={partner.userId}
                enabled={open}
                name="level-parent"
              />
            </div>
          ))}

        {save.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {t('clientProfile.levelFailed')}
          </p>
        )}

        <Footer
          onClose={onClose}
          saving={save.isPending}
          disabled={
            options.length === 0 ||
            level === partner.level ||
            (movingDown && (hasSubPartners || parentId === null))
          }
          label={t('clientProfile.changeLevelSave')}
        />
      </form>
    </Modal>
  );
}

/**
 * One term in words — "$10.00 per lot" or "30% of revenue".
 *
 * The UNIT is never dropped, because "10" means two entirely different payouts
 * under the two modes and this string is read while deciding somebody's pay.
 */
/**
 * A rung's terms in words — shares of the traded product's commission type
 * (0140). What a share comes to in money depends on which product the client
 * trades, and this dialog does not hold the catalogue, so it names the
 * fraction rather than inventing a figure.
 */
function describeShares(entry: IbLevel): string {
  return t('clientProfile.levelTerms', {
    commission: t('clientProfile.termCommissionShare', {
      share: formatDecimal(entry.commissionShare),
    }),
    rebate: t('clientProfile.termRebateShare', { share: formatDecimal(entry.rebateShare) }),
  });
}

/**
 * A SUB-PARTNER's own commission and rebate (0197, the owner's rule).
 *
 * Commission: their share of the product's commission; the main partner above
 * takes the rest, and the split is shown live so the operator sees both sides
 * of the decision. Rebate: what their CLIENTS get back. Empty = the level 2
 * default (sent as `null`).
 */
export function SubPartnerTermsDialog({
  open,
  onClose,
  partner,
  name,
}: {
  open: boolean;
  onClose: () => void;
  partner: IbPartnerDetail;
  name: string;
}) {
  const queryClient = useQueryClient();
  const [commission, setCommission] = React.useState(
    partner.commissionShareOverride ? formatDecimal(partner.commissionShareOverride) : '',
  );
  const [rebate, setRebate] = React.useState(
    partner.rebateShareOverride ? formatDecimal(partner.rebateShareOverride) : '',
  );

  const parse = (value: string): Decimal | null => {
    if (value.trim() === '') return null;
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(value.trim())) return new Decimal(-1);
    return new Decimal(value.trim());
  };
  const commissionValue = parse(commission);
  const rebateValue = parse(rebate);
  const invalid = [commissionValue, rebateValue].some(
    (v) => v !== null && (v.lessThan(0) || v.greaterThan(100)),
  );
  const effective = commissionValue ?? new Decimal(partner.levelCommissionShare ?? '0');

  const save = useMutation({
    mutationFn: () =>
      api.admin.setIbPartnerTerms(partner.userId, {
        commissionShare: commission.trim() === '' ? null : commission.trim(),
        rebateShare: rebate.trim() === '' ? null : rebate.trim(),
      }),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.termsSaved'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.termsFailed')),
  });

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    fallback: string | null,
  ) => (
    <label htmlFor={id} className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={formatDecimal(fallback ?? '0')}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm tabular focus-outline"
      />
      <span className="block text-[11px] text-muted-foreground">
        {t('clientProfile.termsDefault', { share: formatDecimal(fallback ?? '0') })}
      </span>
    </label>
  );

  return (
    <Modal
      busy={save.isPending}
      open={open}
      onClose={onClose}
      title={t('clientProfile.termsTitle', { name })}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) save.mutate();
        }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('clientProfile.termsBody')}
        </p>
        {field(
          'sub-partner-commission',
          t('clientProfile.termsCommission'),
          commission,
          setCommission,
          partner.levelCommissionShare,
        )}
        {!invalid && (
          <p className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs tabular">
            {t('clientProfile.termsSplit', {
              sub: formatDecimal(effective.toFixed(4)),
              main: formatDecimal(new Decimal(100).minus(effective).toFixed(4)),
            })}
          </p>
        )}
        {field(
          'sub-partner-rebate',
          t('clientProfile.termsRebate'),
          rebate,
          setRebate,
          partner.levelRebateShare,
        )}
        {invalid && (
          <p role="alert" className="text-xs text-destructive">
            {t('clientProfile.termsRange')}
          </p>
        )}
        <Footer
          onClose={onClose}
          saving={save.isPending}
          disabled={invalid}
          label={t('clientProfile.termsSave')}
        />
      </form>
    </Modal>
  );
}

/** The current parent when the reader may not see who it is — never sent. */
const KEEP_OUTSIDE_PARENT = 'keep-outside-parent';

/** Put a partner under a different parent, or none at all. */
export function ReassignParentDialog({
  open,
  onClose,
  partner,
  name,
}: {
  open: boolean;
  onClose: () => void;
  partner: IbPartnerDetail;
  name: string;
}) {
  const queryClient = useQueryClient();
  /*
   * A parent OUTSIDE the reader's territory arrives as `parent: null` beside
   * `parentOutsideTerritory: true`. Opening on `null` pre-selected "No parent",
   * so the dialog told the reader something false about the partner — and one
   * click away from saving it, detaching them from a real parent and moving
   * who earns on their sub-tree. The current parent is its own choice instead,
   * and choosing it changes nothing.
   */
  const initial = partner.parentOutsideTerritory
    ? KEEP_OUTSIDE_PARENT
    : (partner.parent?.userId ?? null);
  const [parentId, setParentId] = React.useState<ClientRef | null>(initial);

  const save = useMutation({
    mutationFn: () => {
      if (parentId === KEEP_OUTSIDE_PARENT) throw new Error('Nothing to change.');
      return api.admin.reassignIbPartnerParent(partner.userId, parentId);
    },
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.parentChanged'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.parentFailed')),
  });

  return (
    <Modal
      busy={save.isPending}
      open={open}
      onClose={onClose}
      title={t('clientProfile.reassignParentTitle', { name })}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('clientProfile.reassignParentBody')}
        </p>
        <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
          {t('clientProfile.reassignParentReferrerNote')}
        </p>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {partner.parentOutsideTerritory && (
            <label
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 ${
                parentId === KEEP_OUTSIDE_PARENT ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="ib-parent"
                checked={parentId === KEEP_OUTSIDE_PARENT}
                onChange={() => setParentId(KEEP_OUTSIDE_PARENT)}
                className="h-3.5 w-3.5"
              />
              <span className="text-sm font-medium">
                {t('clientProfile.reassignParentKeepOutside')}
              </span>
            </label>
          )}
          {/* `null` is a REAL value here, not an omission — it means "deals with
              the broker directly", which is the top of a chain. */}
          <label
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 ${
              parentId === null ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name="ib-parent"
              checked={parentId === null}
              onChange={() => setParentId(null)}
              className="h-3.5 w-3.5"
            />
            <span className="text-sm font-medium">{t('clientProfile.reassignParentNone')}</span>
          </label>
        </div>

        {/* Sub-partners are not offered: the tree has two levels, and the API
            refuses one as a parent. Searched on the server, so every main
            partner is reachable, not only the first page. */}
        <MainPartnerPicker
          value={parentId === KEEP_OUTSIDE_PARENT ? null : parentId}
          onChange={setParentId}
          exclude={partner.userId}
          enabled={open}
          name="ib-parent"
        />

        {save.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {t('clientProfile.parentFailed')}
          </p>
        )}

        <Footer
          onClose={onClose}
          saving={save.isPending}
          disabled={parentId === initial}
          label={t('clientProfile.reassignParentSave')}
        />
      </form>
    </Modal>
  );
}
