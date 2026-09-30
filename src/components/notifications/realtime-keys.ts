import type { AdminNotificationKind } from '@/lib/api/admin-notifications';
import { keys, type AdminQueryKey } from '@/lib/query-keys';

/**
 * Which DATA a realtime event refreshes — what makes the console live rather
 * than merely noisy. The toast announces; these refresh the table the
 * announcement is about, so an operator never reads "awaiting approval" on a
 * row the platform already decided.
 *
 * ⚠️ Every key comes from the registry and is typed as its union, so a key
 * naming nothing is a compile error. That is not decoration: React Query's
 * prefix matching fails SILENTLY — an invalidate against a key no query uses
 * resolves happily and refetches nothing — and three of this map's keys once
 * named nothing, producing a chime, a toast and a stale screen.
 */

const WITHDRAWAL_DATA = [
  keys.withdrawals.all(), // the desk list AND its sidebar badge
  keys.transactions.all(), // Financial: every movement, not just payouts
  keys.wallets.all(), // a refusal refunds; a payout debits
  keys.ledger.all(),
  keys.stats.all(), // the dashboard's withdrawal-volume tile
] as const satisfies readonly AdminQueryKey[];

const DEPOSIT_DATA = [
  // `deposits.all()` FIRST — a prefix of `deposits.pendingCount()`, so the queue
  // and its sidebar badge move together. Wallets are absent: a declaration
  // credits nothing until somebody approves it.
  keys.deposits.all(),
  keys.transactions.all(),
  keys.stats.all(),
] as const satisfies readonly AdminQueryKey[];

const KYC_DATA = [
  // One root covers the queue, the open review page and the sidebar badge;
  // the client list carries a KYC status column.
  keys.kyc.all(),
  keys.clients.all(),
  keys.stats.all(),
] as const satisfies readonly AdminQueryKey[];

/**
 * A new TASK landed. Exhaustive over the backend catalogue's kinds — a kind
 * added there without a line here is a compile error, where a prefix match
 * would quietly refresh whatever its prefix happened to name.
 */
const TASK_DATA: Record<AdminNotificationKind, readonly AdminQueryKey[]> = {
  'admin.deposit.submitted': DEPOSIT_DATA,
  // The anomaly flag shows on Financial's row; the deposit desk lists the row.
  'admin.deposit.attention': DEPOSIT_DATA,
  'admin.withdrawal.requested': WITHDRAWAL_DATA,
  'withdrawal.payout_submit_failed': WITHDRAWAL_DATA,
  'withdrawal.payout_attention': WITHDRAWAL_DATA,
  // Rival's names for the two above, on rows raised before backend 0173.
  'withdrawal.rival_submit_failed': WITHDRAWAL_DATA,
  'withdrawal.rival_attention': WITHDRAWAL_DATA,
  'admin.kyc.submitted': KYC_DATA,
  'admin.kyc.resubmitted': KYC_DATA,
  'admin.partner.applied': [keys.ibApplications.all(), keys.stats.all()],
  'admin.commission.clawback': [keys.ibAccruals.all(), keys.stats.all()],
  // `transactions.all()` covers Financial AND its stuck-transfer banner
  // (`transactions.stuck`); the hold shows on the wallet.
  'admin.transfer.stuck': [keys.transactions.all(), keys.wallets.all()],
};

/** A kind this build does not know refreshes nothing — never a guess. */
export function queryKeysFor(kind: string): readonly AdminQueryKey[] {
  return Object.hasOwn(TASK_DATA, kind) ? TASK_DATA[kind as AdminNotificationKind] : [];
}

/**
 * Every resource the backend can announce a change to — mirrors `RESOURCES` in
 * its `common/realtime/resource-changed.ts`. A RECONNECT re-syncs all of them:
 * a `resource.changed` missed while the socket was down leaves no trace to
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
 * Which DATA a CROSS-OPERATOR change refreshes — "another operator decided
 * something you are looking at". The event carries a resource NAME and nothing
 * else, so this map is the entire interpretation; an unknown resource
 * refreshes nothing.
 *
 * The bell itself is not here: a decision that ends a task reaches the rooms of
 * exactly the admins who held it, as `notification.changed`.
 */
export function resourceKeysFor(resource: string): readonly AdminQueryKey[] {
  switch (resource) {
    case 'kyc':
      return KYC_DATA;
    case 'withdrawals':
      return WITHDRAWAL_DATA;
    case 'ib-applications':
      // An approval CREATES a partner, and the Partners page lists them.
      return [keys.ibApplications.all(), keys.ibPartners.all(), keys.stats.all()];
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
        /*
         * The deposit desk. Approving or rejecting a deposit announces
         * `wallets`, and without this the SECOND operator's desk and its
         * sidebar badge waited out the sixty-second poll still showing a
         * deposit somebody had already decided.
         */
        keys.deposits.all(),
      ];
    default:
      return [];
  }
}
