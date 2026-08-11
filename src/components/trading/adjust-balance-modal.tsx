'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, TriangleAlert } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Credit or debit a trading account directly on MT5.
 *
 * ## This is a DEALER operation, and the copy says so
 *
 * No wallet moves. Money appears on, or leaves, the MT5 account with no
 * corresponding entry in the CRM ledger — right for corrections, bonuses and
 * manual settlement, wrong for a client funding their account. An operator who
 * confuses the two creates money that reconciliation cannot explain, so the
 * dialog states it rather than leaving it to be inferred.
 *
 * ## The amount is unsigned and the direction is a separate control
 *
 * The API refuses a signed amount for the same reason this form does not offer
 * one: an amount and a direction that can disagree is a withdrawal that becomes
 * a deposit, silently, in the one place that is least recoverable.
 */
export function AdjustBalanceModal({
  open,
  onClose,
  accountId,
  login,
  currency,
  canDeposit,
  canWithdraw,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  login: string;
  currency: string;
  canDeposit: boolean;
  canWithdraw: boolean;
}) {
  const queryClient = useQueryClient();

  /*
   * Defaults to whichever direction the operator is actually allowed to use.
   *
   * `trading.deposit` and `trading.withdraw` are separate keys and an admin may
   * hold one without the other. Defaulting to 'deposit' regardless would open
   * the dialog on a disabled control for a withdraw-only operator, which reads
   * as the feature being broken.
   */
  const [direction, setDirection] = React.useState<'deposit' | 'withdraw'>(
    canDeposit ? 'deposit' : 'withdraw',
  );
  const [amount, setAmount] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const apply = useMutation({
    mutationFn: () =>
      adminApi.adjustTradingBalance(accountId, {
        amount: amount.trim(),
        direction,
        comment: comment.trim(),
      }),
    onSuccess: (result) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'trading-accounts'] });
      toastSuccess(
        t(direction === 'deposit' ? 'tradingAccounts.deposited' : 'tradingAccounts.withdrawn', {
          amount: `${amount.trim()} ${currency}`,
          dealId: result.dealId,
        }),
        // Worth surfacing rather than hiding: the bridge replayed a stored
        // result instead of moving money again, so the operator's click did
        // nothing new. "Already applied" and "just applied" look identical
        // otherwise.
        result.replayed ? t('tradingAccounts.replayed') : undefined,
      );
      close();
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('tradingAccounts.balanceFailed'))),
  });

  const close = () => {
    setAmount('');
    setComment('');
    setError(null);
    onClose();
  };

  // Positive decimals only, up to eight places — the same rule the API applies,
  // so the button disables rather than inviting a round trip that will fail.
  const amountValid = /^\d+(\.\d{1,8})?$/.test(amount.trim()) && Number.parseFloat(amount) > 0;
  const ready = amountValid && comment.trim().length > 0;
  const allowed = direction === 'deposit' ? canDeposit : canWithdraw;

  return (
    <Modal open={open} onClose={close} title={t('tradingAccounts.balanceTitle')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || !allowed) return;
          apply.mutate();
        }}
      >
        <p className="text-xs text-muted-foreground">
          {t('tradingAccounts.balanceFor', { login })}
        </p>

        {/*
          Two buttons rather than a dropdown. The direction is the single most
          consequential field here and it is worth being visible at a glance
          rather than one row of a collapsed list — and the destructive one is
          coloured as such.
        */}
        <div className="flex gap-2" role="group" aria-label={t('tradingAccounts.balanceTitle')}>
          <Button
            type="button"
            size="sm"
            variant={direction === 'deposit' ? 'default' : 'outline'}
            disabled={!canDeposit}
            onClick={() => {
              setDirection('deposit');
              setError(null);
            }}
          >
            {t('tradingAccounts.deposit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={direction === 'withdraw' ? 'destructive' : 'outline'}
            disabled={!canWithdraw}
            onClick={() => {
              setDirection('withdraw');
              setError(null);
            }}
          >
            {t('tradingAccounts.withdraw')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mt5-amount" className="text-xs">
            {t('tradingAccounts.fieldAmount')} ({currency})
          </Label>
          <Input
            id="mt5-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              // Digits and one dot. Typed as a STRING throughout and never
              // parsed to a number on the way to the API — see the money rule.
              setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'));
              setError(null);
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mt5-comment" className="text-xs">
            {t('tradingAccounts.fieldComment')}
          </Label>
          <Input
            id="mt5-comment"
            maxLength={128}
            placeholder={t('tradingAccounts.commentPlaceholder')}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setError(null);
            }}
          />
          <p className="text-[11px] text-muted-foreground">{t('tradingAccounts.commentHint')}</p>
        </div>

        <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-foreground">
            {t('tradingAccounts.dealerWarning')}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            variant={direction === 'withdraw' ? 'destructive' : 'default'}
            disabled={!ready || !allowed || apply.isPending}
          >
            {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {apply.isPending
              ? t('tradingAccounts.balanceApplying')
              : t('tradingAccounts.balanceConfirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
