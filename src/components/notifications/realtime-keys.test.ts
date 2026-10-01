import { describe, expect, it } from 'vitest';
import { BROADCAST_RESOURCES, queryKeysFor, resourceKeysFor } from './realtime-keys';
import { KIND_DISPLAY } from './catalogue';
import { keys, REGISTERED_ROOTS } from '@/lib/query-keys';

/**
 * The test that would have caught the bug the owner reported.
 *
 * Three of this map's keys once named nothing, and a fourth reached the KYC
 * sidebar badge but not the queue beneath it. React Query answers an
 * invalidate against a key no query uses by matching nothing, resolving
 * successfully and refetching nothing, so every one of them looked correct at
 * the call site, produced a toast and a chime, and left the operator reading a
 * stale table. Nothing observable distinguishes that from a working
 * invalidate. These assertions are the only thing that does.
 */

/** React Query's own matching rule: a key matches if it is a PREFIX. */
const invalidates = (invalidated: readonly unknown[], queryKey: readonly unknown[]): boolean =>
  invalidated.length <= queryKey.length &&
  invalidated.every((segment, i) => Object.is(segment, queryKey[i]));

const reaches = (invalidated: readonly (readonly unknown[])[], surface: readonly unknown[]) =>
  invalidated.some((key) => invalidates(key, surface));

describe('queryKeysFor — a new task refreshes the data it is about', () => {
  it('gives every task kind something to refresh', () => {
    // Announcing and refreshing nothing is the worst outcome: it LOOKS live.
    for (const kind of Object.keys(KIND_DISPLAY)) {
      expect(queryKeysFor(kind), `${kind} announces but refreshes nothing`).not.toHaveLength(0);
    }
  });

  it('never invalidates a key no screen reads', () => {
    for (const kind of Object.keys(KIND_DISPLAY)) {
      for (const key of queryKeysFor(kind)) {
        expect(
          REGISTERED_ROOTS,
          `${kind} invalidates unregistered ${JSON.stringify(key)}`,
        ).toContain(key[0]);
      }
    }
  });

  it('refreshes the KYC queue AND its sidebar badge, not one or the other', () => {
    const invalidated = queryKeysFor('admin.kyc.submitted');
    expect(reaches(invalidated, keys.kyc.queue({ page: 1 }))).toBe(true);
    expect(reaches(invalidated, keys.kyc.pendingCount())).toBe(true);
  });

  it('refreshes the deposit desk and its badge for a deposit task and an anomaly', () => {
    for (const kind of ['admin.deposit.submitted', 'admin.deposit.attention']) {
      expect(reaches(queryKeysFor(kind), keys.deposits.pendingCount()), kind).toBe(true);
    }
  });

  it('reaches the balances a payout exception may have moved', () => {
    const invalidated = queryKeysFor('withdrawal.payout_submit_failed');
    for (const surface of [
      keys.withdrawals.pendingCount(),
      keys.wallets.list({}),
      keys.ledger.list({}),
    ]) {
      expect(reaches(invalidated, surface), JSON.stringify(surface)).toBe(true);
    }
  });

  it('refreshes Financial’s stuck-transfer banner for a stuck transfer', () => {
    expect(reaches(queryKeysFor('admin.transfer.stuck'), keys.transactions.stuck())).toBe(true);
  });

  it('leaves the audit log alone — a forensic record is read deliberately', () => {
    for (const kind of Object.keys(KIND_DISPLAY)) {
      for (const key of queryKeysFor(kind)) {
        expect(
          invalidates(key, keys.auditLog.list({ page: 1 })),
          `${kind} refetches the audit log`,
        ).toBe(false);
      }
    }
  });

  it('ignores a kind the backend invented after this build — and a prototype name', () => {
    expect(queryKeysFor('something.nobody.shipped')).toEqual([]);
    expect(queryKeysFor('constructor')).toEqual([]);
  });
});

describe('resourceKeysFor — another operator decided something', () => {
  it('gives every announced resource something to refresh, from the registry', () => {
    for (const resource of BROADCAST_RESOURCES) {
      const invalidated = resourceKeysFor(resource);
      expect(invalidated, `${resource} refreshes nothing`).not.toHaveLength(0);
      for (const key of invalidated) expect(REGISTERED_ROOTS).toContain(key[0]);
    }
  });

  it("moves another operator's KYC decision off this queue AND its badge", () => {
    const invalidated = resourceKeysFor('kyc');
    expect(reaches(invalidated, keys.kyc.queue({ page: 1 }))).toBe(true);
    expect(reaches(invalidated, keys.kyc.pendingCount())).toBe(true);
  });

  it("moves another operator's DEPOSIT decision off this desk — it announces `wallets`", () => {
    // The sixty-second lag the second operator used to see.
    const invalidated = resourceKeysFor('wallets');
    expect(reaches(invalidated, keys.deposits.list({}))).toBe(true);
    expect(reaches(invalidated, keys.deposits.pendingCount())).toBe(true);
  });

  it('puts a newly approved partner on the Partners page', () => {
    expect(reaches(resourceKeysFor('ib-applications'), keys.ibPartners.all())).toBe(true);
  });

  it('refreshes nothing for a resource this build does not know', () => {
    expect(resourceKeysFor('something-new')).toEqual([]);
  });
});
