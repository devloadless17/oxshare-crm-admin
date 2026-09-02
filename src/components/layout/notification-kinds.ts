import type * as React from 'react';
import {
  AlertTriangle,
  Banknote,
  CandlestickChart,
  FileCheck,
  Handshake,
  UserPlus,
} from 'lucide-react';
import type { MessageKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { AdminNotification } from '@/lib/api/admin';
import { keys, type AdminQueryKey } from '@/lib/query-keys';

/**
 * The admin bell's kind catalogue — how a backend `{kind, params}` row becomes
 * icon + copy + destination.
 *
 * The backend deliberately stores NO title, body or href (see the
 * `notifications` table note): copy lives here so it is i18n'd like everything
 * else, and the deep link is derived here for the same reason
 * `kyc-doc-url.ts` exists — exactly one place knows the route.
 *
 * A kind this map does not know renders as a generic row (`fallbackTitle` +
 * timestamp), never a raw slug — the backend may learn new events before this
 * app redeploys, and an unrendered enum is the kind of string this codebase
 * never shows.
 *
 * TWIN in intent with the portal's `layout/notification-kinds.ts`; NOT a twin
 * file — the catalogues are disjoint (work-queue events here, account events
 * there).
 */
export interface KindConfig {
  icon: React.ElementType;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /** Interpolation vars for the body — money params go through formatMoney. */
  vars?: (params: AdminNotification['params']) => Record<string, string | number>;
  /** The screen this event is actioned on. */
  href?: string;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export const KIND_CONFIG: Record<string, KindConfig> = {
  'admin.withdrawal.requested': {
    icon: Banknote,
    titleKey: 'notifications.kindWithdrawalRequestedTitle',
    bodyKey: 'notifications.kindWithdrawalRequestedBody',
    vars: (params) => ({ amount: formatMoney(str(params.amount), str(params.currency)) }),
    href: '/transactions',
  },
  'admin.kyc.submitted': {
    icon: FileCheck,
    titleKey: 'notifications.kindKycSubmittedTitle',
    bodyKey: 'notifications.kindKycSubmittedBody',
    href: '/kyc',
  },
  'admin.partner.applied': {
    icon: Handshake,
    titleKey: 'notifications.kindPartnerAppliedTitle',
    bodyKey: 'notifications.kindPartnerAppliedBody',
    // The application QUEUE, not /partners — that roster lists approved
    // partners and cannot contain the pending applicant this row announces.
    href: '/approvals/ib',
  },
  /*
   * A client resubmitted after being rejected — a DISTINCT kind from
   * `admin.kyc.submitted`, not a duplicate of it.
   *
   * The work is different: a first submission is an unknown client to assess
   * from scratch, a resubmission is a review already done once where only the
   * fields this desk itself asked to be corrected need checking. It also
   * carries an expectation — that client has been refused once and is waiting.
   * Rendering both identically is what lets resubmissions go stale.
   */
  'admin.kyc.resubmitted': {
    icon: FileCheck,
    titleKey: 'notifications.kindKycResubmittedTitle',
    bodyKey: 'notifications.kindKycResubmittedBody',
    href: '/kyc',
  },
  /*
   * A MANUAL deposit was declared and needs somebody to check the bank and
   * credit the wallet. Gateway deposits never reach here — they settle from the
   * signed webhook with no human in the path, and a bell for one would be a
   * queue item nobody can action.
   *
   * `/transactions` rather than `/wallets`: the row this announces is a
   * transaction, and it is what the operator has to find before deciding
   * anything. The credit itself is taken from the client's record.
   */
  'admin.deposit.submitted': {
    icon: Banknote,
    titleKey: 'notifications.kindDepositSubmittedTitle',
    bodyKey: 'notifications.kindDepositSubmittedBody',
    vars: (params) => ({
      amount: formatMoney(str(params.amount), str(params.currency)),
      reference: str(params.reference),
    }),
    href: '/transactions',
  },
  /*
   * A new signup. NOT scope-filtered at write time (see the backend note): a
   * brand-new client carries no tags, which is exactly the untriaged state this
   * event asks somebody to resolve, so filtering on it would hide the event
   * from the people whose job it is.
   */
  'admin.client.registered': {
    icon: UserPlus,
    titleKey: 'notifications.kindClientRegisteredTitle',
    bodyKey: 'notifications.kindClientRegisteredBody',
    href: '/clients',
  },
  /*
   * Informational, and named for what happened. Client account opening is
   * self-service and completes immediately — there is no approval step — so
   * this is "a live account appeared on your groups", not a work item. Calling
   * it `requested` would put something in an operator's bell that they cannot
   * action and cannot clear.
   */
  /*
   * ── The Rival payout leg ────────────────────────────────────────────────
   * Four events, all landing on /transactions, because each one changes what
   * the desk should do next: a refusal needs a retry-or-manual decision, a
   * platform rejection means the client was refunded and will likely call, a
   * disagreement needs reconciliation before anyone touches the row, and a
   * payout confirmation closes the watch.
   */
  'withdrawal.rival_submit_failed': {
    icon: AlertTriangle,
    titleKey: 'notifications.kindRivalSubmitFailedTitle',
    bodyKey: 'notifications.kindRivalSubmitFailedBody',
    vars: (params) => ({
      amount: formatMoney(str(params.amount), str(params.currency)),
      reason: str(params.reason),
    }),
    href: '/transactions',
  },
  'withdrawal.rival_rejected': {
    icon: AlertTriangle,
    titleKey: 'notifications.kindRivalRejectedTitle',
    bodyKey: 'notifications.kindRivalRejectedBody',
    vars: (params) => ({
      amount: formatMoney(str(params.amount), str(params.currency)),
      reason: str(params.reason),
    }),
    href: '/transactions',
  },
  'withdrawal.rival_paid': {
    icon: Banknote,
    titleKey: 'notifications.kindRivalPaidTitle',
    bodyKey: 'notifications.kindRivalPaidBody',
    vars: (params) => ({ amount: formatMoney(str(params.amount), str(params.currency)) }),
    href: '/transactions',
  },
  'withdrawal.rival_attention': {
    icon: AlertTriangle,
    titleKey: 'notifications.kindRivalAttentionTitle',
    bodyKey: 'notifications.kindRivalAttentionBody',
    href: '/transactions',
  },
  'admin.trading_account.opened': {
    icon: CandlestickChart,
    titleKey: 'notifications.kindTradingAccountOpenedTitle',
    bodyKey: 'notifications.kindTradingAccountOpenedBody',
    vars: (params) => ({
      login: str(params.login),
      environment: str(params.environment),
    }),
    href: '/trading-accounts',
  },
};

/**
 * Which DATA a kind refreshes — the piece that makes the console realtime
 * rather than merely noisy. The toast announces; this refreshes the table the
 * announcement is about, so an operator never reads "awaiting payout" on a row
 * the platform already decided.
 *
 * ⚠️ THREE of these keys used to name NOTHING, and nothing said so.
 * `admin.partner.applied` invalidated `['admin','partner-applications']` while
 * the queue lives under `ib-applications`; `admin.client.registered` and
 * `admin.deposit.submitted` invalidated `['admin','clients']` while the list
 * lives under `clients`; and `admin.kyc.*` invalidated `['admin','kyc']`,
 * which reached the sidebar badge but NOT the queue table beneath it. Each one
 * resolved happily and refetched nothing, so the operator got a chime, a toast
 * and a stale screen — the worst of the three outcomes, because it looks live.
 *
 * They cannot recur: the return type is the registry's own union, so a key
 * naming nothing is a compile error. Keep it that way — do not widen it to
 * `string[][]`.
 *
 * Prefix-matched, so a new `withdrawal.*` kind inherits the behaviour before
 * this map learns its name.
 */
export function queryKeysFor(kind: string): readonly AdminQueryKey[] {
  /*
   * Every withdrawal event — the desk's own decisions and the Rival rail's
   * asynchronous answers. `rival_paid` and `rival_rejected` MOVE MONEY (a
   * rejection posts a compensating credit back to the wallet), so they reach
   * past the desk into the balances and the ledger that record it.
   */
  if (kind.startsWith('withdrawal.') || kind.startsWith('admin.withdrawal.')) {
    return [
      keys.withdrawals.all(), // the desk list AND its sidebar badge
      keys.transactions.all(), // Financial: every movement, not just payouts
      keys.wallets.all(), // a refusal refunds; a payout debits
      keys.ledger.all(),
      keys.stats.all(), // the dashboard's withdrawal-volume tile
    ];
  }

  // A declared manual deposit is a pending row on Financial. It credits
  // nothing yet — the wallet moves on `deposit.succeeded`, which is a CLIENT
  // kind — so wallets are deliberately absent here.
  if (kind.startsWith('admin.deposit.')) {
    return [keys.transactions.all(), keys.stats.all()];
  }

  /*
   * `kyc.all()` is the whole point of the registry: one key now covers the
   * queue, the open detail page and the sidebar badge, which sat under three
   * different roots before. `clients.all()` because the list carries a KYC
   * status column and a KYC filter.
   */
  if (kind.startsWith('admin.kyc.')) {
    return [keys.kyc.all(), keys.clients.all(), keys.stats.all()];
  }

  if (kind.startsWith('admin.partner.')) {
    return [keys.ibApplications.all(), keys.stats.all()];
  }

  if (kind.startsWith('admin.trading_account.')) {
    return [keys.tradingAccounts.all(), keys.clients.all(), keys.stats.all()];
  }

  if (kind.startsWith('admin.client.')) {
    return [keys.clients.all(), keys.stats.all()];
  }

  return [];
}

/**
 * Every resource the backend can announce a change to.
 *
 * Mirrors `RESOURCES` in the backend's `common/realtime/resource-changed.ts`.
 * It exists so a RECONNECT can re-sync all of them at once: a
 * `resource.changed` missed while the socket was down leaves no trace to
 * recover from later, unlike a notification, which is a row.
 */
export const BROADCAST_RESOURCES = [
  'kyc',
  'withdrawals',
  'ib-applications',
  'clients',
  'wallets',
] as const;

/**
 * Which DATA a CROSS-OPERATOR change refreshes.
 *
 * The sibling of `queryKeysFor`, for the other half of "realtime": that map
 * answers "a client did something", this one answers "another operator
 * decided something you are looking at". Both were needed, and only the first
 * existed — so two reviewers working the same queue each saw a list that had
 * stopped being true, for up to the sixty seconds of the badge poll, with
 * nothing on screen suggesting it.
 *
 * The event carries a resource NAME and nothing else (see the backend's
 * `resource-changed.ts` for why that emptiness is deliberate), so this map is
 * the entire interpretation. A resource this build does not know refreshes
 * nothing, exactly like an unknown kind.
 */
export function resourceKeysFor(resource: string): readonly AdminQueryKey[] {
  switch (resource) {
    case 'kyc':
      // The queue, the open detail page and the sidebar badge share one root.
      return [keys.kyc.all(), keys.clients.all(), keys.stats.all()];
    case 'withdrawals':
      return [
        keys.withdrawals.all(),
        keys.transactions.all(),
        keys.wallets.all(),
        keys.ledger.all(),
        keys.stats.all(),
      ];
    case 'ib-applications':
      return [keys.ibApplications.all(), keys.stats.all()];
    case 'clients':
      return [keys.clients.all(), keys.stats.all()];
    case 'wallets':
      return [
        keys.wallets.all(),
        keys.transactions.all(),
        keys.ledger.all(),
        keys.clients.all(),
        keys.reconciliation.all(),
        keys.stats.all(),
      ];
    default:
      return [];
  }
}

export function resolveKind(kind: string): KindConfig | undefined {
  // `Object.hasOwn`, not a bare lookup: a hostile or accidental kind slug of
  // 'constructor' or 'toString' would otherwise return an inherited function —
  // truthy — and skip the guaranteed generic fallback.
  return Object.hasOwn(KIND_CONFIG, kind) ? KIND_CONFIG[kind] : undefined;
}
