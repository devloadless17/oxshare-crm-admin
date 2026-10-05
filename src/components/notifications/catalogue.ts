import type * as React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  ArrowLeftRight,
  ArrowUpFromLine,
  Handshake,
  ShieldCheck,
} from 'lucide-react';
import type { MessageKey, MessageVars } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { OPEN_PARAM } from '@/hooks/use-open-record';
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

export interface KindDisplay {
  titleKey: MessageKey;
  /** The detail line — interpolated from `params`, money through `formatMoney`. */
  body: (n: TaskFacts) => { key: MessageKey; vars?: MessageVars };
  /** Where the task is handled — the desk, opened on this task's own record. */
  href: (n: TaskFacts) => string;
  /** Rendered with the alert icon and tone instead of the category's. */
  alert?: boolean;
  /**
   * The decision that ends this task WITHOUT the item moving, for a kind whose
   * item may rightly stay as it is — the backend catalogue's `closeOutcome`.
   * Offered on the row; everything else ends only by handling its item.
   */
  close?: { actionKey: MessageKey; titleKey: MessageKey; introKey: MessageKey };
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** "1,250.00 USD" from a row's params, or '' when the row carries no amount. */
function amountOf(n: TaskFacts): string {
  const amount = str(n.params['amount']);
  return amount ? formatMoney(amount, str(n.params['currency'])) : '';
}

/** The client's Portal ID for a URL, or nothing (0133; the client's only id since 0159). */
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

/**
 * The desk, opened on the ONE record the task is about (`?open=<id>`), not
 * filtered to a search typed on the reader's behalf. Every task's params carry
 * its record's id, so the toast — which has params but no feed row — builds the
 * same link. A row without one (never expected) lands on the desk unfiltered.
 */
function opened(path: string, n: TaskFacts, idParam: string): string {
  return link(path, { [OPEN_PARAM]: str(n.params[idParam]) });
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
    href: (n) => opened('/approvals/deposits', n, 'transactionId'),
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
        // Backend 0173 — providers that move another asset, credit what
        // arrived, or confirm late.
        case 'wrong_asset':
          return { key: 'notifications.taskDepositAnomalyWrongAsset', vars };
        case 'over_limit':
          return { key: 'notifications.taskDepositAnomalyOverLimit', vars };
        case 'unconfirmed_funds':
          return { key: 'notifications.taskDepositAnomalyUnconfirmed', vars };
        default:
          return { key: 'notifications.taskDepositAnomalyGeneric', vars };
      }
    },
    // The flagged payment itself, where "Mark resolved" ends this.
    href: (n) => opened('/financial', n, 'transactionId'),
  },
  'admin.withdrawal.requested': {
    titleKey: 'notifications.taskApproveWithdrawal',
    body: (n) => ({
      key: 'notifications.taskApproveWithdrawalBody',
      vars: { amount: amountOf(n) },
    }),
    href: (n) => opened('/transactions', n, 'transactionId'),
  },
  /*
   * A provider refused a payout, or provably never received it (backend 0173,
   * every provider): resend or cancel. The provider is NAMED in the body.
   */
  'withdrawal.payout_submit_failed': {
    titleKey: 'notifications.taskPayoutRefused',
    alert: true,
    body: (n) => ({
      key: 'notifications.taskPayoutRefusedProviderBody',
      vars: {
        amount: amountOf(n),
        provider: str(n.params['provider']) || '—',
        reason: str(n.params['reason']) || '—',
      },
    }),
    href: (n) => opened('/transactions', n, 'transactionId'),
  },
  'withdrawal.payout_attention': {
    titleKey: 'notifications.taskPayoutReconcile',
    alert: true,
    body: (n) => ({
      key: 'notifications.taskPayoutReconcileProviderBody',
      vars: { provider: str(n.params['provider']) || '—' },
    }),
    href: (n) => opened('/transactions', n, 'transactionId'),
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
    href: (n) => opened('/approvals/ib', n, 'applicationId'),
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
    href: (n) => opened('/commissions', n, 'accrualId'),
    // Reversing is done on the commission; keeping it is decided here.
    close: {
      actionKey: 'notifications.keepCommission',
      titleKey: 'notifications.keepCommissionTitle',
      introKey: 'notifications.keepCommissionIntro',
    },
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
    href: (n) => opened('/financial', n, 'transferId'),
  },
};

/** The icon and chip for one row: the alert look for exceptions, else its category's. */
/*
 * ── A kind or category this build does not know ─────────────────────────────
 *
 * The backend deploys FIRST, so the day it gains a kind, a console built the
 * day before receives rows it has no words for. The enum-keyed map makes that a
 * compile error in THIS build — it cannot make yesterday's build learn it. So
 * every lookup goes through these two, and an unknown row is drawn as a plain
 * "Notification" that says to refresh (which is exactly what fixes it), never
 * a crash that takes the whole panel down.
 */
const UNKNOWN_KIND: KindDisplay = {
  titleKey: 'notifications.fallbackTitle',
  body: () => ({ key: 'notifications.fallbackBody' }),
  // No link: nothing here knows where it is handled.
  href: () => '',
};
const UNKNOWN_CATEGORY: CategoryMeta = { icon: Bell, tone: 'bg-muted text-muted-foreground' };

/** The display for a kind — the generic one when this build does not know it. */
export function displayOf(kind: string): KindDisplay {
  return Object.hasOwn(KIND_DISPLAY, kind)
    ? KIND_DISPLAY[kind as AdminNotificationKind]
    : UNKNOWN_KIND;
}

export function lookOf(n: AdminNotification): { icon: React.ElementType; tone: string } {
  if (displayOf(n.kind).alert) return { icon: AlertTriangle, tone: ALERT_TONE };
  const look = Object.hasOwn(CATEGORIES, n.category) ? CATEGORIES[n.category] : UNKNOWN_CATEGORY;
  return { icon: look.icon, tone: look.tone };
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
  if (outcome === 'kept') return { labelKey: 'notifications.outcomeKept', tone: NEUTRAL };
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
