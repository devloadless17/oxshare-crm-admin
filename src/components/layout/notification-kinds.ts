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
 * Which DATA a kind invalidates — the piece that makes the console realtime
 * rather than merely noisy. The toast announces; this refreshes the table the
 * announcement is about, so the operator never reads "awaiting payout" on a
 * row the platform already decided. Prefix-matched so new withdrawal.* kinds
 * inherit the behaviour before this map learns their names.
 */
export function queryKeysFor(kind: string): string[][] {
  if (kind.startsWith('withdrawal.') || kind.startsWith('admin.withdrawal.')) {
    return [['admin', 'withdrawals']];
  }
  if (kind.startsWith('admin.deposit.'))
    return [
      ['admin', 'withdrawals'],
      ['admin', 'clients'],
    ];
  if (kind.startsWith('admin.kyc.')) return [['admin', 'kyc']];
  if (kind.startsWith('admin.partner.')) return [['admin', 'partner-applications']];
  if (kind.startsWith('admin.client.')) return [['admin', 'clients']];
  return [];
}

export function resolveKind(kind: string): KindConfig | undefined {
  // `Object.hasOwn`, not a bare lookup: a hostile or accidental kind slug of
  // 'constructor' or 'toString' would otherwise return an inherited function —
  // truthy — and skip the guaranteed generic fallback.
  return Object.hasOwn(KIND_CONFIG, kind) ? KIND_CONFIG[kind] : undefined;
}
