'use client';

import { clientLabel } from '@/components/clients/client-identity';
import * as React from 'react';
import type { WalletRow } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

/**
 * Put money into a client's wallet by hand.
 *
 * ## ⚠️ This is the only control in the console that creates money
 *
 * Every other money action moves or releases funds that already exist: a
 * withdrawal debits, a settle releases, a reject refunds. This one mints a
 * balance from nothing and posts it to a real person's account, so the form is
 * built to slow the operator down at the points where a mistake is expensive.
 *
 * ## Who it credits is FIXED and not editable
 *
 * The client and the currency come from the row the operator opened this from,
 * and are shown read-only. A client PICKER here would put "which account" and
 * "how much" on the same screen with equal weight, and crediting the wrong
 * person is the failure that cannot be undone by editing a field — it needs a
 * compensating entry and a conversation.
 *
 * ## The reason is required by the form as well as the API
 *
 * The server refuses an empty one, but a client-side `required` is what stops
 * the operator discovering that after they have already pressed the button on a
 * money action. It goes into the audit entry AND the client's email, which the
 * hint says plainly — an operator who does not know the client will read it
 * writes a different sentence.
 */
export function CreditWalletModal({
  wallet,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  /** The wallet to credit. Absent closes the modal. */
  wallet?: WalletRow;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: { amount: string; reason: string }) => void;
}) {
  return (
    <Modal open={Boolean(wallet)} onClose={onClose} title={t('wallets.creditTitle')} size="md">
      {/*
        KEYED on the wallet, so opening this for a different client REMOUNTS the
        form and its fields start empty. Without it, an amount typed for one
        client and abandoned would still be in the box when the operator opens
        the next one — on a control that creates money.
      */}
      {wallet && (
        <CreditForm
          key={wallet.id}
          wallet={wallet}
          saving={saving}
          error={error}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Modal>
  );
}

function CreditForm({
  wallet,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  wallet: WalletRow;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: { amount: string; reason: string }) => void;
}) {
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');

  /*
   * Name, else email, else the Portal ID — and the last one is why this uses
   * the shared helper. Both name fields and the email are maskable (RBAC-03)
   * and arrive UNDEFINED for a role that hides them, so this chain produced an
   * EMPTY owner on a dialog that CREDITS A WALLET. An operator was asked to
   * confirm money into an account belonging to nobody they could identify.
   */
  const owner = clientLabel(wallet.user);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ amount: amount.trim(), reason: reason.trim() });
      }}
      className="space-y-4"
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/*
        WHO and WHAT, read-only and stated first. The operator has to see the
        account they are about to credit before they see the box that decides
        how much — and the balance is shown so "add 250" can be sanity-checked
        against what is already there.
      */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t('wallets.creditClient')}</span>
          <span className="font-medium text-foreground">{owner}</span>
        </div>
        {/*
          WHICH wallet, by number. Owner + currency was ambiguous the moment a
          partner holds a main and a commission wallet in the same currency —
          and this is the control that creates money in one of them.
        */}
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t('wallets.creditWalletNumber')}</span>
          <span className="font-mono font-medium text-foreground">{wallet.walletNumber}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t('wallets.creditCurrentBalance')}</span>
          {/* Formatted, not coerced — this is a figure the operator reads to
              sanity-check "add 250" against, so it should look like the wallets
              list they came from rather than a raw 8dp column. */}
          <span className="font-mono font-semibold text-foreground">
            {formatMoney(wallet.balance, wallet.currency)}
          </span>
        </div>
      </div>

      <label className="space-y-1.5 block">
        <span className="text-xs font-semibold text-foreground">
          {t('wallets.creditAmount', { currency: wallet.currency })}
        </span>
        {/*
          `inputMode="decimal"` and a PATTERN, not `type="number"`.

          A number input hands back a JS number and brings a spinner that a
          stray scroll can change — on a field that decides how much money to
          create. Money is a decimal STRING end to end (§6.1); the pattern is
          the same shape the API's validator enforces, so the browser refuses
          what the server would refuse, before the request.
        */}
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          inputMode="decimal"
          pattern="\d{1,20}(\.\d{1,8})?"
          placeholder="250.00"
          autoComplete="off"
          className="focus-outline flex h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-sm"
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('wallets.creditAmountHint')}
        </span>
      </label>

      <label className="space-y-1.5 block">
        <span className="text-xs font-semibold text-foreground">{t('wallets.creditReason')}</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder={t('wallets.creditReasonPlaceholder')}
          className="focus-outline w-full rounded-lg border border-input bg-card px-3 py-2 text-xs"
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('wallets.creditReasonHint')}
        </span>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="focus-outline inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="focus-outline inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('wallets.crediting') : t('wallets.creditConfirm')}
        </button>
      </div>
    </form>
  );
}
