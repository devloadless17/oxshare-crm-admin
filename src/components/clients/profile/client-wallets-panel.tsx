'use client';

import { clientLabel } from '@/components/clients/client-identity';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wallet } from 'lucide-react';
import api from '@/lib/api';
import type { Currency, WalletListResponse, WalletRow } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { newIdempotencyKey } from '@/lib/api/client';
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
import { CopyableId } from '@/components/copyable-id';
import { CreditWalletModal } from '@/components/wallets/credit-wallet-modal';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, type RowAction } from '@/components/row-actions';
import { t } from '@/lib/i18n';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { keys } from '@/lib/query-keys';

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
export function ClientWalletsPanel({ userId }: { userId: ClientRef }) {
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
  const wallets = useResource<WalletListResponse>(keys.wallets.list(params), (signal) =>
    api.admin.getWallets(params, signal),
  );

  const currencies = useResource<Currency[]>(keys.currencies.all(), (signal) =>
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
  // Minted when the dialog opens — see `creditKey` on the wallets list page.
  const [creditKey, setCreditKey] = React.useState('');
  const [newCurrency, setNewCurrency] = React.useState('');

  /*
   * A credit here writes a transaction and a ledger entry as well as moving
   * the balance — and on THIS screen the client's transactions tab is one
   * click away from the panel that did it, so a wallets-only invalidate left
   * an operator looking straight at the omission.
   */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
    void queryClient.invalidateQueries({ queryKey: keys.clients.all() });
    void queryClient.invalidateQueries({ queryKey: keys.transactions.all() });
    void queryClient.invalidateQueries({ queryKey: keys.ledger.all() });
    void queryClient.invalidateQueries({ queryKey: keys.reconciliation.all() });
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
        // One key per intended credit, minted when the dialog opens and reused
        // by retries inside it — see `creditKey` on the wallets list page.
        creditKey,
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
      description: t('wallets.closeConfirmBody', { email: clientLabel(wallet.user) }),
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

  /*
   * The row's actions, as a MENU rather than two controls in the cell.
   *
   * "Add funds" and the close button sat side by side, a text button next to a
   * 28px destructive icon — the shape that made an accidental close plausible
   * enough to need a confirmation bolted on. A menu puts them behind one
   * deliberate trigger, gives the destructive item its own styling and a
   * separator, and stops the row growing a third control the day another action
   * is added.
   */
  const actionsFor = (wallet: WalletRow): RowAction[] => [
    ...(canCredit
      ? [
          {
            label: t('wallets.creditAction'),
            icon: Plus,
            onSelect: () => {
              setCreditError(undefined);
              setCreditKey(newIdempotencyKey());
              setCrediting(wallet);
            },
          },
        ]
      : []),
    ...(canClose
      ? [
          {
            label: t('clientProfile.walletCloseAction'),
            icon: Trash2,
            destructive: true,
            separatorBefore: canCredit,
            onSelect: () => void requestClose(wallet),
          },
        ]
      : []),
  ];

  const columns: Column<WalletRow>[] = [
    {
      /*
       * THE NAME, with the code under it.
       *
       * This panel rendered the code alone, so a PARTNER — who holds a main USD
       * wallet and a commission USD wallet — showed two rows reading "USD" with
       * different balances and nothing saying which was which. On the screen an
       * operator opens to decide which wallet to credit, that is the one
       * ambiguity worth removing.
       *
       * The name is server-generated from the currency and the kind, so this
       * renders it rather than composing one — the console, the portal and the
       * CSV export then cannot drift apart on what a wallet is called.
       */
      header: t('clientProfile.walletName'),
      cell: (w) => (
        <span className="inline-flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">{w.name}</span>
            <span className="block font-mono text-[11px] text-muted-foreground">{w.currency}</span>
          </span>
        </span>
      ),
    },
    {
      /*
       * The wallet number — the same identifier the wallets list and the client
       * portal show, so an operator and a client on the phone are reading the
       * same 12 characters. `full`: this IS the short form.
       */
      header: t('clientProfile.walletNumber'),
      cell: (w) => <CopyableId value={w.walletNumber} full />,
    },
    {
      header: t('clientProfile.walletBalance'),
      align: 'right',
      /*
       * FORMATTED through decimal.js, never coerced (§6.1) — the same treatment
       * as the wallets list, so a balance reads identically on both screens.
       */
      cell: (w) => (
        <span className="tabular font-semibold">{formatMoney(w.balance, w.currency)}</span>
      ),
    },
    {
      header: t('clientProfile.walletOnHold'),
      align: 'right',
      /*
       * `isZeroMoney` rather than `!== '0.00000000'`: the second is a string
       * comparison that breaks the moment the API answers '0' or '0.0', and it
       * would then show a held figure on every wallet.
       */
      cell: (w) =>
        isZeroMoney(w.onHold) ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular" title={t('wallets.onHoldNote')}>
            {formatMoney(w.onHold, w.currency)}
          </span>
        ),
    },
    {
      header: '',
      align: 'right',
      cell: (w) => (
        <RowActions
          items={actionsFor(w)}
          busy={close.isPending}
          // Named per WALLET: several identical triggers down a list announce as
          // "button" to a screen reader with nothing to say which each one acts on.
          label={t('clientProfile.walletActionsFor', { currency: w.currency })}
        />
      ),
    },
  ];

  /*
   * NO `ProfileCard` around the table.
   *
   * `DataTable` draws its own card — border, background, shadow — so wrapping
   * it in one put a border inside a border and inset the rows twice. It also
   * shrank the empty state to a strip: without `fill` the table is as tall as
   * its rows, and "No wallets" in a card inside a card reads as a broken panel
   * rather than an answer.
   *
   * `fill` makes the table the height of the space it is given, and its empty
   * state occupy that same frame — so a client with six wallets and a client
   * with none produce the same shape, and the controls below do not move under
   * the cursor between the two.
   */
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
        {t('clientProfile.walletsTitle')}
      </h2>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(w) => w.id}
        fill
        // A LOADER rather than an empty table: "no wallets" and "not fetched
        // yet" are different claims, and the second must never render as the first.
        loading={wallets.status === 'loading'}
        empty={<EmptyState icon={Wallet} message={t('clientProfile.noWallets')} />}
      />

      {canManage && openable.length > 0 && (
        <div className="flex shrink-0 items-center gap-2">
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
    </div>
  );
}
