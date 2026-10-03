'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { adminApi, type WithdrawalRow } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import { formatMoney } from '@/lib/money';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

type Decision = 'paid' | 'refund';

const NOTE_MAX = 500;
const REF_MAX = 128;

/**
 * FINISH A FLAGGED PAYOUT (backend 0174) — one the provider holds that the
 * engine will not finish on its own: the provider reported it paid to ANOTHER
 * destination (3pay's forced cold-wallet route), or several of its records
 * could be it. The person checks the provider's dashboard first, then:
 *
 *   Mark paid — the client received it (another way, or after all), with the
 *               reference of the payment that reached them. The client is told.
 *   Refund    — nothing reached the client: the withdrawal fails and the amount
 *               returns to their wallet, with a fixed client-safe sentence.
 *
 * Neither is preselected: both move money. The note is the audit record and
 * never reaches the client.
 */
export function FinishPayoutDialog({
  target,
  onClose,
  onDone,
}: {
  target: WithdrawalRow | null;
  onClose: () => void;
  onDone: () => unknown;
}) {
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // A fresh start for every row opened: nothing typed about one payout carries over.
  const targetId = target?.id ?? null;
  const lastId = React.useRef<string | null>(null);
  if (lastId.current !== targetId) {
    lastId.current = targetId;
    if (decision !== null) setDecision(null);
    if (reference !== '') setReference('');
    if (note !== '') setNote('');
    if (error !== null) setError(null);
  }

  const finish = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      adminApi.finishFlaggedPayout(
        row.id,
        {
          decision: decision ?? 'refund',
          reason: note.trim(),
          ...(decision === 'paid' ? { reference: reference.trim() } : {}),
        },
        `finish-payout:${row.id}:${decision ?? ''}`,
      ),
    onSuccess: async (done) => {
      onClose();
      await onDone();
      toastSuccess(
        done.state === 'success'
          ? t('withdrawals.finishPaidDone', { amount: formatMoney(done.amount, done.currency) })
          : t('withdrawals.finishRefundDone', { amount: formatMoney(done.amount, done.currency) }),
      );
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('withdrawals.finishFailed'))),
  });

  const ready =
    decision !== null &&
    note.trim().length > 0 &&
    (decision === 'refund' || reference.trim().length > 0);

  return (
    <Modal
      busy={finish.isPending}
      open={target !== null}
      onClose={onClose}
      labelledBy="finish-payout-title"
      title={t('withdrawals.finishTitle')}
      description={
        target
          ? t('withdrawals.finishIntro', {
              amount: formatMoney(target.amount, target.currency),
              portalId: target.user.portalId,
            })
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={finish.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => target && finish.mutate(target)}
            aria-busy={finish.isPending}
            disabled={finish.isPending || !ready}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {decision === 'paid'
              ? t('withdrawals.finishPaid')
              : decision === 'refund'
                ? t('withdrawals.finishRefund')
                : t('attention.chooseFirst')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 break-words text-xs leading-relaxed text-foreground">
            {target?.attentionReason || t('attention.noReason')}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold">{t('withdrawals.finishLegend')}</legend>
          {(['paid', 'refund'] as const).map((option) => (
            <label key={option} className="flex items-start gap-2 text-xs">
              <input
                type="radio"
                name="finish-payout-decision"
                value={option}
                checked={decision === option}
                onChange={() => {
                  setDecision(option);
                  setError(null);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold text-foreground">
                  {option === 'paid' ? t('withdrawals.finishPaid') : t('withdrawals.finishRefund')}
                </span>
                <span className="block text-muted-foreground">
                  {option === 'paid'
                    ? t('withdrawals.finishPaidHint')
                    : t('withdrawals.finishRefundHint')}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {decision === 'paid' && (
          <div>
            <label htmlFor="finish-payout-reference" className="text-xs font-semibold">
              {t('withdrawals.finishReference')}
            </label>
            <input
              id="finish-payout-reference"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                setError(null);
              }}
              maxLength={REF_MAX}
              placeholder={t('withdrawals.finishReferencePlaceholder')}
              className="focus-outline mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 font-mono text-xs"
            />
          </div>
        )}

        <div>
          <label htmlFor="finish-payout-note" className="text-xs font-semibold">
            {t('attention.noteLabel')}
          </label>
          <textarea
            id="finish-payout-note"
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
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('withdrawals.finishNoteHint')}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
