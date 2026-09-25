import type * as React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Handshake,
  ShieldCheck,
} from 'lucide-react';
import type { MessageKey, MessageVars } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type {
  AdminNotification,
  AdminNotificationCategory,
  AdminNotificationKind,
} from '@/lib/api/admin-notifications';

/**
 * How an admin TASK reads on screen — icon, tone, the sentence, and the screen
 * it is handled on. The one place that knows it.
 *
 * The backend stores no copy and no links: a row is a catalogue `kind` plus
 * structured `params` (ids, string amounts, reason codes), and the client it is
 * about arrives joined and masked. So the words and the routes live here, in
 * the app that owns both, and `KIND_DISPLAY` is keyed by the backend's own enum
 * — a kind the backend adds without this map learning it is a compile error,
 * never a row rendered as a raw slug.
 *
 * Every title is phrased as the thing to DO. The owner's rule is that an admin
 * notification means "you must handle something"; a title that reads like news
 * ("Withdrawal requested") makes the reader work out what is being asked of
 * them, where "Approve withdrawal" does not.
 */

/** A category's look — what a row IS, told by its icon before its title is read. */
export interface CategoryMeta {
  icon: React.ElementType;
  /** The icon chip — semantic tokens only, so both themes hold. */
  tone: string;
}

export const CATEGORIES: Record<AdminNotificationCategory, CategoryMeta> = {
  deposits: { icon: ArrowDownToLine, tone: 'bg-success/10 text-success' },
  withdrawals: { icon: ArrowUpFromLine, tone: 'bg-warning/10 text-warning' },
  kyc: { icon: ShieldCheck, tone: 'bg-info/10 text-info' },
  ib: { icon: Handshake, tone: 'bg-primary/10 text-primary' },
  transfers: { icon: ArrowLeftRight, tone: 'bg-muted text-muted-foreground' },
};

/** An exception only a person can clear — money that did not do what it should. */
const ALERT_TONE = 'bg-destructive/10 text-destructive';

/**
 * What the copy and the link are built from — a row's params and its client's
 * Portal ID, nothing more. Narrower than a feed row on purpose: the arrival
 * TOAST has exactly these (the socket carries params and the Portal ID, never a
 * name), so one definition serves the toast and the row alike.
 */
export interface TaskFacts {
  params: AdminNotification['params'];
  client: { portalId: number | null };
}

interface KindDisplay {
  titleKey: MessageKey;
  /** The detail line — interpolated from `params`, money through `formatMoney`. */
  body: (n: TaskFacts) => { key: MessageKey; vars?: MessageVars };
  /** Where the task is handled — landing FILTERED to this client where the screen allows. */
  href: (n: TaskFacts) => string;
  /** Rendered with the alert icon and tone instead of the category's. */
  alert?: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** "1,250.00 USD" from a row's params, or '' when the row carries no amount. */
function amountOf(n: TaskFacts): string {
  const amount = str(n.params['amount']);
  return amount ? formatMoney(amount, str(n.params['currency'])) : '';
}

/** The client's Portal ID for a URL, or nothing — never the uuid (0133). */
function pid(n: TaskFacts): string {
  return n.client.portalId === null ? '' : String(n.client.portalId);
}

/** `path?key=value…`, dropping empty values so a missing Portal ID leaves the unfiltered list. */
function link(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== ''),
  ).toString();
  return query ? `${path}?${query}` : path;
}

/** The route a deep link opens — what `canAccess` judges; the query only filters it. */
export function pathOf(href: string): string {
  return href.split('?')[0] ?? href;
}

export const KIND_DISPLAY: Record<AdminNotificationKind, KindDisplay> = {
  'admin.deposit.submitted': {
    titleKey: 'notifications.taskApproveDeposit',
    body: (n) => ({
      key: 'notifications.taskApproveDepositBody',
      vars: { amount: amountOf(n), reference: str(n.params['reference']) || '—' },
    }),
    href: (n) => link('/approvals/deposits', { q: pid(n) }),
  },
  'admin.deposit.attention': {
    titleKey: 'notifications.taskDepositAnomaly',
    alert: true,
    body: (n) => {
      const vars = { amount: amountOf(n) };
      switch (str(n.params['reason'])) {
        case 'amount_mismatch':
          return { key: 'notifications.taskDepositAnomalyMismatch', vars };
        case 'reversed':
          return { key: 'notifications.taskDepositAnomalyReversed', vars };
        case 'paid_after_failure':
          return { key: 'notifications.taskDepositAnomalyPaidAfterFailure', vars };
        default:
          return { key: 'notifications.taskDepositAnomalyGeneric', vars };
      }
    },
    // Narrowed to the flagged payment itself, where "Mark resolved" ends this.
    href: (n) => link('/financial', { userId: pid(n), attention: 'true' }),
  },
  'admin.withdrawal.requested': {
    titleKey: 'notifications.taskApproveWithdrawal',
    body: (n) => ({
      key: 'notifications.taskApproveWithdrawalBody',
      vars: { amount: amountOf(n) },
    }),
    href: (n) => link('/transactions', { state: 'pending', q: pid(n) }),
  },
  'withdrawal.rival_submit_failed': {
    titleKey: 'notifications.taskPayoutRefused',
    alert: true,
    body: (n) => ({
      key: 'notifications.taskPayoutRefusedBody',
      vars: { amount: amountOf(n), reason: str(n.params['reason']) || '—' },
    }),
    href: (n) => link('/transactions', { state: 'approved', q: pid(n) }),
  },
  'withdrawal.rival_attention': {
    titleKey: 'notifications.taskPayoutReconcile',
    alert: true,
    body: () => ({ key: 'notifications.taskPayoutReconcileBody' }),
    href: (n) => link('/transactions', { state: 'all', q: pid(n) }),
  },
  'admin.kyc.submitted': {
    titleKey: 'notifications.taskReviewKyc',
    body: () => ({ key: 'notifications.taskReviewKycBody' }),
    href: (n) => (pid(n) ? `/kyc/${pid(n)}` : '/kyc'),
  },
  'admin.kyc.resubmitted': {
    titleKey: 'notifications.taskReviewKycAgain',
    body: () => ({ key: 'notifications.taskReviewKycAgainBody' }),
    href: (n) => (pid(n) ? `/kyc/${pid(n)}` : '/kyc'),
  },
  'admin.partner.applied': {
    titleKey: 'notifications.taskReviewIb',
    body: () => ({ key: 'notifications.taskReviewIbBody' }),
    href: (n) => link('/approvals/ib', { q: pid(n) }),
  },
  'admin.commission.clawback': {
    titleKey: 'notifications.taskClawback',
    alert: true,
    body: (n) => ({
      key:
        n.params['credited'] === true
          ? 'notifications.taskClawbackCredited'
          : 'notifications.taskClawbackPending',
      vars: { amount: amountOf(n) },
    }),
    href: (n) => link('/commissions', { q: pid(n) }),
  },
  'admin.transfer.stuck': {
    titleKey: 'notifications.taskStuckTransfer',
    alert: true,
    body: (n) => ({
      key:
        n.params['direction'] === 'account_to_wallet'
          ? 'notifications.taskStuckTransferToWallet'
          : 'notifications.taskStuckTransferToAccount',
      vars: { amount: amountOf(n) },
    }),
    href: (n) => link('/financial', { userId: pid(n), kind: 'transfer', state: 'pending' }),
  },
};

/** The icon and chip for one row: the alert look for exceptions, else its category's. */
export function lookOf(n: AdminNotification): { icon: React.ElementType; tone: string } {
  const display = KIND_DISPLAY[n.kind];
  return display.alert
    ? { icon: AlertTriangle, tone: ALERT_TONE }
    : { icon: CATEGORIES[n.category].icon, tone: CATEGORIES[n.category].tone };
}

export interface Outcome {
  labelKey: MessageKey;
  tone: string;
}

const DONE = 'bg-success/10 text-success';
const REFUSED = 'bg-destructive/10 text-destructive';
const NEUTRAL = 'bg-muted text-muted-foreground';

/**
 * How a HANDLED task says it ended — or "Needs action" while it has not.
 *
 * The backend reports the item state that closed the task; the same word means
 * different things per subject ('success' is a deposit approved but a
 * withdrawal PAID, 'failure' a deposit failed but a payout cancelled), so the
 * label is chosen here, per category, and anything unrecognised reads
 * "Handled" rather than printing a state name.
 */
export function outcomeOf(n: AdminNotification): Outcome {
  if (!n.resolution) {
    return { labelKey: 'notifications.outcomeNeedsAction', tone: 'bg-warning/10 text-warning' };
  }
  const outcome = n.resolution.outcome;
  if (outcome === 'rejected') return { labelKey: 'notifications.outcomeRejected', tone: REFUSED };
  if (outcome === 'reset') return { labelKey: 'notifications.outcomeReset', tone: NEUTRAL };
  if (outcome === 'resolved') return { labelKey: 'notifications.outcomeResolved', tone: DONE };
  if (outcome === 'reversed') return { labelKey: 'notifications.outcomeReversed', tone: DONE };
  if (outcome === 'approved') return { labelKey: 'notifications.outcomeApproved', tone: DONE };
  if (outcome === 'settled') return { labelKey: 'notifications.outcomeCompleted', tone: DONE };
  if (outcome === 'success') {
    return n.category === 'withdrawals'
      ? { labelKey: 'notifications.outcomePaid', tone: DONE }
      : { labelKey: 'notifications.outcomeApproved', tone: DONE };
  }
  if (outcome === 'failure' || outcome === 'failed') {
    if (n.category === 'withdrawals') {
      return { labelKey: 'notifications.outcomeCancelled', tone: NEUTRAL };
    }
    if (n.category === 'transfers') {
      return { labelKey: 'notifications.outcomeReleased', tone: NEUTRAL };
    }
    return { labelKey: 'notifications.outcomeFailed', tone: REFUSED };
  }
  return { labelKey: 'notifications.outcomeHandled', tone: NEUTRAL };
}
