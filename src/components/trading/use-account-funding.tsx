'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote } from 'lucide-react';
import api from '@/lib/api';
import type { TradingAccountRow } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import type { RowAction } from '@/components/row-actions';
import { FundAccountModal } from '@/components/trading/fund-account-modal';
import { apiErrorMessage } from '@/lib/api/errors';
import { newIdempotencyKey } from '@/lib/api/client';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Moving money on a trading account — the permission gate, the mutation and the
 * dialog — for every screen that lists accounts: the Trading accounts desk and a
 * partner's "Referred accounts" tab (owner, 26 Sep 2026). Moved verbatim from
 * `trading-accounts/page.tsx`, whose notes it keeps.
 *
 * Returns the gate (`canMoveMoney`, `canFund(row)`), the row-menu entry
 * (`action(row)`) and the dialog to render once per screen (`dialog`).
 */
export function useAccountFunding() {
  const { admin } = useAdmin();
  const canDeposit = hasPermission(admin, 'trading.deposit');
  const canWithdraw = hasPermission(admin, 'trading.withdraw');
  /*
   * ── The money control, and the two keys are NOT symmetric ────────────────
   *
   * A DEPOSIT mints balance into a wallet and then moves it onto the account,
   * so it needs `wallets.credit` (the key that governs minting) as well as
   * `trading.deposit`. A WITHDRAWAL mints nothing — it moves money the client
   * already has off their account into their own wallet — so `trading.withdraw`
   * alone is the right gate, and requiring `wallets.credit` for it would mean
   * granting the power to create money in order to take some away.
   *
   * The service asserts the same pair. This only decides whether to offer a
   * control that would otherwise always 403.
   */
  const canFundIn = hasPermission(admin, 'wallets.credit') && canDeposit;
  const canFundOut = canWithdraw;
  const canMoveMoney = canFundIn || canFundOut;

  const [funding, setFunding] = React.useState<TradingAccountRow | null>(null);
  const [fundError, setFundError] = React.useState<string | undefined>(undefined);
  /*
   * The key of the funding being entered, minted when the dialog OPENS (per
   * direction, below). It was derived from the account's cached balance, and
   * that balance is a MIRROR the bridge updates later — so a second deliberate
   * funding made before the mirror moved (or after the balance returned to the
   * same figure) reused the first one's key, the server REPLAYED it, and no
   * money moved while the toast said it had.
   */
  const [fundKey, setFundKey] = React.useState('');

  const queryClient = useQueryClient();

  /*
   * Funding writes a DEPOSIT and a TRANSFER, so it moves rather more than this
   * page shows: the wallet balance, the client's transaction history, the
   * ledger, and the account's own cached balance column.
   */
  const fund = useMutation({
    mutationFn: (values: { amount: string; reason: string; direction: 'deposit' | 'withdraw' }) =>
      api.admin.fundTradingAccount(
        funding!.id,
        values,
        /*
         * ONE key per intended funding: minted when the dialog opens, so a
         * retry of the same submission reuses it while a second, deliberate
         * funding gets a new one. The direction stays in it, so switching
         * deposit/withdraw inside one dialog is a different intent.
         *
         * The server stores it as the deposit's `provider_ref`, so this is what
         * makes a double-click credit once in the DATABASE rather than only in
         * a cache.
         */
        `fund:${values.direction}:${fundKey}`,
      ),
    onSuccess: (result, values) => {
      const account = funding;
      setFunding(null);
      setFundError(undefined);

      void queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
      void queryClient.invalidateQueries({ queryKey: keys.transactions.all() });
      void queryClient.invalidateQueries({ queryKey: keys.ledger.all() });
      void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
      void queryClient.invalidateQueries({ queryKey: keys.clients.all() });

      /*
       * THE HALF-DONE CASE GETS ITS OWN MESSAGE, and it is not an error toast.
       *
       * A failed onward transfer does NOT unwind the deposit, so the money is
       * genuinely in the client's wallet. Reporting a bare failure here would
       * send the operator to fund it a second time — which would work, and
       * would leave the client credited twice.
       */
      if (result.transferError) {
        toastSuccess(
          t('tradingAccounts.fundPartial', {
            amount: `${values.amount} ${account?.currency ?? ''}`,
            error: result.transferError,
          }),
        );
        return;
      }

      toastSuccess(
        t(values.direction === 'deposit' ? 'tradingAccounts.funded' : 'tradingAccounts.withdrawn', {
          amount: `${values.amount} ${account?.currency ?? ''}`,
          login: account?.login ?? '',
        }),
        // Worth surfacing rather than hiding: the key replayed an earlier
        // funding, so the operator's click moved no money. "Already added" and
        // "just added" look identical otherwise.
        result.replayed ? t('tradingAccounts.fundReplayed') : undefined,
      );
    },
    onError: (e: unknown) => setFundError(apiErrorMessage(e, t('tradingAccounts.fundFailed'))),
  });

  /*
   * LIVE accounts with a login, active — see the Trading accounts desk. A demo
   * account trades practice money against no wallet, and one awaiting its
   * login has nothing to fund yet.
   */
  // An account with no client (found on MT5 by the sync) has no wallet to fund from or to.
  const canFund = (a: TradingAccountRow) =>
    Boolean(a.user && a.login && a.status === 'active' && a.environment === 'live');

  const action = (a: TradingAccountRow): RowAction => ({
    label: t('tradingAccounts.fundAction'),
    icon: Banknote,
    onSelect: () => {
      setFundError(undefined);
      setFundKey(newIdempotencyKey());
      setFunding(a);
    },
  });

  const dialog = funding ? (
    <FundAccountModal
      open
      onClose={() => {
        setFunding(null);
        setFundError(undefined);
      }}
      login={funding.login ?? ''}
      currency={funding.currency}
      canDeposit={canFundIn}
      canWithdraw={canFundOut}
      saving={fund.isPending}
      error={fundError}
      onSubmit={(values) => fund.mutate(values)}
    />
  ) : null;

  return { canMoveMoney, canFund, action, dialog };
}
