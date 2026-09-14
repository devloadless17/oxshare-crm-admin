'use client';

import * as React from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

/**
 * Add money to a client's trading account, the way money actually gets there.
 *
 * ## TWO movements, and the dialog says so before the amount box
 *
 * A deposit into the client's wallet, then a transfer of the same amount to this
 * account. That is not an implementation detail the operator can be left to
 * infer: it is what they will see afterwards on the client's statement, in the
 * ledger and in the financial reports, and an operator who expected one row and
 * finds two will read it as a double credit.
 *
 * ## ⚠️ NOT the same control as "Adjust balance on MT5"
 *
 * `AdjustBalanceModal` is a DEALER operation — it moves the MT5 balance alone,
 * with no wallet leg and no ledger entry, which is right for a correction or a
 * bonus and wrong for funding. The two sit next to each other in the same row
 * menu, so each one's copy has to name what the other does; a warning that only
 * says "this is careful" on both leaves the operator to guess which is which.
 *
 * ## Who is funded is FIXED and not editable
 *
 * The account, its owner and the currency all come from the row this was opened
 * from, and the currency is not sent at all — the server derives it, because
 * transfers do not convert and the wallet leg MUST match the account. Funding
 * the wrong account is the mistake that needs a compensating entry rather than
 * an edit, so there is no picker here.
 */
export function FundAccountModal({
  open,
  onClose,
  login,
  currency,
  saving,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  login: string;
  currency: string;
  saving: boolean;
  error?: string;
  onSubmit: (values: { amount: string; reason: string }) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={t('tradingAccounts.fundTitle')}>
      {/*
        KEYED on the account, so opening this for a different row REMOUNTS the
        form and its fields start empty. Without it, an amount typed for one
        client and abandoned would still be in the box when the operator opens
        the next one — on a control that creates money.
      */}
      {open && (
        <FundForm
          key={login}
          login={login}
          currency={currency}
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
  saving,
  error,
  onClose,
  onSubmit,
}: {
  login: string;
  currency: string;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: { amount: string; reason: string }) => void;
}) {
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');

  // The same rule the API applies, so the button disables rather than inviting a
  // round trip that will fail. Positive decimals only, up to eight places.
  const amountValid = /^\d+(\.\d{1,8})?$/.test(amount.trim()) && Number.parseFloat(amount) > 0;
  const ready = amountValid && reason.trim().length >= 3;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSubmit({ amount: amount.trim(), reason: reason.trim() });
      }}
    >
      <p className="text-xs text-muted-foreground">
        {t('tradingAccounts.fundFor', { login, currency })}
      </p>

      {/*
        WHAT THIS WILL DO, stated before the amount box rather than as a warning
        after it. The operator is choosing between this and the dealer
        adjustment in the same menu, and the two legs are the distinguishing
        fact — so it is drawn as the flow it is, not buried in a sentence.
      */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {t('tradingAccounts.deposit')} · {currency}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-mono">{login}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('tradingAccounts.fundExplainer', { currency })}
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
        <p className="text-[11px] text-muted-foreground">{t('tradingAccounts.fundReasonHint')}</p>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!ready}>
          {saving ? t('tradingAccounts.fundApplying') : t('tradingAccounts.fundConfirm')}
        </Button>
      </div>
    </form>
  );
}
