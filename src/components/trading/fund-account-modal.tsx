'use client';

import * as React from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';
import { isMoneyReasonReady, isPositiveMoneyInput } from '@/lib/money-input';
import { ArabicTextField, arabicOrNull } from '@/components/arabic-text-field';

/** What the form submits; `reasonAr` only when the operator wrote one. */
export type FundValues = {
  amount: string;
  reason: string;
  reasonAr?: string;
  direction: 'deposit' | 'withdraw';
};

/**
 * Move money on a client's trading account — the console's ONLY money control
 * for one.
 *
 * ## ⚠️ It replaced a second dialog, and that is the whole point of it
 *
 * There used to be two: this one, and "Adjust balance on MT5" — a dealer
 * operation that moved the MT5 balance with no wallet leg and no ledger entry.
 * Both appeared in the same row menu, both moved money on the same account, and
 * the only difference was whether anything was written down.
 *
 * That is not a choice an operator can be asked to make correctly. The owner's
 * verdict was that they are the same act, so there is one control and it always
 * records. A bonus or a goodwill credit now arrives as a real deposit on the
 * client's statement, which is the more honest answer anyway — the client can
 * see money they were given.
 *
 * ## Both directions, and NEITHER is a payout
 *
 * `deposit` credits the client's wallet and transfers it to the account.
 * `withdraw` transfers off the account and the money STAYS in their wallet. No
 * money leaves the platform on either one — paying a client out is the reviewed
 * withdrawal desk, and an operator who reads "withdraw" here as "paid out" has
 * told the client something false. The copy says where the money lands.
 *
 * ## The amount is unsigned and the direction is a separate control
 *
 * The API refuses a signed amount for the same reason this form does not offer
 * one: an amount and a direction that can disagree is a withdrawal that becomes
 * a deposit, silently, in the one place that is least recoverable.
 *
 * ## Who is affected is FIXED and not editable
 *
 * The account, its owner and the currency come from the row this was opened
 * from, and the currency is not sent at all — the server derives it, because
 * transfers do not convert and the wallet leg MUST match the account. Moving
 * money on the wrong account needs a compensating entry rather than an edit, so
 * there is no picker here.
 */
export function FundAccountModal({
  open,
  onClose,
  login,
  currency,
  canDeposit,
  canWithdraw,
  saving,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  login: string;
  currency: string;
  /** `wallets.credit` AND `trading.deposit` — a deposit mints before it moves. */
  canDeposit: boolean;
  /** `trading.withdraw` alone — a withdrawal mints nothing. */
  canWithdraw: boolean;
  saving: boolean;
  error?: string;
  onSubmit: (values: FundValues) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} busy={saving} title={t('tradingAccounts.fundTitle')}>
      {/*
        KEYED on the account, so opening this for a different row REMOUNTS the
        form and its fields start empty. Without it, an amount typed for one
        client and abandoned would still be in the box when the operator opens
        the next one — on a control that moves money.
      */}
      {open && (
        <FundForm
          key={login}
          login={login}
          currency={currency}
          canDeposit={canDeposit}
          canWithdraw={canWithdraw}
          saving={saving}
          error={error}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Modal>
  );
}

function FundForm({
  login,
  currency,
  canDeposit,
  canWithdraw,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  login: string;
  currency: string;
  canDeposit: boolean;
  canWithdraw: boolean;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: FundValues) => void;
}) {
  /*
   * Defaults to whichever direction the operator is actually allowed to use.
   *
   * The two keys are separate and an admin may hold one without the other.
   * Defaulting to 'deposit' regardless would open the dialog on a disabled
   * control for a withdraw-only operator, which reads as the feature being
   * broken rather than as a permission they lack.
   */
  const [direction, setDirection] = React.useState<'deposit' | 'withdraw'>(
    canDeposit ? 'deposit' : 'withdraw',
  );
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reasonAr, setReasonAr] = React.useState('');

  // The same rule the API applies, so the button disables rather than inviting a
  // round trip that will fail. Positive decimals only, up to eight places.
  const ready = isPositiveMoneyInput(amount) && isMoneyReasonReady(reason);
  const allowed = direction === 'deposit' ? canDeposit : canWithdraw;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || !allowed) return;
        const ar = arabicOrNull(reasonAr);
        // A blank Arabic is left out: a client reading Arabic then sees the English.
        onSubmit({
          amount: amount.trim(),
          reason: reason.trim(),
          ...(ar ? { reasonAr: ar } : {}),
          direction,
        });
      }}
    >
      <p className="text-xs text-muted-foreground">
        {t('tradingAccounts.fundFor', { login, currency })}
      </p>

      {/*
        Two buttons rather than a dropdown. The direction is the single most
        consequential field here and is worth being visible at a glance rather
        than one row of a collapsed list.

        NOT coloured destructive, unlike the dealer dialog this replaced. A
        withdrawal here moves money into the client's own wallet rather than out
        of their reach, so painting it as dangerous would overstate it — and an
        operator who learns to expect red on "the risky one" is being trained on
        the wrong signal.
      */}
      <div className="flex gap-2" role="group" aria-label={t('tradingAccounts.fundDirection')}>
        <Button
          type="button"
          size="sm"
          variant={direction === 'deposit' ? 'default' : 'outline'}
          aria-pressed={direction === 'deposit'}
          disabled={!canDeposit}
          onClick={() => setDirection('deposit')}
        >
          {t('tradingAccounts.deposit')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={direction === 'withdraw' ? 'default' : 'outline'}
          aria-pressed={direction === 'withdraw'}
          disabled={!canWithdraw}
          onClick={() => setDirection('withdraw')}
        >
          {t('tradingAccounts.withdraw')}
        </Button>
      </div>

      {/*
        WHAT THIS WILL DO, stated before the amount box rather than as a warning
        after it, and redrawn when the direction flips — the two legs run in the
        opposite order and the destination is what the operator most needs to
        have right.
      */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-foreground">
          {direction === 'deposit' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {currency} {t('tradingAccounts.fundWallet')}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono">{login}</span>
            </>
          ) : (
            <>
              <span className="font-mono">{login}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {currency} {t('tradingAccounts.fundWallet')}
              </span>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {direction === 'deposit'
            ? t('tradingAccounts.fundExplainer', { currency })
            : t('tradingAccounts.withdrawExplainer', { currency })}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fund-amount" className="text-xs">
          {t('tradingAccounts.fundAmount')} ({currency})
        </Label>
        <Input
          id="fund-amount"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          className="font-mono"
          value={amount}
          onChange={(e) => {
            // Digits and one dot. Typed as a STRING throughout and never parsed
            // to a number on the way to the API — see the money rule.
            setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'));
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fund-reason" className="text-xs">
          {t('tradingAccounts.fundReason')}
        </Label>
        <textarea
          id="fund-reason"
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder={t('tradingAccounts.fundReasonPlaceholder')}
          className="focus-outline w-full rounded-lg border border-input bg-card px-3 py-2 text-xs"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          {direction === 'deposit'
            ? t('tradingAccounts.fundReasonHint')
            : t('tradingAccounts.withdrawReasonHint')}
        </p>
      </div>

      <ArabicTextField
        id="fund-reason-ar"
        label={t('arabic.reasonLabel')}
        value={reasonAr}
        onChange={setReasonAr}
        maxLength={500}
        multiline
        rows={2}
        className="focus-outline w-full rounded-lg border border-input bg-card px-3 py-2 text-xs"
      />

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!ready || !allowed}>
          {saving
            ? t('tradingAccounts.fundApplying')
            : direction === 'deposit'
              ? t('tradingAccounts.fundConfirm')
              : t('tradingAccounts.withdrawConfirm')}
        </Button>
      </div>
    </form>
  );
}
