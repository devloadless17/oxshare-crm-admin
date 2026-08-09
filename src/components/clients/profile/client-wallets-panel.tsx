'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wallet } from 'lucide-react';
import api from '@/lib/api';
import type { Currency, WalletListResponse, WalletRow } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreditWalletModal } from '@/components/wallets/credit-wallet-modal';
import { EmptySection, ProfileCard } from './profile-cards';
import { t } from '@/lib/i18n';
import { formatMoney, isZeroMoney } from '@/lib/money';

/**
 * A client's wallets, on their profile — with the three things an operator can
 * do to one.
 *
 * ## Why this is its own panel rather than a field on the profile
 *
 * `GET /admin/clients/:id` does not return wallets, and it should not: the
 * profile is identity and compliance, wallets are money, and they are guarded by
 * different permissions. Fetching them separately means a client without
 * `wallets.view` sees the profile it is entitled to rather than a failed page.
 *
 * ## Each action is gated on its OWN permission
 *
 * `wallets.credit` mints balance from nothing; `wallets.manage` opens and closes
 * an empty container. They are deliberately different keys — see the API — so
 * the panel checks each independently rather than showing all three to anyone
 * with either. A control that appears and then 403s is worse than one that never
 * appeared.
 */
export function ClientWalletsPanel({ userId }: { userId: string }) {
  const { admin } = useAdmin();
  const queryClient = useQueryClient();

  /*
   * `wallets.manage` was one of the three keys the API enforced and no catalog
   * listed, so no role could ever hold it — opening and closing a wallet were
   * master-admin-only by accident rather than by decision. They are two keys
   * now, and both are grantable.
   */
  const canOpen = hasPermission(admin, 'wallets.create');
  const canClose = hasPermission(admin, 'wallets.delete');
  const canManage = canOpen || canClose;
  const canCredit = hasPermission(admin, 'wallets.credit');

  /*
   * `limit: 100` and no pager. A client holds one wallet per currency the
   * platform offers — single figures, not a list that needs paging — and a pager
   * inside a profile card would be chrome around three rows.
   */
  const params = { userId, limit: 100, page: 1 };
  const wallets = useResource<WalletListResponse>(['admin', 'wallets', params], (signal) =>
    api.admin.getWallets(params, signal),
  );

  const currencies = useResource<Currency[]>(['admin', 'currencies'], (signal) =>
    api.admin.getCurrencies(signal),
  );

  const confirm = useConfirm();

  /*
   * The credit modal's OWN error, and nothing else's.
   *
   * This used to be one `error` string shared by all three mutations and
   * rendered as a banner at the top of the card. Open and close now report
   * through toasts, which is where a result belongs when the control that
   * produced it is a button in a list — the banner sat above the list and was
   * easy to miss on a long profile, and it outlived the action that raised it.
   * The credit modal keeps an inline message because it stays OPEN on failure,
   * and a refusal has to be read where the amount can be corrected.
   */
  const [creditError, setCreditError] = React.useState<string | undefined>();
  const [crediting, setCrediting] = React.useState<WalletRow | undefined>();
  const [newCurrency, setNewCurrency] = React.useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
  };

  const open = useMutation({
    mutationFn: (currency: string) => api.admin.openWallet({ userId, currency }),
    onSuccess: (_data, currency) => {
      setNewCurrency('');
      refresh();
      toastSuccess(t('wallets.openSucceeded', { currency }));
    },
    onError: (e) => toastError(e, t('clientProfile.walletOpenFailed')),
  });

  const close = useMutation({
    mutationFn: (wallet: WalletRow) => api.admin.closeWallet(wallet.id),
    onSuccess: (_data, wallet) => {
      refresh();
      toastSuccess(t('wallets.closeSucceeded', { currency: wallet.currency }));
    },
    /*
     * The API's OWN message, not a generic one. A close is refused for four
     * different reasons — a balance, funds on hold, history, or not found — and
     * each names the figure or the count. Replacing that with "could not close"
     * would throw away the only thing that tells the operator what to do next.
     * `toastError` passes the fallback for the case where the API returned no
     * message at all, and prefers the API's own whenever there is one.
     */
    onError: (e) => toastError(e, t('clientProfile.walletCloseFailed')),
  });

  const credit = useMutation({
    mutationFn: (values: { amount: string; reason: string }) =>
      api.admin.creditWallet(
        {
          userId,
          amount: values.amount,
          currency: crediting!.currency,
          reason: values.reason,
        },
        // One key per intended credit — see the wallets list page for why this
        // is derived from the balance rather than minted per attempt.
        `credit:${crediting!.id}:${crediting!.balance}`,
      ),
    onSuccess: (_data, values) => {
      const wallet = crediting;
      setCrediting(undefined);
      setCreditError(undefined);
      refresh();
      toastSuccess(
        t('wallets.creditSucceeded', {
          amount: formatMoney(values.amount, wallet?.currency ?? 'USD'),
        }),
      );
    },
    // Inline only — the modal stays open, and one refusal reported twice reads
    // as two failures.
    onError: (e) => setCreditError(apiErrorMessage(e, t('wallets.creditFailed'))),
  });

  /**
   * Closing a wallet from here asked NOTHING before doing it.
   *
   * The wallets list page has always confirmed — same action, same API call,
   * behind a dialog naming the currency and the client. This panel fired on the
   * first click of a 28px icon button sitting directly beside "Add funds". The
   * API refuses to close a wallet with a balance, funds on hold or any history,
   * so the blast radius was bounded; that is a backstop, not a reason to skip
   * asking, and it does not cover the case this is most likely to hit — an
   * empty wallet the client is about to deposit into.
   */
  const requestClose = async (wallet: WalletRow) => {
    const ok = await confirm({
      title: t('wallets.closeConfirmTitle', { currency: wallet.currency }),
      description: t('wallets.closeConfirmBody', { email: wallet.user.email ?? '—' }),
      confirmLabel: t('wallets.closeConfirm'),
      destructive: true,
    });
    if (ok) close.mutate(wallet);
  };

  const rows = wallets.data?.items ?? [];
  const held = new Set(rows.map((w) => w.currency));
  /*
   * Only currencies the client does NOT already hold, and only enabled ones.
   * Offering a duplicate would be a control whose success is a no-op (the API is
   * idempotent), which reads as the button not working.
   */
  const openable = (currencies.data ?? []).filter((c) => c.enabled && !held.has(c.code));

  return (
    <ProfileCard title={t('clientProfile.walletsTitle')}>
      {rows.length === 0 ? (
        <EmptySection message={t('clientProfile.noWallets')} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-mono text-xs font-semibold">{w.currency}</div>
                  {/*
                    FORMATTED through decimal.js, never coerced (§6.1) — the
                    same treatment as the wallets list, so a balance reads the
                    same on both screens.

                    `isZeroMoney` rather than `!== '0.00000000'`: the second is a
                    string comparison that breaks the moment the API answers '0'
                    or '0.0', and it would then render "· 0 held" on every wallet.
                  */}
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {formatMoney(w.balance, w.currency)}
                    {!isZeroMoney(w.onHold) && (
                      <span title={t('wallets.onHoldNote')}>
                        {' '}
                        · {formatMoney(w.onHold, w.currency)} held
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {canCredit && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreditError(undefined);
                      setCrediting(w);
                    }}
                    className="focus-outline inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    {t('wallets.creditAction')}
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void requestClose(w)}
                    disabled={close.isPending}
                    /*
                      Named per WALLET, not "Close". Several identical buttons
                      down a list announce as "button" to a screen reader with
                      nothing to say which currency each one closes.
                    */
                    aria-label={t('clientProfile.walletClose', { currency: w.currency })}
                    title={t('clientProfile.walletCloseHint')}
                    className="focus-outline inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && openable.length > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Select value={newCurrency} onValueChange={setNewCurrency}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label={t('clientProfile.walletOpen')}>
              <SelectValue placeholder={t('clientProfile.walletCurrencyPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {openable.map((c) => (
                <SelectItem key={c.code} value={c.code} className="text-xs">
                  {c.code} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => open.mutate(newCurrency)}
            // Disabled until a currency is chosen: the API would refuse an empty
            // one, and discovering that through a 400 is a worse way to learn it.
            disabled={!newCurrency || open.isPending}
            className="focus-outline inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {open.isPending ? t('clientProfile.walletOpening') : t('clientProfile.walletOpen')}
          </button>
        </div>
      )}

      <CreditWalletModal
        wallet={crediting}
        saving={credit.isPending}
        error={credit.isError ? creditError : undefined}
        onClose={() => setCrediting(undefined)}
        onSubmit={(values) => credit.mutate(values)}
      />
    </ProfileCard>
  );
}
