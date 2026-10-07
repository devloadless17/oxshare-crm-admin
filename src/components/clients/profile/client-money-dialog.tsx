'use client';

import * as React from 'react';
import Decimal from 'decimal.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  ClientRef,
  TradingAccountListResponse,
  TradingAccountRow,
  WalletListResponse,
  WalletRow,
} from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { ArabicTextField, arabicOrNull } from '@/components/arabic-text-field';
import { apiErrorMessage } from '@/lib/api/errors';
import { newIdempotencyKey } from '@/lib/api/client';
import { toastSuccess } from '@/lib/toast';
import { formatMoney } from '@/lib/money';
import { isMoneyReasonReady, isPositiveMoneyInput } from '@/lib/money-input';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The desk's hand movements on one client, from the profile's Transactions tab
 * (owner, 7 Oct 2026): Deposit, Withdraw and Transfer.
 *
 * Every choice names WHERE THE MONEY COMES FROM and WHERE IT GOES, because
 * that is the question the owner asked to be explicit:
 *
 * | Action   | Into / out of     | From / to        | Endpoint                         |
 * | -------- | ----------------- | ---------------- | -------------------------------- |
 * | Deposit  | wallet            | the system       | POST /admin/wallets/credit       |
 * | Deposit  | trading account   | the system       | /fund deposit, source=system     |
 * | Deposit  | trading account   | the wallet       | /fund deposit, source=wallet     |
 * | Withdraw | wallet            | the system       | POST /admin/wallets/debit        |
 * | Withdraw | trading account   | the wallet       | /fund withdraw, source=wallet    |
 * | Withdraw | trading account   | the system       | /fund withdraw, source=system    |
 * | Transfer | wallet → account  |                  | /fund deposit, source=wallet     |
 * | Transfer | account → wallet  |                  | /fund withdraw, source=wallet    |
 *
 * "The system" means money entering or leaving the platform; "the wallet" is
 * the client's own wallet in the account's currency. Each option is offered
 * only to an admin holding the keys its endpoint asserts — the API still
 * enforces them. ONE idempotency key per opening of the dialog, with the
 * intent in it, so a double-click moves money once and a changed choice is a
 * different movement.
 */

export type MoneyAction = 'deposit' | 'withdraw' | 'transfer';
type Target = 'wallet' | 'account';
type Source = 'system' | 'wallet';
type Way = 'toAccount' | 'toWallet';

export function useClientMoneyPermissions() {
  const { admin } = useAdmin();
  const credit = hasPermission(admin, 'wallets.credit');
  const debit = hasPermission(admin, 'wallets.debit');
  const tradingIn = hasPermission(admin, 'trading.deposit');
  const tradingOut = hasPermission(admin, 'trading.withdraw');
  return {
    depositWallet: credit,
    depositAccountSystem: credit && tradingIn,
    depositAccountWallet: tradingIn,
    withdrawWallet: debit,
    withdrawAccountWallet: tradingOut,
    withdrawAccountSystem: tradingOut && debit,
    transferToAccount: tradingIn,
    transferToWallet: tradingOut,
    get deposit() {
      return this.depositWallet || this.depositAccountSystem || this.depositAccountWallet;
    },
    get withdraw() {
      return this.withdrawWallet || this.withdrawAccountWallet || this.withdrawAccountSystem;
    },
    get transfer() {
      return this.transferToAccount || this.transferToWallet;
    },
  };
}

export function ClientMoneyDialog({
  action,
  userId,
  onClose,
}: {
  /** Null closes the dialog. */
  action: MoneyAction | null;
  userId: ClientRef;
  onClose: () => void;
}) {
  const title =
    action === 'deposit'
      ? t('clientMoney.depositTitle')
      : action === 'withdraw'
        ? t('clientMoney.withdrawTitle')
        : t('clientMoney.transferTitle');
  return (
    <Modal open={action !== null} onClose={onClose} title={title} size="md">
      {/* Keyed on the action, so each opening starts empty with a fresh key. */}
      {action && <MoneyForm key={action} action={action} userId={userId} onClose={onClose} />}
    </Modal>
  );
}

function MoneyForm({
  action,
  userId,
  onClose,
}: {
  action: MoneyAction;
  userId: ClientRef;
  onClose: () => void;
}) {
  const can = useClientMoneyPermissions();
  const queryClient = useQueryClient();
  const [baseKey] = React.useState(() => newIdempotencyKey());

  const walletParams = { userId, limit: 100, page: 1 };
  const wallets = useResource<WalletListResponse>(keys.wallets.list(walletParams), (signal) =>
    api.admin.getWallets(walletParams, signal),
  );
  const accountParams = { userId, limit: 100, page: 1, environment: 'live' as const };
  const accounts = useResource<TradingAccountListResponse>(
    keys.tradingAccounts.list(accountParams),
    (signal) => api.admin.getTradingAccounts(accountParams, signal),
  );

  const mainWallets = (wallets.data?.items ?? []).filter((w) => w.kind === 'main');
  const liveAccounts = (accounts.data?.items ?? []).filter(
    (a) => a.status === 'active' && a.environment === 'live' && a.login,
  );

  // The choices, defaulted to the first one this admin may make.
  const [target, setTarget] = React.useState<Target>(() =>
    action === 'deposit'
      ? can.depositWallet
        ? 'wallet'
        : 'account'
      : action === 'withdraw'
        ? can.withdrawWallet
          ? 'wallet'
          : 'account'
        : 'account',
  );
  const [source, setSource] = React.useState<Source>(() =>
    action === 'deposit'
      ? can.depositAccountSystem
        ? 'system'
        : 'wallet'
      : can.withdrawAccountWallet
        ? 'wallet'
        : 'system',
  );
  const [way, setWay] = React.useState<Way>(() =>
    can.transferToAccount ? 'toAccount' : 'toWallet',
  );
  const [walletId, setWalletId] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reasonAr, setReasonAr] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const wallet: WalletRow | undefined =
    mainWallets.find((w) => w.id === walletId) ?? mainWallets[0];
  const account: TradingAccountRow | undefined =
    liveAccounts.find((a) => a.id === accountId) ?? liveAccounts[0];
  // The client's wallet on the account's side of a move — same currency, transfers do not convert.
  const accountWallet = account
    ? mainWallets.find((w) => w.currency === account.currency)
    : undefined;

  const usesAccount = action === 'transfer' || target === 'account';

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        amount: amount.trim(),
        reason: reason.trim(),
        reasonAr: arabicOrNull(reasonAr) ?? undefined,
      };
      if (!usesAccount) {
        if (!wallet) throw new Error(t('clientMoney.noWallet'));
        const key = `${action}:wallet:${wallet.id}:${baseKey}`;
        const walletBody = { ...body, userId, currency: wallet.currency };
        return action === 'deposit'
          ? { kind: 'wallet' as const, result: await api.admin.creditWallet(walletBody, key) }
          : { kind: 'wallet' as const, result: await api.admin.debitWallet(walletBody, key) };
      }
      if (!account) throw new Error(t('clientMoney.noAccount'));
      const direction =
        action === 'transfer'
          ? way === 'toAccount'
            ? 'deposit'
            : 'withdraw'
          : action === 'deposit'
            ? 'deposit'
            : 'withdraw';
      const src: Source = action === 'transfer' ? 'wallet' : source;
      const key = `${action}:${direction}:${src}:${account.id}:${baseKey}`;
      return {
        kind: 'account' as const,
        result: await api.admin.fundTradingAccount(
          account.id,
          { ...body, direction, source: src },
          key,
        ),
      };
    },
    onSuccess: (outcome) => {
      for (const key of [
        keys.transactions.all(),
        keys.wallets.all(),
        keys.tradingAccounts.all(),
        keys.ledger.all(),
        keys.clients.all(),
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const currency = usesAccount ? (account?.currency ?? '') : (wallet?.currency ?? '');
      const money = formatMoney(amount.trim(), currency);
      if (outcome.kind === 'account' && outcome.result.transferError) {
        // Half-done, not failed: the money is safe in the wallet. Never invite a second try.
        toastSuccess(
          t('clientMoney.partial', { amount: money, error: outcome.result.transferError }),
        );
      } else {
        toastSuccess(
          t('clientMoney.done', { amount: money }),
          outcome.result.replayed ? t('tradingAccounts.fundReplayed') : undefined,
        );
      }
      onClose();
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('clientMoney.failed'))),
  });

  /* ── what each choice offers, filtered by what this admin may do ───────── */
  const targetOptions: { value: Target; label: string; allowed: boolean }[] =
    action === 'deposit'
      ? [
          { value: 'wallet', label: t('clientMoney.toWallet'), allowed: can.depositWallet },
          {
            value: 'account',
            label: t('clientMoney.toAccount'),
            allowed: can.depositAccountSystem || can.depositAccountWallet,
          },
        ]
      : [
          { value: 'wallet', label: t('clientMoney.fromWallet'), allowed: can.withdrawWallet },
          {
            value: 'account',
            label: t('clientMoney.fromAccount'),
            allowed: can.withdrawAccountWallet || can.withdrawAccountSystem,
          },
        ];
  const sourceOptions: { value: Source; label: string; hint: string; allowed: boolean }[] =
    action === 'deposit'
      ? [
          {
            value: 'system',
            label: t('clientMoney.sourceSystem'),
            hint: t('clientMoney.sourceSystemHint'),
            allowed: can.depositAccountSystem,
          },
          {
            value: 'wallet',
            label: t('clientMoney.sourceWallet'),
            hint: t('clientMoney.sourceWalletHint'),
            allowed: can.depositAccountWallet,
          },
        ]
      : [
          {
            value: 'wallet',
            label: t('clientMoney.destWallet'),
            hint: t('clientMoney.destWalletHint'),
            allowed: can.withdrawAccountWallet,
          },
          {
            value: 'system',
            label: t('clientMoney.destSystem'),
            hint: t('clientMoney.destSystemHint'),
            allowed: can.withdrawAccountSystem,
          },
        ];
  const wayOptions: { value: Way; label: string; allowed: boolean }[] = [
    { value: 'toAccount', label: t('clientMoney.wayToAccount'), allowed: can.transferToAccount },
    { value: 'toWallet', label: t('clientMoney.wayToWallet'), allowed: can.transferToWallet },
  ];

  /* ── the figure the amount is checked against, where one is known ───────── */
  const available = (w: WalletRow | undefined) =>
    w ? new Decimal(w.balance).minus(new Decimal(w.onHold)) : null;
  const ceiling: { value: Decimal; currency: string } | null = (() => {
    const fromWallet =
      (action === 'withdraw' && target === 'wallet') ||
      (action === 'deposit' && target === 'account' && source === 'wallet') ||
      (action === 'transfer' && way === 'toAccount');
    if (fromWallet) {
      const w = usesAccount ? accountWallet : wallet;
      const value = available(w);
      return value && w ? { value, currency: w.currency } : null;
    }
    return null;
  })();
  const amountOk = isPositiveMoneyInput(amount);
  const overCeiling =
    amountOk && ceiling !== null && new Decimal(amount.trim()).greaterThan(ceiling.value);
  const ready =
    amountOk &&
    !overCeiling &&
    isMoneyReasonReady(reason) &&
    (usesAccount ? Boolean(account) : Boolean(wallet));

  const loading = wallets.status === 'loading' || accounts.status === 'loading';

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !submit.isPending) {
          setError(undefined);
          submit.mutate();
        }
      }}
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {action === 'transfer' ? (
        <Choice
          legend={t('clientMoney.way')}
          name="money-way"
          value={way}
          onChange={(v) => setWay(v as Way)}
          options={wayOptions}
        />
      ) : (
        <Choice
          legend={action === 'deposit' ? t('clientMoney.into') : t('clientMoney.outOf')}
          name="money-target"
          value={target}
          onChange={(v) => setTarget(v as Target)}
          options={targetOptions}
        />
      )}

      {/* Which wallet, or which trading account. */}
      {!usesAccount ? (
        <Picker
          label={t('clientMoney.wallet')}
          value={wallet?.id ?? ''}
          onChange={setWalletId}
          empty={loading ? t('common.loading') : t('clientMoney.noWallet')}
          options={mainWallets.map((w) => ({
            value: w.id,
            label: `${w.currency} · ${w.walletNumber}`,
            detail: t('clientMoney.walletAvailable', {
              amount: formatMoney(available(w)!.toFixed(8), w.currency),
            }),
          }))}
        />
      ) : (
        <Picker
          label={t('clientMoney.account')}
          value={account?.id ?? ''}
          onChange={setAccountId}
          empty={loading ? t('common.loading') : t('clientMoney.noAccount')}
          options={liveAccounts.map((a) => ({
            value: a.id,
            label: `#${a.login} · ${a.currency}${a.product ? ` · ${a.product}` : ''}`,
            detail: t('clientMoney.accountBalance', {
              amount: formatMoney(a.balance, a.currency),
            }),
          }))}
        />
      )}

      {action !== 'transfer' && target === 'account' && (
        <Choice
          legend={action === 'deposit' ? t('clientMoney.from') : t('clientMoney.to')}
          name="money-source"
          value={source}
          onChange={(v) => setSource(v as Source)}
          options={sourceOptions}
        />
      )}

      {usesAccount && account && (
        <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          {accountWallet
            ? t('clientMoney.accountWalletLine', {
                currency: account.currency,
                amount: formatMoney(available(accountWallet)!.toFixed(8), account.currency),
              })
            : t('clientMoney.accountWalletNone', { currency: account.currency })}
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('clientMoney.amount', {
            currency: (usesAccount ? account?.currency : wallet?.currency) ?? '',
          })}
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          inputMode="decimal"
          pattern="\d{1,20}(\.\d{1,8})?"
          placeholder="250.00"
          autoComplete="off"
          aria-label={t('clientMoney.amountLabel')}
          className="focus-outline flex h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-sm"
        />
        {overCeiling && ceiling && (
          <span role="alert" className="block text-[11px] text-destructive">
            {t('clientMoney.overAvailable', {
              amount: formatMoney(ceiling.value.toFixed(8), ceiling.currency),
            })}
          </span>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('clientMoney.reason')}</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={500}
          rows={2}
          placeholder={t('clientMoney.reasonPlaceholder')}
          className="focus-outline w-full rounded-lg border border-input bg-card px-3 py-2 text-xs"
        />
      </label>

      <ArabicTextField
        id="client-money-reason-ar"
        label={t('arabic.reasonLabel')}
        value={reasonAr}
        onChange={setReasonAr}
        maxLength={500}
        multiline
        rows={2}
        className="focus-outline w-full rounded-lg border border-input bg-card px-3 py-2 text-xs"
      />

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={submit.isPending}
          className="focus-outline inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={submit.isPending || !ready}
          className="focus-outline inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submit.isPending
            ? t('common.saving')
            : action === 'deposit'
              ? t('clientMoney.depositConfirm')
              : action === 'withdraw'
                ? t('clientMoney.withdrawConfirm')
                : t('clientMoney.transferConfirm')}
        </button>
      </div>
    </form>
  );
}

function Choice({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; hint?: string; allowed: boolean }[];
}) {
  const shown = options.filter((o) => o.allowed);
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-xs font-semibold text-foreground">{legend}</legend>
      <div className={`grid gap-2 ${shown.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {shown.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
              value === o.value ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              {o.hint && <span className="block text-[11px] text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; detail: string }[];
  empty: string;
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-outline flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} — {o.detail}
          </option>
        ))}
      </select>
    </label>
  );
}
