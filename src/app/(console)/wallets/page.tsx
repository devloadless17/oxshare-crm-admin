'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, Wallet } from 'lucide-react';
import api from '@/lib/api';
import type { Currency, WalletListResponse, WalletRow, WalletSortKey } from '@/lib/api/admin';
import { WALLET_SORT_KEYS } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { RowActions, actionsColumn } from '@/components/row-actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreditWalletModal } from '@/components/wallets/credit-wallet-modal';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { PageLoader } from '@/components/ui/loader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';

/**
 * Client wallets — `GET /admin/wallets`.
 *
 * ## MONEY RULE (ARCHITECTURE §6.1)
 *
 * `balance` and `onHold` arrive as decimal STRINGS and are never COERCED.
 * Nothing on this screen calls `Number()`, `parseFloat` or `Intl.NumberFormat` —
 * `NUMERIC(28,8)` exceeds what a JavaScript number holds exactly, so a
 * conversion loses value before any formatting starts. On a screen whose whole
 * purpose is telling an operator what a client is owed, a plausible-looking
 * wrong number is worse than an ugly right one.
 *
 * FORMATTING IS NOT COERCION, and this file used to conflate the two. It
 * rendered the raw column on the grounds that the strings must "reach the DOM
 * unchanged", which meant every balance read `1000.00000000`. `formatMoney`
 * does the rounding in decimal.js and returns a string, so the value is never a
 * float at any point — the rule is kept and the column becomes readable.
 * `$1,000.00` is the same number, said to a person.
 *
 * There is deliberately no "available" column either. Available is
 * `balance − onHold`, and that subtraction belongs in decimal arithmetic on the
 * server rather than in JS on two strings. The API does not send it, so this
 * screen does not invent it.
 *
 * ## Sorting is server-side
 *
 * Every sortable header maps to a key in `WALLET_SORT_KEYS`, which mirrors the
 * endpoint's own allowlist. `balance` is safe to offer because the ordering
 * happens on the SQL column: "the largest balance" means the largest of all of
 * them rather than the largest of the twenty-five on screen. A column outside
 * the allowlist declares `sortable: false` — R-2.5 makes an unrecognised sort a
 * 400 rather than a silent fallback, so a header claiming one would render an
 * error page instead of rows.
 */

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: WalletSortKey) => ({ sortable: true as const, sortKey: key });

/*
 * `useSearchParams()` requires a Suspense boundary at prerender or
 * `npm run build` fails — and `next dev` does NOT, so CI is where you find out.
 * Same shape as `clients/page.tsx`.
 */
export default function WalletsPage() {
  return (
    <Suspense fallback={<PageLoader label={t('wallets.loading')} />}>
      <WalletsPageContent />
    </Suspense>
  );
}

function WalletsPageContent() {
  /*
   * Filters, sort and the page number all live in the URL — see
   * `use-table-query-state.ts`. "Every USD wallet, page 3" has to be a link an
   * operator can paste into a ticket, and the browser's Back button has to undo
   * a filter rather than leave the screen.
   */
  const queryClient = useQueryClient();
  const { admin } = useAdmin();
  const canCredit = hasPermission(admin, 'wallets.credit');
  const canClose = hasPermission(admin, 'wallets.delete');
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  /*
   * The rows-per-page selector, in the URL beside the page number.
   *
   * It rendered and did nothing: the pager drew the control but no
   * `onPageSizeChange` was passed and the limit was a constant. `limitParam`
   * clamps to the four sizes the pager offers, so a hand-edited `?limit=5000`
   * cannot become a request the API rejects — it caps at 100.
   */
  const pageSize = limitParam(url.get('limit'));
  const currency = url.get('currency');
  /*
   * Debounced because it is a free-text box, even though the API matches the id
   * EXACTLY rather than searching. A request per keystroke over a 36-character
   * UUID is thirty-six requests that can only 200 with nothing, and the
   * `AbortSignal` below cancels the superseded ones either way.
   */
  const userId = useDebounced(url.get('userId').trim());

  const sortKey = WALLET_SORT_KEYS.includes(url.sort.key as WalletSortKey)
    ? (url.sort.key as WalletSortKey)
    : undefined;

  const params = {
    limit: pageSize,
    page,
    userId: userId || undefined,
    currency: currency || undefined,
    sort: sortKey,
    // Withheld when nothing is sorted. `order` alone describes an ordering of
    // no column, and sending it would also make two identical result sets cache
    // under different query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<WalletListResponse>(['admin', 'wallets', params], (signal) =>
    api.admin.getWallets(params, signal),
  );

  /*
   * The currency vocabulary for the filter, from the currencies endpoint rather
   * than from the rows on screen.
   *
   * Building it from the page would offer only the currencies present in the
   * twenty-five rows being shown, so the options would change as you page and a
   * currency you could see was often one you could not filter by — the exact
   * defect the client list's country filter was removed for. Its own resource,
   * so a failure here degrades the filter rather than the wallet list.
   */
  const currenciesQuery = useResource<Currency[]>(['admin', 'currencies'], (signal) =>
    api.admin.getCurrencies(signal),
  );
  const currencies = currenciesQuery.data ?? [];

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  /*
   * The export carries the FILTERS, not the page. `fetchExport` strips paging
   * itself, so this only has to avoid adding it. The sort is deliberately
   * absent: the export is defined by which rows it holds, and the order they
   * arrive in is a property of the screen — carrying it would make the same set
   * of rows produce two different files depending on which header was last
   * clicked. The endpoint accepts `userId` and `currency` and nothing else.
   */
  const exportFilters = new URLSearchParams({
    ...(userId ? { userId } : {}),
    ...(currency ? { currency } : {}),
  });

  /*
   * The wallet being credited, and the error from the last attempt.
   *
   * The MUTATION's own error is not used for display, because it is cleared on
   * the next attempt while the modal stays open — the operator would see their
   * message vanish as they retried. This holds the last one until they change
   * something.
   */
  const [crediting, setCrediting] = React.useState<WalletRow | undefined>();
  const [creditError, setCreditError] = React.useState<string | undefined>();

  /** The wallet awaiting a close confirmation, and the API's last refusal. */
  const [closing, setClosing] = React.useState<WalletRow | undefined>();
  const [closeError, setCloseError] = React.useState<string | undefined>();

  const close = useMutation({
    mutationFn: (id: string) => api.admin.closeWallet(id),
    onSuccess: (_data, id) => {
      const wallet = closing;
      setClosing(undefined);
      setCloseError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      toastSuccess(
        t('wallets.closeSucceeded', { currency: wallet?.currency ?? id }),
        wallet ? (wallet.user.email ?? undefined) : undefined,
      );
    },
    /*
     * The API's OWN message, never a generic one.
     *
     * A close is refused for four different reasons and each names the figure or
     * the count: "This wallet holds $1,250.00 USD", "…has 3 historical records
     * against it". Replacing that with "could not close the wallet" throws away
     * the only part the operator can act on — and would leave them pressing the
     * same button again.
     *
     * The dialog stays OPEN on failure so the message is read where the decision
     * was made, and NO error toast is raised alongside it. Reporting one refusal
     * in two places at once is not twice the feedback — it reads as two separate
     * failures. The console-wide rule is that every write reports its outcome,
     * not that every write raises a toast.
     */
    onError: (error) => setCloseError(apiErrorMessage(error, t('wallets.closeFailed'))),
  });

  const credit = useMutation({
    mutationFn: (values: { amount: string; reason: string }) =>
      api.admin.creditWallet(
        {
          userId: crediting!.user.id,
          amount: values.amount,
          currency: crediting!.currency,
          reason: values.reason,
        },
        /*
         * ONE key per intended credit, minted when the modal opens rather than
         * per attempt — `crediting.id` plus the wallet's current balance, so a
         * retry of the same submission reuses it and a SECOND, deliberate credit
         * of the same client gets a new one (the balance has moved).
         *
         * The server stores it as `provider_ref`, so this is what makes a
         * double-click credit once in the DATABASE rather than only in a cache.
         */
        `credit:${crediting!.id}:${crediting!.balance}`,
      ),
    onSuccess: (_data, values) => {
      const wallet = crediting;
      setCrediting(undefined);
      setCreditError(undefined);
      // The balance and the client's transaction list both changed.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      /*
       * The AMOUNT is in the toast, formatted, because this is the one action in
       * the console that moves money on an operator's say-so alone. The modal
       * closes on success, so without this the only confirmation that $500 —
       * rather than $5,000 — was credited is a row in a table behind it.
       */
      toastSuccess(
        t('wallets.creditSucceeded', {
          amount: formatMoney(values.amount, wallet?.currency ?? 'USD'),
        }),
        wallet ? (wallet.user.email ?? undefined) : undefined,
      );
    },
    // Inline, and no toast — the modal stays open. Same reason as `close` above.
    onError: (error) => setCreditError(apiErrorMessage(error, t('wallets.creditFailed'))),
  });

  const columns: Column<WalletRow>[] = [
    {
      header: t('wallets.colOwner'),
      // Sorts by EMAIL, which is the key the endpoint orders on. The cell leads
      // with the name; email is the unique, always-present one, and grouping by
      // it puts a client's wallets together — which is the reason to sort this
      // column at all.
      ...sortableBy('userEmail'),
      cell: (w) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {[w.user.firstName, w.user.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="truncate text-xs text-muted-foreground">{w.user.email}</div>
        </div>
      ),
    },
    {
      header: t('wallets.colCurrency'),
      ...sortableBy('currency'),
      cell: (w) => <span className="font-mono text-xs font-semibold">{w.currency}</span>,
    },
    {
      header: t('wallets.colBalance'),
      align: 'right',
      /*
       * Sortable, and only because the SERVER does the ordering — see the note
       * at the top of this file. No `sortType: 'money'`: that comparator drives
       * the client-side fallback, which `onSortChange` switches off entirely.
       */
      ...sortableBy('balance'),
      /*
       * FORMATTED through decimal.js — not coerced. See the file header for why
       * those are different things.
       *
       * This rendered the raw column, so every row read `1000.00000000`: eight
       * decimal places of nothing, in the column an operator scans to compare
       * balances. The stored scale belongs to the ledger; two places and
       * thousands separators belong to the person reading the screen.
       */
      cell: (w) => formatMoney(w.balance, w.currency),
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap tabular',
    },
    {
      header: t('wallets.colOnHold'),
      align: 'right',
      /*
       * NOT sortable — `onHold` is absent from the endpoint's sort allowlist,
       * and R-2.5 makes an unrecognised key a 400 rather than a silent
       * fallback. Declaring it would replace a wrong order with an error page.
       */
      sortable: false,
      cell: (w) => (
        // The muted tone is the whole treatment: a hold is not money the client
        // can move, and rendering it identically to the balance invites reading
        // the two as one number.
        <span title={t('wallets.onHoldNote')} className="text-muted-foreground">
          {formatMoney(w.onHold, w.currency)}
        </span>
      ),
      cellClassName: 'font-mono whitespace-nowrap tabular',
    },
    {
      header: t('wallets.colOpened'),
      ...sortableBy('createdAt'),
      cell: (w) => formatDate(w.createdAt),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    /*
     * TWO ACTIONS, where there used to be none.
     *
     * This column's absence was documented as deliberate — "there is no endpoint
     * that credits, debits, freezes or closes a wallet from here" — and that was
     * true and was also the largest hole in the product: a client could file a
     * manual deposit and NOTHING could confirm it, so money could leave the
     * platform and could not enter it.
     *
     * ADD FUNDS is `POST /admin/wallets/credit`. CLOSE is
     * `DELETE /admin/wallets/:id`, and only ever succeeds on an empty, unused
     * wallet — the API refuses one holding a balance, one with funds on hold,
     * and one with any ledger, transaction or transfer history against it.
     *
     * DEBIT and FREEZE still do not exist and are still right to omit: reducing
     * a balance is a compensating entry through the ledger (§6.4), never a
     * button that edits a number.
     */
    /*
     * Each write behind ITS OWN key — `wallets.credit` and `wallets.delete` —
     * exactly as `client-wallets-panel.tsx` gates the same two operations on
     * the profile. This page drew both for every `wallets.view` holder, so a
     * read-only finance viewer was offered "Add funds" on a screen whose
     * comment in permissions.ts claimed it drew no write control at all.
     */
    ...(canCredit || canClose
      ? [
          actionsColumn<WalletRow>((w) => (
            <RowActions
              label={t('table.rowActions', { name: w.user.email })}
              busy={
                (credit.isPending && crediting?.id === w.id) ||
                (close.isPending && closing?.id === w.id)
              }
              items={[
                ...(canCredit
                  ? [
                      {
                        label: t('wallets.creditAction'),
                        icon: PlusCircle,
                        onSelect: () => {
                          setCreditError(undefined);
                          setCrediting(w);
                        },
                      },
                    ]
                  : []),
                ...(canClose
                  ? [
                      {
                        label: t('wallets.closeAction'),
                        icon: Trash2,
                        /*
                         * Destructive, and behind a CONFIRMATION rather than
                         * fired from the menu. The API refuses a wallet that
                         * holds anything, so the damage is bounded — but "closed
                         * the wrong client's wallet" is still a support
                         * conversation.
                         */
                        destructive: true,
                        separatorBefore: canCredit,
                        onSelect: () => {
                          setCloseError(undefined);
                          setClosing(w);
                        },
                      },
                    ]
                  : []),
              ]}
            />
          )),
        ]
      : []),
  ];

  const isFiltered = Boolean(userId || currency);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('wallets.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('wallets.subtitle')}</p>
        </div>
        <ExportButton resource="wallets" filters={exportFilters} disabled={total === 0} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label={t('wallets.filterClient')}
          placeholder={t('wallets.filterClientPlaceholder')}
          title={t('wallets.filterClientHint')}
          value={url.get('userId')}
          onChange={(e) => {
            // Filter and page written together, so narrowing always lands on
            // page one rather than past the end of the new result set.
            url.set({ userId: e.target.value, page: undefined });
          }}
          className="h-9 w-64 rounded-lg border border-input bg-card px-3 font-mono text-xs focus-outline"
        />

        <Select
          value={currency || 'all'}
          onValueChange={(value) =>
            url.set({ currency: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-44" aria-label={t('wallets.filterCurrency')}>
            <SelectValue placeholder={t('wallets.filterCurrencyAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('wallets.filterCurrencyAll')}</SelectItem>
            {currencies.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFiltered && (
          <button
            type="button"
            onClick={() => url.clear()}
            className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted focus-outline"
          >
            {t('wallets.clearFilters')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('wallets.loading')}
        endpoints={['GET /admin/wallets?userId&currency&page&limit&sort&order']}
        onRetry={query.refetch}
        errorMessage={t('wallets.loadFailed')}
        error={query.error}
        fill
      >
        {/*
          The close confirmation.
          `onOpenChange` clears the error as well as the target, so reopening on
          another wallet does not show the refusal that belonged to the last one.
        */}
        <AlertDialog
          open={Boolean(closing)}
          onOpenChange={(open) => {
            if (!open) {
              setClosing(undefined);
              setCloseError(undefined);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('wallets.closeConfirmTitle', { currency: closing?.currency ?? '' })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('wallets.closeConfirmBody', { email: closing?.user.email ?? '' })}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {closeError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {closeError}
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // The dialog would close itself on click; the mutation decides
                  // when to close it, so a refusal stays on screen.
                  event.preventDefault();
                  if (closing) close.mutate(closing.id);
                }}
                disabled={close.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {close.isPending ? t('wallets.closing') : t('wallets.closeConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CreditWalletModal
          wallet={crediting}
          saving={credit.isPending}
          error={creditError}
          onClose={() => {
            setCrediting(undefined);
            setCreditError(undefined);
          }}
          onSubmit={(values) => credit.mutate(values)}
        />

        <DataTable
          fill
          caption={t('wallets.caption')}
          columns={columns}
          rows={rows}
          rowKey={(w) => w.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={Wallet}
              message={isFiltered ? t('wallets.emptyFiltered') : t('wallets.empty')}
            />
          }
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * Server-side, which is what makes the balance column safe to offer at
           * all. The page is dropped with the sort: reordering renumbers every
           * page, so position 26–50 after a sort holds different wallets than it
           * did before. `key` is `null` on the third click — the cycle back to
           * unsorted — and both params come out of the URL together.
           */
          onSortChange={(key, order) => {
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined });
          }}
          pagination={{
            page,
            pageSize,
            total,
            // `undefined` for page one, so returning to the start leaves a clean
            // URL rather than a trailing `?page=1`.
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            // The size and the page are written together, and the page is
            // dropped: page 4 at 25 a page is past the end at 100 a page, which
            // renders as an empty table and reads as "no wallets" rather than as
            // an overshoot. `undefined` for the default size keeps the common
            // URL clean.
            onPageSizeChange: (size) =>
              url.set({
                limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              }),
            noun: [t('wallets.noun'), t('wallets.nounPlural')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
