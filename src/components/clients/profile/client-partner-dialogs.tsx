'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { IbPartnerDetail, IbPayoutMode } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { formatDecimal } from '@/lib/money';
import { keys } from '@/lib/query-keys';
import { PortalIdTag } from '@/components/clients/client-identity';

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

  const levels = useResource(keys.ibLevels.all(), (signal) => api.admin.getIbLevels(signal), {
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => api.admin.changeIbPartnerLevel(partner.userId, level),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.levelChanged'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.levelFailed')),
  });

  const options = (levels.data ?? []).filter((entry) => entry.enabled);

  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.changeLevelTitle', { name })}>
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
                    {t('clientProfile.levelTerms', {
                      commission: describeTerm(
                        entry.commissionMode,
                        entry.commissionRate,
                        entry.commissionAmountPerLot,
                      ),
                      rebate: describeTerm(
                        entry.rebateMode,
                        entry.rebateRate,
                        entry.rebateAmountPerLot,
                      ),
                    })}
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
          disabled={options.length === 0 || level === partner.level}
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
function describeTerm(mode: IbPayoutMode, rate: string, amountPerLot: string | null): string {
  if (mode === 'per_lot') {
    return t('clientProfile.termPerLot', { amount: formatDecimal(amountPerLot ?? '0') });
  }
  /*
   * A `share_of_parent` rate is a percentage of the LEVEL ABOVE's per-lot rate,
   * not of revenue, and this dialog does not hold that rung. Saying "of the
   * level above" is the honest short form — rendering it as a plain "30%" would
   * read as 30% of the trade, which is a different and much larger number.
   */
  if (mode === 'share_of_parent') {
    return t('clientProfile.termShareOfParent', { rate: formatDecimal(rate) });
  }
  return t('clientProfile.termPercent', { rate: formatDecimal(rate) });
}

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
  const [parentId, setParentId] = React.useState<string | null>(partner.parent?.userId ?? null);

  const partners = useResource(
    keys.ibPartners.forReassign(),
    (signal) => api.admin.getIbPartners({ page: 1, limit: 100 }, signal),
    { enabled: open },
  );

  const save = useMutation({
    mutationFn: () => api.admin.reassignIbPartnerParent(partner.userId, parentId),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.parentChanged'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.parentFailed')),
  });

  /*
   * THEMSELVES excluded, and nothing else is.
   *
   * A partner cannot be their own parent, and that one case is worth removing
   * here because it is the only choice guaranteed to be refused. Every other
   * loop — placing somebody under their own descendant — is refused by the API's
   * cycle guard, which walks the whole chain; reproducing that walk in the
   * browser would be a second implementation of a rule that must not disagree.
   */
  const options = (partners.data?.rows ?? []).filter(
    (row) => row.account.userId !== partner.userId,
  );

  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.reassignParentTitle', { name })}>
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

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
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

          {options.map((row) => (
            <label
              key={row.account.userId}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                parentId === row.account.userId ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <input
                  type="radio"
                  name="ib-parent"
                  checked={parentId === row.account.userId}
                  onChange={() => setParentId(row.account.userId)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
                        row.user.email ||
                        `#${row.user.portalId}`}
                    </span>
                    {(row.user.firstName || row.user.lastName || row.user.email) && (
                      <PortalIdTag id={row.user.portalId} />
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {row.user.email}
                  </span>
                </span>
              </span>
              {/* The candidate parent's RUNG (0112). Worth showing because it
                  is what decides whether this parent earns anything from the
                  sub-tree they are about to be given. It read `row.level`, a
                  field the hand-written type promised and the API never sent,
                  so every option said "Level undefined" — caught the moment the
                  type became the generated one. */}
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                {t('clientProfile.levelBadge', { level: String(row.account.level) })}
              </span>
            </label>
          ))}
        </div>

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
          disabled={parentId === (partner.parent?.userId ?? null)}
          label={t('clientProfile.reassignParentSave')}
        />
      </form>
    </Modal>
  );
}

function Footer({
  onClose,
  saving,
  disabled,
  label,
}: {
  onClose: () => void;
  saving: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
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
        disabled={saving || disabled}
        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
      >
        {saving ? t('common.saving') : label}
      </button>
    </div>
  );
}

/**
 * Every screen a partner change is read back from.
 *
 * It was `invalidateBoth(queryClient, userId)` — the profile and its partner
 * panel — and the name was accurate about what it did and wrong about what was
 * needed. One `clients.all()` now covers the profile, its panels and the list;
 * `ibPartners.all()` covers the list-side picker.
 */
async function invalidatePartnerViews(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.clients.all() }),
    /*
     * The clients LIST opens this same dialog through
     * `change-level-from-list.tsx`, which reads the partner under
     * `ibPartners.detail(userId)` — a key nothing used to invalidate, so
     * reopening the same row within the 30s staleTime showed the programme
     * the operator had just changed away from.
     */
    queryClient.invalidateQueries({ queryKey: keys.ibPartners.all() }),
  ]);
}
