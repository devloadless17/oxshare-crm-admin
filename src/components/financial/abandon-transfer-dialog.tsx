'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import type { TransactionRow } from '@/lib/api/admin';
import { formatMoney } from '@/lib/money';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Release a transfer the MT5 bridge left in flight.
 *
 * ## The state this repairs
 *
 * A `wallet_to_account` transfer HOLDS the money at request time and debits it
 * on settle. When the bridge loses its MT5 session mid-call the transfer stays
 * pending — correctly, because the executor cannot tell "MT5 refused" from "MT5
 * never answered" — and nothing ever expires that hold. The client sees
 * "Processing" and cannot spend their own money, for as long as nobody looks.
 *
 * Until this dialog existed the only repair was hand-written SQL against a money
 * table, which is why it is here rather than in a runbook.
 *
 * ## Why the warning is the biggest thing on it
 *
 * Releasing a transfer MT5 ACTUALLY APPLIED lets the client spend the same money
 * twice. The system cannot rule that out — only somebody reading the broker's
 * own deal history can — so the copy names the check to make rather than asking
 * "are you sure", which is a question an operator answers yes to by reflex.
 *
 * ## The reason is REQUIRED and reaches the client
 *
 * It lands in `failure_reason`, which the portal renders beside the failed row.
 * A client whose transfer is reversed hours later is owed the sentence
 * explaining why, and the operator who checked with the broker is the only one
 * who can write it.
 */
export function AbandonTransferDialog({
  target,
  onClose,
  onDone,
}: {
  /** The pending transfer row, or `null` when the dialog is closed. */
  target: TransactionRow | null;
  onClose: () => void;
  onDone: () => unknown;
}) {
  const [reason, setReason] = React.useState('');

  /*
   * Cleared by REMOUNTING on the target, not in an effect.
   *
   * `key` on the caller's side would do it too, but the dialog owns its own
   * field and a stale reason carried from the previous row is the one mistake
   * that would be invisible: it reads perfectly well, and it is about a
   * different client's transfer.
   */
  const targetId = target?.id ?? null;
  const lastId = React.useRef<string | null>(null);
  if (lastId.current !== targetId) {
    lastId.current = targetId;
    if (reason !== '') setReason('');
  }

  const abandon = useMutation({
    mutationFn: (row: TransactionRow) =>
      /*
       * The intent key is the ACTION and the ROW, so a double-click is one
       * release rather than two. A second, deliberate abandon of the same
       * transfer is refused by the state guard anyway — it is no longer pending.
       */
      api.admin.abandonTransfer(row.id, reason.trim(), `abandon:${row.id}`),
    onSuccess: async (_data, row) => {
      onClose();
      await onDone();
      toastSuccess(
        t('financial.abandonSucceeded', {
          amount: formatMoney(row.amount, row.currency),
        }),
        row.user?.email ?? undefined,
      );
    },
    onError: (error) => toastError(error, t('financial.abandonFailed')),
  });

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      labelledBy="abandon-transfer-title"
      title={t('financial.abandonTitle')}
      description={
        target
          ? t('financial.abandonIntro', {
              created: new Date(target.createdAt).toLocaleString(),
              /*
               * VERBATIM, not formatted. This is the last sentence an operator
               * reads before releasing a hold, and §6.1 decimal strings are what
               * the ledger actually holds — a rounded figure here would be a
               * different number from the one being released.
               */
              amount: target.amount,
              currency: target.currency,
              email: target.user?.email ?? '—',
            })
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={abandon.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => target && abandon.mutate(target)}
            aria-busy={abandon.isPending}
            /* A release with no reason reaches the client as a bare reversal of
               money they were told was on its way. */
            disabled={abandon.isPending || reason.trim() === ''}
            className="h-9 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {abandon.isPending ? t('financial.abandoning') : t('financial.abandonConfirm')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* The double-spend warning, in the destructive colour, ABOVE the field
            — an operator who reads only one thing on this dialog must read
            this one. */}
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-destructive">
            {t('financial.abandonWarning')}
          </p>
        </div>

        <div>
          <label htmlFor="abandon-reason" className="text-xs font-semibold">
            {t('financial.abandonReason')}
          </label>
          <textarea
            id="abandon-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder={t('financial.abandonReasonPlaceholder')}
            className="focus-outline mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('financial.abandonReasonHint')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
