'use client';

import { clientLabel } from '@/components/clients/client-identity';
import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Clock3, RefreshCw, Send } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { adminApi, type RejectionReason, type WithdrawalRow } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { toastError, toastSuccess } from '@/lib/toast';
import { apiErrorMessage } from '@/lib/api/errors';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { ProviderNote } from './provider-note';

/**
 * The Rival leg of the withdrawal desk — badge, cancel, and retry.
 *
 * Its own file rather than more of `transactions/page.tsx`, which is pinned
 * near the size cap; the page mounts these and stays the owner of the queue.
 *
 * ── What the badge is really saying ────────────────────────────────────────
 *
 * An APPROVED whish withdrawal is no longer "waiting for the settle button" —
 * it is a payout request travelling through Rival, and the three fields on
 * the row say where it is:
 *
 *   rivalWithdrawalId set        → submitted; Rival's operator decides next.
 *                                  Settlement lands here on its own.
 *   rivalSubmittedAt, no id      → the submission's OUTCOME IS UNKNOWN (the
 *                                  platform did not answer). Reconciliation
 *                                  resolves it — nothing here should retry,
 *                                  because Rival's payout create has no
 *                                  idempotency key and a blind second create
 *                                  is a double payment.
 *   rivalNeedsAttention          → a human's move: submission refused, or the
 *                                  two platforms disagree about the outcome.
 */
export function RivalStatusBadge({ w }: { w: WithdrawalRow }) {
  return (
    <>
      <ProviderNote note={w.providerNote} />
      <RivalBadge w={w} />
    </>
  );
}

/** The payout platform's status alone — without the provider note beside it. */
export function RivalBadge({ w }: { w: WithdrawalRow }) {
  if (w.state !== 'approved' && !w.rivalNeedsAttention) return null;

  if (w.rivalNeedsAttention) {
    return (
      <>
        <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {t('withdrawals.rivalNeedsAttention')}
        </span>
        {/* WHY, on the row — the flag without the reason reads as "the system
            is broken" and sends the operator to the logs. */}
        {w.rivalAttentionReason && (
          <div
            className="mt-1 max-w-[220px] truncate text-[11px] text-warning/90"
            title={w.rivalAttentionReason}
          >
            {w.rivalAttentionReason}
          </div>
        )}
      </>
    );
  }
  if (w.state !== 'approved') return null;

  if (w.rivalWithdrawalId) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
        title={w.rivalWithdrawalId}
      >
        <Send className="h-3 w-3" aria-hidden="true" />
        {t('withdrawals.rivalAwaiting')}
      </span>
    );
  }
  if (w.rivalSubmittedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <Clock3 className="h-3 w-3" aria-hidden="true" />
        {t('withdrawals.rivalReconciling')}
      </span>
    );
  }
  return null;
}

/**
 * The one flagged state a RETRY answers: an approved payout whose first
 * submission definitively failed (no claim held, no Rival id). Every other
 * flagged row is a reconciliation — "Mark resolved" — and offering that here
 * would clear the flag on a payout that was never sent.
 */
export function isRetryableSubmission(w: WithdrawalRow): boolean {
  return (
    w.state === 'approved' && w.rivalNeedsAttention && !w.rivalSubmittedAt && !w.rivalWithdrawalId
  );
}

/**
 * Retry a submission whose first attempt DEFINITIVELY failed.
 *
 * Only offered when the claim is clear (`rivalSubmittedAt` null) and the row
 * is flagged: a held claim means the outcome is unknown, and the API would
 * hold it regardless — this component simply does not offer a button whose
 * honest label would be "maybe pay twice".
 */
export function RetryRivalButton({
  w,
  disabled,
  onDone,
}: {
  w: WithdrawalRow;
  disabled: boolean;
  onDone: () => Promise<void>;
}) {
  const { admin } = useAdmin();
  const retry = useMutation({
    mutationFn: () => adminApi.retryRivalSubmission(w.id, `rival-submit:${w.id}`),
    onSuccess: async () => {
      await onDone();
      toastSuccess(t('withdrawals.retrySucceeded'), w.user?.email ?? undefined);
    },
    onError: (error) => toastError(error, t('withdrawals.retryFailed')),
  });

  if (!isRetryableSubmission(w)) return null;
  // `POST /admin/withdrawals/:id/rival-submit` requires `withdrawals.approve`.
  // Every other control on the row is gated; this one rendered outside the
  // menu and was not.
  if (!hasPermission(admin, 'withdrawals.approve')) return null;

  return (
    <button
      type="button"
      onClick={() => retry.mutate()}
      disabled={disabled || retry.isPending}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50 focus-outline"
    >
      {/* The shared Spinner in flight, the refresh mark at rest — never a
          `RefreshCw` with `animate-spin`, which freezes under reduce-motion.
          See ui/loader.tsx. */}
      {retry.isPending ? <Spinner /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
      {t('withdrawals.retrySubmission')}
    </button>
  );
}

/**
 * Cancel an APPROVED withdrawal — "approved, then thought better of it".
 *
 * Mirrors the reject dialog's reason rules (FR-ADM-03: from the configurable
 * list or free text, at least one) because the client reads this sentence in
 * an email after being told "approved". The API cancels at Rival FIRST when
 * the payout was submitted, and refuses cleanly if Rival is already paying —
 * that message is surfaced verbatim, because "wait for the outcome" is the
 * instruction the operator needs.
 */
export function CancelWithdrawalDialog({
  target,
  onClose,
  onDone,
}: {
  target: WithdrawalRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reasonId, setReasonId] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const reasons = useResource<RejectionReason[]>(
    keys.withdrawals.rejectionReasons(),
    () => adminApi.getRejectionReasons('withdrawal'),
    { enabled: target !== null },
  );

  const close = () => {
    setReasonId('');
    setNote('');
    setError(null);
    onClose();
  };

  const cancel = useMutation({
    mutationFn: (row: WithdrawalRow) =>
      adminApi.cancelWithdrawal(
        row.id,
        { reasonId: reasonId || undefined, reason: note.trim() || undefined },
        `cancel:${row.id}`,
      ),
    onSuccess: async (_data, row) => {
      close();
      await onDone();
      toastSuccess(
        t('withdrawals.cancelSucceeded', { amount: formatMoney(row.amount, row.currency) }),
        row.user?.email ?? undefined,
      );
    },
    onError: (e: unknown) => {
      // Inline, and the dialog stays open: the message may be Rival's
      // "already being paid", which the operator must read, not dismiss.
      // Through `apiErrorMessage`: an AxiosError IS an Error, so `e.message`
      // was "Request failed with status code 409" — the API's sentence, the
      // one this comment says must be read, was being thrown away.
      setError(apiErrorMessage(e, t('withdrawals.cancelFailed')));
    },
  });

  const reasonList = (reasons.status === 'ready' ? reasons.data : undefined) ?? [];

  return (
    <Modal
      open={target !== null}
      onClose={close}
      labelledBy="cancel-withdrawal-title"
      title={t('withdrawals.cancelTitle')}
      description={
        target
          ? t('withdrawals.cancelIntro', {
              // Never "{email}" for a role that hides it: the label falls back to the Portal ID.
              email: clientLabel(target.user),
              amount: target.amount,
              currency: target.currency,
            })
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={cancel.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => target && cancel.mutate(target)}
            aria-busy={cancel.isPending}
            disabled={cancel.isPending || (reasonId === '' && note.trim() === '')}
            className="h-9 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {cancel.isPending ? t('withdrawals.cancelling') : t('withdrawals.confirmCancellation')}
          </button>
        </>
      }
    >
      {/* A submitted payout is pulled back from Rival first; say so before
          the click rather than in the error after it. */}
      {target?.rivalWithdrawalId && (
        <p className="mb-3 text-[11px] text-warning">{t('withdrawals.cancelSubmittedNote')}</p>
      )}
      {reasonList.length > 0 && (
        <div>
          <label className="text-xs font-semibold">{t('withdrawals.rejectionReason')}</label>
          <Select value={reasonId} onValueChange={setReasonId}>
            <SelectTrigger className="mt-1 h-9 w-full">
              <SelectValue placeholder={t('withdrawals.selectReason')} />
            </SelectTrigger>
            <SelectContent>
              {reasonList.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="mt-3">
        <label htmlFor="cancel-note" className="text-xs font-semibold">
          {t('withdrawals.cancelNote')}
        </label>
        <textarea
          id="cancel-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-outline"
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </Modal>
  );
}
