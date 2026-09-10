import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY CACHE A SCREEN READS IS INVALIDATED BY SOMETHING THAT CHANGES IT.
 *
 * ⚠️ BY SOMETHING — NOT BY THE RIGHT THING. READ THIS BEFORE TRUSTING IT.
 *
 * This proves each key has AT LEAST ONE invalidator somewhere in the app. It
 * cannot tell whether the mutation that actually makes a key stale is among
 * them, because "which writes affect which reads" is a fact about the domain
 * and not about the source.
 *
 * The concrete shape it would miss, found while sweeping Domain 2 on 11 Sep
 * 2026: `/tags` renders a `clientCount` per tag, and attaching a tag from a
 * client's profile moves that number. Those live under DIFFERENT roots —
 * `keys.tags.all()` and `keys.clients.all()` — so nothing about the addressing
 * connects them. The profile's mutation invalidates BOTH, deliberately, with
 * the reason in place at `clients/[id]/page.tsx:139`: *"Also the tags screen:
 * getTags returns ClientTagWithCount, so attaching or detaching moves a number
 * an operator reads elsewhere."*
 *
 * That is correct — and this census would have been just as green without the
 * second line, because `/tags` invalidates `keys.tags.all()` on its own
 * create/rename/delete, which satisfies "invalidated by something". The counts
 * would then have gone stale on exactly the write that moves them, and the
 * screen would have been right on load and wrong forever after: the very
 * symptom described below.
 *
 * So this closes the case where a key has NO invalidator, which is the one that
 * produced six reported defects. It does not close CROSS-ROOT staleness, where
 * a write under one root moves a number read under another. Nothing here
 * detects that, and a green run must not be read as saying otherwise. That is
 * a job for the domain sweep, and it is where it was found.
 *
 * ## The defect class this exists for
 *
 * A stale read after a write is the single most frequent frontend defect in
 * this project's history. `src/lib/query-keys.ts` was written after SIX of
 * them, and its docblock lists the shape: KYC approve invalidated `['kyc']`
 * while the sidebar badge sat at `['admin','kyc','pending-count']`, so an
 * approved document left the badge reading `1` until the 60-second poll. That
 * was reported from production.
 *
 * The registry fixed the ADDRESSING — a call site can no longer invent a key,
 * because lint refuses an array literal in `queryKey` or `invalidateQueries`.
 * It does not, and cannot, answer the next question: is anything invalidating
 * this key at all? A screen may read a perfectly well-addressed cache that no
 * mutation ever refreshes, and the symptom is a number that is right when the
 * page loads and wrong forever after. The 9 Sep fix — "the KYC tab counts
 * stayed inside the territory; the badge did not" — is that class surviving
 * the registry.
 *
 * ## Prefix matching is the point, so the check honours it
 *
 * React Query invalidates by PREFIX: `keys.clients.all()` refreshes
 * `keys.clients.list(params)` and `keys.clients.detail(id)` beneath it. So a
 * key counts as covered when it is invalidated directly OR when its root's
 * `.all()` is. Ignoring that would demand a redundant invalidate at every leaf
 * and teach people to silence this file.
 *
 * ## Both directions, because they fail differently
 *
 * A read nothing invalidates goes STALE. An invalidate no query reads is a
 * NO-OP that resolves happily and refreshes nothing — the registry docblock
 * calls that out as the failure "React Query reports nothing when it does".
 * Neither is visible at the call site; both are visible from up here.
 */

const SOURCES = (root = 'src'): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...SOURCES(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
};

/** `keys.a.b` occurrences in a `queryKey:` position — what screens READ. */
function readKeys(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const path of SOURCES()) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/queryKey:\s*keys\.([A-Za-z0-9_.]+)/g)) {
      const key = (m[1] ?? '').split('(')[0] ?? '';
      if (key) out.set(key, [...(out.get(key) ?? []), path]);
    }
  }
  return out;
}

/** `keys.a.b` occurrences inside an invalidate/remove/reset call — what REFRESHES. */
function invalidatedKeys(): Set<string> {
  const out = new Set<string>();
  for (const path of SOURCES()) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(
      /(?:invalidate|remove|cancel|refetch|reset)Queries\(\s*\{[^}]*?keys\.([A-Za-z0-9_.]+)/g,
    )) {
      const key = (m[1] ?? '').split('(')[0];
      if (key) out.add(key);
    }
  }
  return out;
}

/**
 * Caches that are READ and legitimately never invalidated.
 *
 * Both are immutable for the lifetime of the screen reading them, so there is
 * no write to refresh them after. Each needs a reason, and the reason is
 * checked below — an exemption whose premise has gone is worse than none.
 */
const STATIC_READS = new Map([
  [
    'invite.one',
    'validates a one-time invite token on a signed-out page; nothing in the console can change it',
  ],
  [
    'permissions.all',
    'the permission CATALOGUE, read from config on the backend — operator data cannot alter it',
  ],
]);

describe('every cache a screen reads is refreshed by something', () => {
  it('no read key is left with nothing to invalidate it', () => {
    const reads = readKeys();
    const invalidated = invalidatedKeys();
    const coveredRoots = new Set(
      [...invalidated].filter((k) => k.endsWith('all')).map((k) => k.split('.')[0]),
    );

    const stale = [...reads.keys()].filter(
      (key) =>
        !invalidated.has(key) && !coveredRoots.has(key.split('.')[0]) && !STATIC_READS.has(key),
    );

    expect(
      stale,
      'These caches are READ by a screen and no mutation invalidates them or their root. ' +
        'Whatever they show is correct on first load and stale after the next write:\n' +
        stale.map((k) => `  keys.${k}  (${reads.get(k)?.join(', ')})`).join('\n'),
    ).toEqual([]);
  });

  it('no invalidate targets a key no query reads', () => {
    /*
     * The silent half. `invalidateQueries` against a key nothing is registered
     * under matches nothing, resolves successfully, and refreshes nothing —
     * there is no error, no warning, and no test. It reads as a screen that
     * refuses to update for no reason.
     */
    const reads = readKeys();
    const noop = [...invalidatedKeys()].filter((k) => !k.endsWith('all') && !reads.has(k));

    expect(
      noop,
      'These keys are invalidated and no query reads them, so the call refreshes ' +
        `nothing and reports success:\n${noop.map((k) => `  keys.${k}`).join('\n')}`,
    ).toEqual([]);
  });

  it('every declared static read is still read, and still static', () => {
    const reads = readKeys();
    const invalidated = invalidatedKeys();
    const stale = [...STATIC_READS.keys()].filter((k) => !reads.has(k) || invalidated.has(k));
    expect(
      stale,
      'These exemptions no longer hold — the key is gone, or something now invalidates ' +
        `it, which means it was never static. Remove them:\n${stale.map((k) => `  keys.${k}`).join('\n')}`,
    ).toEqual([]);
  });
});
