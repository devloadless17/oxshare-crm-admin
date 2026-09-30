'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { adminApi } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatMoney } from '@/lib/money';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/** The accrual being reversed — only what the dialog states. */
export interface ReverseTarget {
  id: string;
  amount: string;
  currency: string;
  /** Confirmed money moved; reversing it debits the wallet it credited. */
  confirmed: boolean;
}

// ⚠️ The API's own bounds — `ReverseAccrualDto` is `@Length(3, 500)`.
const REASON_MIN = 3;
const REASON_MAX = 500;

/**
 * "Reverse" — the finish line of a commission clawback task.
 *
 * A dealer cancelled the trade that paid this commission, so it must not stand.
 * The dialog says plainly which of the two things happens: a pending accrual is
 * simply cancelled; a confirmed one takes the money back from the wallet it
 * credited. The reason is required — it is the audit row's whole content — and
 * a refusal (the money was already spent or withdrawn) stays inline, because it
 * is a sentence to act on, not a toast to miss.
 */
export function ReverseAccrualDialog({
  target,
  onClose,
  onDone,
}: {
  target: ReverseTarget | null;
  onClose: () => void;
  onDone: () => unknown;
}) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // A reason written about one accrual never carries over to the next.
  const targetId = target?.id ?? null;
  const lastId = React.useRef<string | null>(null);
  if (lastId.current !== targetId) {
    lastId.current = targetId;
    if (reason !== '') setReason('');
    if (error !== null) setError(null);
  }

  const reverse = useMutation({
    mutationFn: (accrual: ReverseTarget) => adminApi.reverseIbAccrual(accrual.id, reason.trim()),
    onSuccess: async () => {
      onClose();
      await onDone();
      toastSuccess(t('commissions.reversed'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('commissions.reverseFailed'))),
  });

  const trimmed = reason.trim().length;

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      labelledBy="reverse-accrual-title"
      title={t('commissions.reverseTitle')}
      description={
        target
          ? t(
              target.confirmed
                ? 'commissions.reverseIntroConfirmed'
                : 'commissions.reverseIntroPending',
              {
                amount: formatMoney(target.amount, target.currency),
              },
            )
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={reverse.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => target && reverse.mutate(target)}
            aria-busy={reverse.isPending}
            disabled={reverse.isPending || trimmed < REASON_MIN}
            className="h-9 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {reverse.isPending ? t('commissions.reversing') : t('commissions.reverseConfirm')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="reverse-accrual-reason" className="text-xs font-semibold">
          {t('commissions.reverseReasonLabel')}
        </label>
        <textarea
          id="reverse-accrual-reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
          rows={3}
          maxLength={REASON_MAX}
          placeholder={t('commissions.reverseReasonPlaceholder')}
          className="focus-outline w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs"
        />
        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
