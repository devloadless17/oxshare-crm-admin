import type {
  TradingAccountEnvironment,
  TradingAccountRow,
  TradingAccountSortKey,
  TradingAccountStatus,
} from '@/lib/api/admin';
import type { Column } from '@/components/data-table';
import {
  ClientIdentity,
  clientName,
  clientProfileHref,
} from '@/components/clients/client-identity';
import { PermittedLink } from '@/components/permitted-link';
import { relativeTime } from '@/lib/relative-time';
import { formatMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The trading-account table's columns — ONE definition for the Trading
 * accounts desk and a partner's "Referred accounts" tab (owner, 26 Sep 2026),
 * so the two cannot drift in what an account row says.
 *
 * Moved verbatim from `trading-accounts/page.tsx`; the notes on the money rule,
 * the nullable string login and server-side sorting are that page's, and hold
 * here. No actions column: each screen appends its own, because what may be
 * done to an account depends on where it is being looked at from.
 */
export const ENVIRONMENT_LABELS: Record<TradingAccountEnvironment, MessageKey> = {
  live: 'tradingAccounts.envLive',
  demo: 'tradingAccounts.envDemo',
};

/** Label and tone per account state, keyed off the API's own enum. */
export const STATUS_META: Record<TradingAccountStatus, { labelKey: MessageKey; classes: string }> =
  {
    active: {
      labelKey: 'tradingAccounts.statusActive',
      classes: 'bg-success/10 text-success border-success/20',
    },
    suspended: {
      labelKey: 'tradingAccounts.statusSuspended',
      classes: 'bg-warning/10 text-warning border-warning/20',
    },
    closed: {
      labelKey: 'tradingAccounts.statusClosed',
      classes: 'bg-muted text-muted-foreground border-border',
    },
  };

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: TradingAccountSortKey) => ({ sortable: true as const, sortKey: key });

export function tradingAccountColumns(): Column<TradingAccountRow>[] {
  return [
    {
      header: t('tradingAccounts.colOwner'),
      // Sorts by EMAIL — the key the endpoint orders on, and the unique,
      // always-present field. Grouping by it puts one client's accounts
      // together, which is the reason to sort this column.
      ...sortableBy('userEmail'),
      cell: (a) => (
        <ClientIdentity
          name={clientName(a.user.firstName, a.user.lastName)}
          email={a.user.email}
          portalId={a.user.portalId}
        />
      ),
    },
    {
      header: t('tradingAccounts.colLogin'),
      // Sortable, and the endpoint pins NULLS LAST in both directions — see the
      // note at the top of this file.
      ...sortableBy('login'),
      cell: (a) =>
        a.login ? (
          // Left-aligned and monospaced: it is an identifier, not a quantity.
          // It opens the owner's profile, whose overview lists their accounts.
          <PermittedLink
            href={clientProfileHref(a.user.portalId)}
            className="text-link hover:underline focus-outline rounded-sm"
          >
            <span className="font-mono font-semibold">{a.login}</span>
          </PermittedLink>
        ) : (
          <span className="text-xs text-muted-foreground">{t('tradingAccounts.noLogin')}</span>
        ),
    },
    {
      header: t('tradingAccounts.colEnvironment'),
      ...sortableBy('environment'),
      cell: (a) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            // Demo is deliberately muted and live is not. An operator scanning
            // this column is looking for the accounts that hold real money.
            a.environment === 'live'
              ? 'border-info/20 bg-info/10 text-info'
              : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {t(ENVIRONMENT_LABELS[a.environment])}
        </span>
      ),
    },
    {
      header: t('tradingAccounts.colCurrency'),
      ...sortableBy('currency'),
      cell: (a) => <span className="font-mono text-xs font-semibold">{a.currency}</span>,
    },
    {
      header: t('tradingAccounts.colBalance'),
      align: 'right',
      // Sortable because the SERVER orders it, on the NUMERIC column. No
      // `sortType: 'money'` — that comparator drives the client-side fallback,
      // which `onSortChange` switches off.
      ...sortableBy('balance'),
      /*
       * FORMATTED through decimal.js, never coerced (§6.1).
       *
       * A list an operator SCANS to compare accounts, so it follows the wallets
       * screen: two places and thousands separators instead of a raw
       * `1000.00000000`. Deliberately not the withdrawals queue's rule — there
       * the exact string is kept, because authorising one specific payout is a
       * different job from comparing a column of balances.
       */
      /*
       * Live where MT5 answered, the cached column otherwise — and the two are
       * VISUALLY DISTINCT, because a number nobody can date is worse than no
       * number. An account MT5 would not answer for is absent from the map
       * rather than null, which is what makes the fallback detectable.
       */
      cell: (a) => (
        <span
          title={
            a.balanceSyncedAt
              ? t('tradingAccounts.syncedHint', { when: relativeTime(a.balanceSyncedAt) })
              : a.login
                ? t('tradingAccounts.neverSyncedHint')
                : t('tradingAccounts.noLoginHint')
          }
        >
          {formatMoney(a.balance, a.currency)}
          {/*
              The AGE, on its own line and never omitted.
            
              A mirrored number rendered bare is indistinguishable from a live one,
              which is worse than either — it invites an operator to act on a figure
              whose vintage they cannot see. "Never" is its own answer and reads
              differently from "4 minutes ago": it means MT5 has not confirmed this
              account at all, not that the balance is old.
            */}
          <span className="block text-[11px] text-muted-foreground">
            {a.balanceSyncedAt ? relativeTime(a.balanceSyncedAt) : t('tradingAccounts.neverSynced')}
          </span>
        </span>
      ),
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap tabular',
    },
    {
      header: t('tradingAccounts.colLeverage'),
      align: 'right',
      /*
       * NOT sortable — `leverage` is absent from the endpoint's allowlist.
       *
       * It is also the one number on this row that is genuinely a number: a
       * ratio the bridge sets, not money, so rendering it as `1:500` is
       * formatting rather than a coercion of a decimal string.
       */
      sortable: false,
      cell: (a) =>
        a.leverage ? (
          <span className="tabular">1:{a.leverage}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('tradingAccounts.noLeverage')}</span>
        ),
      cellClassName: 'whitespace-nowrap',
    },
    {
      header: t('tradingAccounts.colStatus'),
      ...sortableBy('status'),
      cell: (a) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[a.status].classes}`}
        >
          {t(STATUS_META[a.status].labelKey)}
        </span>
      ),
    },
    {
      header: t('tradingAccounts.colOpened'),
      ...sortableBy('createdAt'),
      cell: (a) => formatDate(a.createdAt),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    // No actions column — each screen appends its own (see the note above).
  ];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
