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

/**
 * The two partner edits that need a CHOICE, so neither fits in a confirm.
 *
 * Suspending is a yes/no and lives in the actions menu behind `confirm()`.
 * Moving a rung and reassigning a parent both need the operator to pick from a
 * list the screen has to fetch — and both are writes against live placement, so
 * each states its consequence above the control rather than after the fact.
 *
 * Each invalidates BOTH the profile and the partner detail, for the reason the
 * actions menu records: they are separate requests about the same person, and
 * refreshing one leaves the header and the tab disagreeing.
 */

/** Move a partner to a different rung of the ladder. */
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

  const levels = useResource(['admin', 'ib-levels'], (signal) => api.admin.getIbLevels(signal), {
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => api.admin.changeIbPartnerLevel(partner.userId, level),
    onSuccess: async () => {
      await invalidateBoth(queryClient, partner.userId);
      toastSuccess(t('clientProfile.levelChanged', { level: String(level) }));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.levelFailed')),
  });

  /*
   * ENABLED levels only. `resolveLevel` refuses a disabled rung on the API, so
   * offering one here would be a choice whose only outcome is a refusal — and
   * the operator would read the refusal as the move being impossible rather
   * than the rung being switched off.
   */
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
              key={entry.level}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                level === entry.level ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="ib-level"
                  checked={level === entry.level}
                  onChange={() => setLevel(entry.level)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-sm font-medium">{entry.name}</span>
              </span>
              <span className="tabular text-xs font-semibold text-muted-foreground">
                {formatDecimal(entry.rateValue)}%
              </span>
            </label>
          ))}
        </div>

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
 * Move a partner onto different TERMS.
 *
 * The sibling of `ChangeLevelDialog`, and the distinction between them is the
 * whole point of the programme model: the LADDER decides where a partner
 * stands, the PROGRAMME decides what they are paid. Until this control existed
 * a partner's terms were written once at approval and never again — an operator
 * could build a catalogue of programmes and assign nobody to any of them.
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

  const programs = useResource(
    ['admin', 'ib-programs'],
    (signal) => api.admin.getIbPrograms(signal),
    { enabled: open },
  );

  const save = useMutation({
    mutationFn: () => api.admin.changeIbPartnerProgram(partner.userId, programId),
    onSuccess: async () => {
      await invalidateBoth(queryClient, partner.userId);
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
                  {/* The rates, because "Gold" alone does not tell an operator
                      what they are about to change somebody's pay TO. */}
                  <span className="block text-[11px] text-muted-foreground">
                    {entry.mode === 'rebate_only'
                      ? t('clientProfile.programRebateOnly', {
                          rebate: formatDecimal(entry.rebateRate),
                        })
                      : t('clientProfile.programRates', {
                          own: formatDecimal(entry.level1Rate),
                          sub: formatDecimal(entry.level2Rate),
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
    ['admin', 'ib-partners', 'for-reassign'],
    (signal) => api.admin.getIbPartners({ page: 1, limit: 100 }, signal),
    { enabled: open },
  );

  const save = useMutation({
    mutationFn: () => api.admin.reassignIbPartnerParent(partner.userId, parentId),
    onSuccess: async () => {
      await invalidateBoth(queryClient, partner.userId);
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
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                {row.levelName}
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
        {saving ? t('ibLevels.saving') : label}
      </button>
    </div>
  );
}

async function invalidateBoth(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['client', userId] }),
    queryClient.invalidateQueries({ queryKey: ['client', userId, 'partner'] }),
  ]);
}
