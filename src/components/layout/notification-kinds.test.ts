import { describe, expect, it } from 'vitest';
import { KIND_CONFIG, queryKeysFor } from './notification-kinds';
import { keys, REGISTERED_ROOTS } from '@/lib/query-keys';

/**
 * The test that would have caught the bug the owner reported.
 *
 * Three of this map's keys named nothing — `['admin','partner-applications']`,
 * `['admin','clients']` — and a fourth reached the KYC sidebar badge but not
 * the queue beneath it. React Query answers an invalidate against a key no
 * query uses by matching nothing, resolving successfully and refetching
 * nothing, so every one of them looked correct at the call site, produced a
 * toast and a chime, and left the operator reading a stale table.
 *
 * Nothing observable distinguishes that from a working invalidate. These
 * assertions are the only thing that does.
 */

/** React Query's own matching rule: a key matches if it is a PREFIX. */
const invalidates = (invalidated: readonly unknown[], queryKey: readonly unknown[]): boolean =>
  invalidated.length <= queryKey.length &&
  invalidated.every((segment, i) => Object.is(segment, queryKey[i]));

describe('queryKeysFor', () => {
  it('gives every announced kind something to refresh', () => {
    /*
     * A kind with copy, an icon and a destination is one the console SHOWS.
     * Announcing a change and refreshing nothing is the worst of the three
     * possible outcomes, because it looks live: the operator is told the
     * platform decided something, then reads a table that says otherwise.
     */
    for (const kind of Object.keys(KIND_CONFIG)) {
      expect(queryKeysFor(kind), `${kind} announces but refreshes nothing`).not.toHaveLength(0);
    }
  });

  it('never invalidates a key no screen reads', () => {
    // The dead-key regression, stated directly. `['admin','partner-applications']`
    // passed review, type-checked, ran, and refreshed nothing for months.
    for (const kind of Object.keys(KIND_CONFIG)) {
      for (const key of queryKeysFor(kind)) {
        expect(
          REGISTERED_ROOTS,
          `${kind} invalidates unregistered ${JSON.stringify(key)}`,
        ).toContain(key[0]);
      }
    }
  });

  it('refreshes the KYC queue AND its sidebar badge, not one or the other', () => {
    /*
     * The precise inversion that shipped: the KYC MUTATION invalidated the
     * queue only, and the KYC NOTIFICATION invalidated the badge only, so
     * neither path ever covered both. They share a root now.
     */
    const invalidated = queryKeysFor('admin.kyc.submitted');
    for (const surface of [keys.kyc.queue({ page: 1 }), keys.kyc.pendingCount()]) {
      expect(
        invalidated.some((key) => invalidates(key, surface)),
        `admin.kyc.submitted misses ${JSON.stringify(surface)}`,
      ).toBe(true);
    }
  });

  it('refreshes the IB approvals queue and its badge', () => {
    const invalidated = queryKeysFor('admin.partner.applied');
    for (const surface of [keys.ibApplications.list({}), keys.ibApplications.pendingCount()]) {
      expect(invalidated.some((key) => invalidates(key, surface))).toBe(true);
    }
  });

  it('refreshes the clients list on a registration', () => {
    expect(
      queryKeysFor('admin.client.registered').some((key) =>
        invalidates(key, keys.clients.list({ page: 1 })),
      ),
    ).toBe(true);
  });

  it('reaches the balances a settled withdrawal moved', () => {
    /*
     * A Rival rejection posts a COMPENSATING CREDIT back to the wallet, so a
     * withdrawal event that refreshed only the desk left the money screens
     * showing the pre-refund balance.
     */
    const invalidated = queryKeysFor('withdrawal.rival_rejected');
    for (const surface of [
      keys.withdrawals.list({}),
      keys.withdrawals.pendingCount(),
      keys.wallets.list({}),
      keys.ledger.list({}),
    ]) {
      expect(
        invalidated.some((key) => invalidates(key, surface)),
        `misses ${JSON.stringify(surface)}`,
      ).toBe(true);
    }
  });

  it('leaves the audit log alone', () => {
    /*
     * Deliberately NOT live. It is a forensic record read deliberately and
     * paginated; refetching it under a reader moves the rows they are reading.
     */
    for (const kind of Object.keys(KIND_CONFIG)) {
      for (const key of queryKeysFor(kind)) {
        expect(
          invalidates(key, keys.auditLog.list({ page: 1 })),
          `${kind} refetches the audit log`,
        ).toBe(false);
      }
    }
  });

  it('ignores a kind the backend invented after this build', () => {
    expect(queryKeysFor('something.nobody.shipped')).toEqual([]);
  });
});
