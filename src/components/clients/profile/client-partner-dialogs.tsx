'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { IbPartnerDetail } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { formatDecimal } from '@/lib/money';
import { keys } from '@/lib/query-keys';

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

/*
 * `ChangeLevelDialog` IS GONE (0102), with the rung it moved a partner between.
 *
 * It presented itself as the control over what somebody earns — "a disabled
 * level takes no share" — and had not decided a rate since the programmes
 * landed. The two questions it conflated each have an owner now:
 * `ChangeProgramDialog` below for the TERMS, and `ChangeParentDialog` for where
 * they sit in the tree.
 */

/**
 * Move a partner onto different TERMS.
 *
 * Until this control existed a partner's terms were written once at approval
 * and never again — an operator could build a catalogue of programmes and
 * assign nobody to any of them.
 *
 * Since 0102 it is also the only control over what somebody earns: the rung
 * dialog that used to sit beside it decided nothing and is gone.
 *
 * ENABLED programmes only. The API refuses a disabled one, so offering it here
 * would be a choice whose only outcome is a refusal — and the operator would
 * read that refusal as the move being impossible rather than the programme
 * being switched off.
 */
export function ChangeProgramDialog({
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
  const [programId, setProgramId] = React.useState(partner.programId);

  const programs = useResource(keys.ibPrograms.all(), (signal) => api.admin.getIbPrograms(signal), {
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => api.admin.changeIbPartnerProgram(partner.userId, programId),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.programChanged'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.programFailed')),
  });

  const options = (programs.data ?? []).filter((entry) => entry.enabled);

  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.changeProgramTitle', { name })}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('clientProfile.changeProgramBody')}
        </p>

        <div className="space-y-1.5">
          {options.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 ${
                programId === entry.id ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <span className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="ib-program"
                  checked={programId === entry.id}
                  onChange={() => setProgramId(entry.id)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span>
                  <span className="block text-sm font-medium">{entry.name}</span>
                  {/* The LADDER, because "Gold" alone does not tell an operator
                      what they are about to change somebody's pay TO — and the
                      number of levels is half of that answer, not decoration:
                      it is how far this partner's earnings will reach. */}
                  <span className="block text-[11px] text-muted-foreground">
                    {entry.mode === 'rebate_only'
                      ? t('clientProfile.programRebateOnly', {
                          rebate: formatDecimal(entry.rebateRate),
                        })
                      : t('clientProfile.programLadder', {
                          rates: entry.tiers
                            .map((tier) => `L${tier.depth} ${formatDecimal(tier.rate)}%`)
                            .join(' · '),
                          count: String(entry.tiers.length),
                        })}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>

        {options.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
            {t('clientProfile.programNoneEnabled')}
          </p>
        )}

        {save.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {t('clientProfile.programFailed')}
          </p>
        )}

        <Footer
          onClose={onClose}
          saving={save.isPending}
          disabled={options.length === 0 || programId === partner.programId}
          label={t('clientProfile.changeProgramSave')}
        />
      </form>
    </Modal>
  );
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
                  <span className="block truncate text-sm font-medium">
                    {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
                      row.user.email}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {row.user.email}
                  </span>
                </span>
              </span>
              {/* The candidate parent's TERMS, replacing their rung (0102).
                  Worth showing here because it is what decides whether this
                  parent earns anything from the sub-tree they are about to be
                  given. */}
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                {row.programName}
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
        {saving ? t('ibPrograms.saving') : label}
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
     * `change-program-from-list.tsx`, which reads the partner under
     * `ibPartners.detail(userId)` — a key nothing used to invalidate, so
     * reopening the same row within the 30s staleTime showed the programme
     * the operator had just changed away from.
     */
    queryClient.invalidateQueries({ queryKey: keys.ibPartners.all() }),
  ]);
}
