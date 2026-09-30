'use client';

import { clientLabel } from '@/components/clients/client-identity';
import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Clock3, PauseCircle, RefreshCw, Send } from 'lucide-react';
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
 * The PROVIDER leg of the withdrawal desk — badge, cancel and resend — for
 * every provider that pays automatically (backend 0173's payments core; this
 * was Rival's alone before it).
 *
 * Its own file rather than more of `transactions/page.tsx`, which is pinned
 * near the size cap; the page mounts these and stays the owner of the queue.
 *
 * ── What the badge is really saying ────────────────────────────────────────
 *
 * An APPROVED automated withdrawal is a payout travelling through its
 * provider, and the fields on the row say where it is:
 *
 *   providerPayoutId set         → sent; the provider decides next.
 *                                  Settlement lands here on its own.
 *   providerSubmittedAt, no id   → the payout's OUTCOME IS UNKNOWN (the
 *                                  provider did not answer). Reconciliation
 *                                  resolves it — nothing here should resend:
 *                                  no provider takes an idempotency key on
 *                                  payouts, and a blind second create is a
 *                                  double payment.
 *   neither, payoutPlan paused   → nobody can pay it right now: its network
 *                                  is switched off, or its provider is off
 *                                  and waits rather than letting the desk pay.
 *   needsAttention               → a human's move: refused, never reached the
 *                                  provider, paid short, or the two sides
 *                                  disagree about the outcome.
 */
export function PayoutStatusBadge({ w }: { w: WithdrawalRow }) {
  return (
    <>
      <ProviderNote note={w.providerNote} />
      <PayoutBadge w={w} />
    </>
  );
}

/** The payout's status at its provider alone — without the provider note beside it. */
export function PayoutBadge({ w }: { w: WithdrawalRow }) {
  if (w.state !== 'approved' && !w.needsAttention) return null;

  if (w.needsAttention) {
    return (
      <>
        <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {t('withdrawals.payoutNeedsAttention')}
        </span>
        {/* WHY, on the row — the flag without the reason reads as "the system
            is broken" and sends the operator to the logs. */}
        {w.attentionReason && (
          <div
            className="mt-1 max-w-[220px] truncate text-[11px] text-warning/90"
            title={w.attentionReason}
          >
            {w.attentionReason}
          </div>
        )}
      </>
    );
  }
  if (w.state !== 'approved') return null;

  if (w.providerPayoutId) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
        title={w.providerPayoutId}
      >
        <Send className="h-3 w-3" aria-hidden="true" />
        {t('withdrawals.payoutAwaiting')}
      </span>
    );
  }
  if (w.providerSubmittedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <Clock3 className="h-3 w-3" aria-hidden="true" />
        {t('withdrawals.payoutReconciling')}
      </span>
    );
  }
  if (w.payoutPlan?.payer === 'paused') {
    // WHY it waits — a switched-off network names its reason.
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
        title={w.payoutPlan.reason ?? undefined}
      >
        <PauseCircle className="h-3 w-3" aria-hidden="true" />
        {t('withdrawals.payoutPaused')}
      </span>
    );
  }
  return null;
}

/**
 * The one flagged state a RESEND answers: an approved payout that provably
 * never reached its provider — refused outright, or absent from the
 * provider's complete records after the adoption window — so no claim is
 * held and no provider id exists. Every other flagged row is a
 * reconciliation — "Mark resolved" — and offering that here would clear the
 * flag on a payout that was never sent.
 */
export function isRetryableSubmission(w: WithdrawalRow): boolean {
  return (
    w.state === 'approved' && w.needsAttention && !w.providerSubmittedAt && !w.providerPayoutId
  );
}

/**
 * RESEND a payout a person decided should go again.
 *
 * Only offered when the claim is clear (`providerSubmittedAt` null) and the
 * row is flagged: a held claim means the outcome is unknown, and the API would
 * hold it regardless — this component simply does not offer a button whose
 * honest label would be "maybe pay twice".
 */
export function ResendPayoutButton({
  w,
  disabled,
  onDone,
}: {
  w: WithdrawalRow;
  disabled: boolean;
  onDone: () => Promise<void>;
}) {
  const { admin } = useAdmin();
  const resend = useMutation({
    mutationFn: () => adminApi.resendPayout(w.id, `provider-submit:${w.id}`),
    onSuccess: async () => {
      await onDone();
      toastSuccess(t('withdrawals.resendSucceeded'), w.user?.email ?? undefined);
    },
    onError: (error) => toastError(error, t('withdrawals.resendFailed')),
  });

  if (!isRetryableSubmission(w)) return null;
  // `POST /admin/withdrawals/:id/provider-submit` requires `withdrawals.approve`.
  // Every other control on the row is gated; this one renders outside the menu.
  if (!hasPermission(admin, 'withdrawals.approve')) return null;

  return (
    <button
      type="button"
      onClick={() => resend.mutate()}
      disabled={disabled || resend.isPending}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50 focus-outline"
    >
      {/* The shared Spinner in flight, the refresh mark at rest — never a
          `RefreshCw` with `animate-spin`, which freezes under reduce-motion.
          See ui/loader.tsx. */}
      {resend.isPending ? <Spinner /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
      {t('withdrawals.resendPayout')}
    </button>
  );
}

/**
 * Cancel an APPROVED withdrawal — "approved, then thought better of it".
 *
 * Mirrors the reject dialog's reason rules (FR-ADM-03: from the configurable
 * list or free text, at least one) because the client reads this sentence in
 * an email after being told "approved". The API recalls the payout at its
 * provider FIRST when it was sent and the provider can recall it, and refuses
 * cleanly when it is already being paid or cannot be recalled — that message
 * is surfaced verbatim, because "act on the outcome" is the instruction the
 * operator needs.
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
      // Inline, and the dialog stays open: the message may be the provider's
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
              // Formatted: the raw column read "30.00000000 USD" in the sentence.
              amount: formatMoney(target.amount, target.currency),
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
      {/* A sent payout is recalled at its provider first, where it can be;
          say so before the click rather than in the error after it. */}
      {target?.providerPayoutId && (
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
