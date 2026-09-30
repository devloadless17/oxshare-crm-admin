'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { adminApi } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatMoney } from '@/lib/money';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * The payment a person is about to mark resolved — the few fields the dialog
 * states, so the Financial page and the withdrawal desk can both open it from
 * their own row shapes.
 */
export interface AttentionTarget {
  id: string;
  direction: string;
  amount: string;
  currency: string;
  /** WHY it was flagged, as the system wrote it. */
  reason?: string | null;
  portalId: number;
  /** The row's state and the provider's id — a hosted deposit can be FINISHED here (0173). */
  state?: string;
  providerPaymentId?: string | null;
}

/** What the dialog does: record a finding, or finish a flagged hosted deposit (backend 0173). */
type Choice = 'resolve' | 'credit' | 'close';

/*
 * ⚠️ THE SAME BOUNDS THE API ENFORCES — `ResolveAttentionDto` is
 * `@Length(10, 500)`. Stated up front for the reason the release-hold dialog
 * records: a button that presses and comes back 400 leaves the operator
 * guessing which of the two things they typed was wrong.
 */
const NOTE_MIN = 10;
const NOTE_MAX = 500;
/** Finishing a deposit needs a reason, any length (`FinishFlaggedDepositDto`). */
const FINISH_MIN = 1;

/**
 * "Mark resolved" — the finish line of a payment only a person could settle.
 *
 * An amount the platform reported differently, a reversal, money paid against
 * a failed row, or the two platforms disagreeing about a payout: each raises
 * the attention flag and an admin TASK, and nothing but a person may say it is
 * done. Resolving clears the flag, and the database ends the task for every
 * admin holding it (backend 0140).
 *
 * It moves NO money, and says so beside the field: whatever the reconciliation
 * required (a manual credit, a reversal) is its own audited action, taken
 * first. The note is the record of what they found — required, because "it is
 * fine" with nothing behind it is the one entry an auditor cannot use.
 *
 * A refusal stays INLINE with the dialog open: the likeliest one is "somebody
 * resolved it while you were looking", which is a sentence to read, not a toast
 * to miss.
 *
 * ## A flagged HOSTED deposit can also be FINISHED here (backend 0173)
 *
 * A deposit paid on a provider's page that only a person can settle — an
 * amount a fixed link did not expect, money the provider did not confirm, a
 * payment reported after the row failed — could never be finished before:
 * the deposit desk refuses hosted deposits, and "Mark resolved" moves no
 * money. So for one still open (pending, or failed as expired) the dialog
 * offers the two decisions that DO: credit what the provider reported arrived
 * (`deposits.approve`), or close it with no credit (`deposits.reject`) — each
 * with the reason as its audit record.
 */
export function ResolveAttentionDialog({
  target,
  onClose,
  onDone,
}: {
  /** The flagged payment, or `null` when the dialog is closed. */
  target: AttentionTarget | null;
  onClose: () => void;
  onDone: () => unknown;
}) {
  const { admin } = useAdmin();
  const [note, setNote] = React.useState('');
  // A money decision is never preselected: on an open hosted deposit the
  // reader picks one; elsewhere "Mark resolved" is the only choice there is.
  const [choice, setChoice] = React.useState<Choice | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const finishable =
    target !== null &&
    target.direction === 'deposit' &&
    Boolean(target.providerPaymentId) &&
    (target.state === 'pending' || target.state === 'failure');
  const choices: Choice[] = finishable
    ? [
        ...(hasPermission(admin, 'deposits.approve') ? (['credit'] as const) : []),
        ...(hasPermission(admin, 'deposits.reject') ? (['close'] as const) : []),
        'resolve',
      ]
    : ['resolve'];

  // Cleared when the target changes — a note written about one client's
  // payment must never carry over to the next row opened.
  const targetId = target?.id ?? null;
  const lastId = React.useRef<string | null>(null);
  if (lastId.current !== targetId) {
    lastId.current = targetId;
    if (note !== '') setNote('');
    if (error !== null) setError(null);
    if (choice !== null) setChoice(null);
  }
  const chosen: Choice | null = finishable ? choice : 'resolve';

  const resolve = useMutation({
    mutationFn: async (payment: AttentionTarget) => {
      if (chosen === null) throw new Error(t('attention.chooseFirst'));
      if (chosen === 'resolve') {
        await adminApi.resolveAttention(payment.id, note.trim());
        return null;
      }
      return adminApi.finishFlaggedDeposit(
        payment.id,
        { decision: chosen, reason: note.trim() },
        `finish-deposit:${payment.id}`,
      );
    },
    onSuccess: async (finished) => {
      onClose();
      await onDone();
      toastSuccess(
        finished === null
          ? t('attention.resolved')
          : finished.state === 'success'
            ? t('attention.creditedReceived', {
                amount: formatMoney(finished.amount, finished.currency),
              })
            : t('attention.closedNoCredit'),
      );
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('attention.resolveFailed'))),
  });

  const trimmed = note.trim().length;
  const minimum = chosen === 'resolve' ? NOTE_MIN : FINISH_MIN;

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      labelledBy="resolve-attention-title"
      title={finishable ? t('attention.finishTitle') : t('attention.resolveTitle')}
      description={
        target
          ? t(
              target.direction === 'deposit'
                ? 'attention.resolveIntroDeposit'
                : 'attention.resolveIntroWithdrawal',
              { amount: formatMoney(target.amount, target.currency), portalId: target.portalId },
            )
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={resolve.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => target && resolve.mutate(target)}
            aria-busy={resolve.isPending}
            disabled={resolve.isPending || chosen === null || trimmed < minimum}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {resolve.isPending
              ? t('attention.resolving')
              : chosen === 'credit'
                ? t('attention.creditReceived')
                : chosen === 'close'
                  ? t('attention.closeNoCredit')
                  : chosen === 'resolve'
                    ? t('attention.confirm')
                    : t('attention.chooseFirst')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* The flag's own words first — what the operator is resolving. */}
        <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">
              {t('attention.reasonLabel')}
            </p>
            <p className="mt-0.5 break-words text-xs leading-relaxed text-foreground">
              {target?.reason || t('attention.noReason')}
            </p>
          </div>
        </div>

        {choices.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold">{t('attention.finishLegend')}</legend>
            {choices.map((option) => (
              <label key={option} className="flex items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="attention-choice"
                  value={option}
                  checked={choice === option}
                  onChange={() => {
                    setChoice(option);
                    setError(null);
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-foreground">
                    {option === 'credit'
                      ? t('attention.creditReceived')
                      : option === 'close'
                        ? t('attention.closeNoCredit')
                        : t('attention.confirm')}
                  </span>
                  <span className="block text-muted-foreground">
                    {option === 'credit'
                      ? t('attention.creditReceivedHint')
                      : option === 'close'
                        ? t('attention.closeNoCreditHint')
                        : finishable
                          ? t('attention.resolveOnlyHostedHint')
                          : t('attention.resolveOnlyHint')}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div>
          <label htmlFor="resolve-attention-note" className="text-xs font-semibold">
            {t('attention.noteLabel')}
          </label>
          <textarea
            id="resolve-attention-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setError(null);
            }}
            rows={3}
            maxLength={NOTE_MAX}
            placeholder={t('attention.notePlaceholder')}
            className="focus-outline mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs"
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">{t('attention.noteHint')}</p>
            {/* The shortfall, only while it is why the button will not press. */}
            {trimmed > 0 && trimmed < minimum && (
              <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
                {t('attention.noteTooShort', { count: minimum - trimmed })}
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
