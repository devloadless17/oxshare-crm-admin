import { describe, expect, it } from 'vitest';
import { keys } from './query-keys';

/**
 * THE REGISTRY'S OWN TWO RULES, PINNED.
 *
 * `query-keys.ts` states two rules and enforces neither. Lint guarantees that
 * call sites take their keys FROM the registry — it cannot say anything about
 * the registry's own shape, and the shape is what the production defect was.
 *
 * Rule 1, verbatim: "A badge shares a root with the list it counts." The
 * reported-from-production bug was `invalidateQueries({ queryKey: ['kyc'] })`
 * against a badge sitting at `['admin','kyc','pending-count']` — no shared
 * prefix, so the invalidate matched nothing, resolved happily, refetched
 * nothing, and an approved document left the sidebar reading 1 until someone
 * refreshed. React Query reports nothing when that happens.
 *
 * The fix moved the badge under `keys.kyc.all()`, so ONE invalidate covers the
 * queue, the detail page and the badge. That correctness now rests entirely on
 * a structural property that nothing checks: move `pendingCount` out from under
 * its `all()` and every decision screen silently stops refreshing its badge,
 * with no test failing and no error anywhere.
 *
 * These are cheap and they pin the thing that actually broke.
 */

type KeyFn = () => readonly string[];
type Domain = Record<string, unknown>;

/** Every registry domain that exposes both a root and a count. */
function domainsWithCounts(): [string, KeyFn, KeyFn][] {
  const found: [string, KeyFn, KeyFn][] = [];
  for (const [name, domain] of Object.entries(keys as Record<string, Domain>)) {
    const all = domain['all'];
    const count = domain['pendingCount'];
    if (typeof all === 'function' && typeof count === 'function') {
      found.push([name, all as KeyFn, count as KeyFn]);
    }
  }
  return found;
}

describe("the registry's rule 1 — a badge shares a root with the list it counts", () => {
  it('finds the badges, so this cannot pass by matching nothing', () => {
    // The guard against a vacuous suite: if the registry is refactored and the
    // discovery below stops finding anything, every assertion after it becomes
    // trivially true. Three badges exist today — kyc, withdrawals, ib.
    expect(
      domainsWithCounts()
        .map(([n]) => n)
        .sort(),
    ).toEqual(['ibApplications', 'kyc', 'withdrawals']);
  });

  for (const [name, all, pendingCount] of domainsWithCounts()) {
    it(`keys.${name}.pendingCount() sits under keys.${name}.all()`, () => {
      const root = all();
      const badge = pendingCount();

      expect(
        badge.slice(0, root.length),
        `keys.${name}.pendingCount() is ${JSON.stringify(badge)} and does not extend ` +
          `${JSON.stringify(root)}. React Query invalidates by PREFIX, so one ` +
          `invalidate can no longer cover both — the badge will go stale after a ` +
          `decision and nothing will report it. This is the defect that was reported ` +
          `from production.`,
      ).toEqual([...root]);

      // And strictly longer: identical keys would mean the badge and the list
      // are the same cache entry, which is a different bug wearing the same shape.
      expect(badge.length).toBeGreaterThan(root.length);
    });
  }
});

describe("the registry's rule 2 — one resource, one root", () => {
  it('no two domains share a root segment', () => {
    /*
     * The other half of the original mess: the old code mixed
     * `['admin', <resource>]` and bare `['<resource>']`, and every bug listed in
     * the registry docblock was a pair that landed on opposite sides of that
     * line. Two domains sharing a first segment would make one domain's
     * `all()` silently invalidate the other's caches.
     */
    const roots = Object.entries(keys as Record<string, Domain>)
      .map(([name, d]) => [name, d['all']] as const)
      .filter((e): e is [string, KeyFn] => typeof e[1] === 'function')
      .map(([name, all]) => [name, all()[0]] as const);

    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [name, root] of roots) {
      const owner = seen.get(root ?? '');
      if (owner) clashes.push(`${owner} and ${name} both root at '${root}'`);
      else seen.set(root ?? '', name);
    }
    expect(clashes, `Two resources share a cache root:\n${clashes.join('\n')}`).toEqual([]);
  });
});
