import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY SORT THE CONSOLE OFFERS IS ONE THE API ACCEPTS.
 *
 * ## The class, and the time it already happened
 *
 * A control the API does not back renders identically to one that works: the
 * table redraws, and an operator cannot tell a refused ordering from an applied
 * one. `CLIENT_SORT_KEYS` records the incident in its own comment — `'type'`
 * was in the allowlist and "the API has never accepted it", because a client's
 * type is DERIVED in SQL and cannot be indexed. Clicking that header replaced
 * the table with an error.
 *
 * The pages are disciplined about this already: each validates the URL's `sort`
 * against its allowlist before sending. That protects against a hand-edited
 * URL. It cannot protect against the allowlist itself being wrong, which is
 * what happened, and which is what this checks.
 *
 * ## Why it can be mechanical
 *
 * The backend declares each list endpoint's accepted orderings as an `enum` on
 * the `sort` query parameter, and `openapi.json` is committed and gate-checked
 * (`scripts/gen-openapi.mjs --check`, which refuses a stale build). So the
 * question "does the API accept this ordering" has an answer in a file, and
 * drift is a diff rather than a bug report.
 *
 * The direction matters: a key the API accepts and the console does not offer
 * is a missing feature, not a defect, so only the reverse is asserted.
 */

type OpenApiSpec = {
  paths: Record<
    string,
    Record<string, { parameters?: { name: string; schema?: { enum?: string[] } }[] }>
  >;
};

/**
 * ⚠️ THIS READS A SIBLING REPO, SO IT MUST NOT BE A HARD DEPENDENCY.
 *
 * `openapi.json` lives in the backend. On a developer's machine the four repos
 * sit side by side and it is right there; in CI only THIS repo is checked out,
 * so the read throws ENOENT at import time and the whole file fails to collect —
 * which is how it landed: 82 files passed, this one errored, and eleven tests
 * silently left the run.
 *
 * `check:twins` already settled this for the same reason and in the same
 * direction: "it is advisory and skips cleanly when the sibling repo is not
 * checked out, so CI never depends on a sibling directory." A cross-repo check
 * that fails the build when the other repo is absent is not stricter, it is just
 * broken somewhere it was never able to run.
 *
 * The skip is DECLARED rather than silent — the reason is in the describe name,
 * so a reader of the summary sees "skipped: the backend is not checked out here"
 * rather than a count that quietly dropped by eleven.
 */
function loadSpec(): OpenApiSpec | null {
  for (const candidate of [
    /*
     * CI FIRST, because that is where this census earns its keep.
     *
     * `.contract/openapi.json` is where `.github/workflows/ci.yml` sparse-checks
     * out the backend's contract for `check-api-types.sh`. Without this entry
     * the census found no spec in CI and skipped — declared and visible, but
     * skipped — so the one check that catches a sort key the API refuses ran
     * only on a machine with all four repos side by side. A contract census
     * that cannot see the contract in CI is the shape of thing this file exists
     * to refuse.
     */
    '.contract/openapi.json',
    '../oxshare-crm-backend/openapi.json',
    '../../oxshare-crm-backend/openapi.json',
  ]) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')) as OpenApiSpec;
    } catch {
      // Try the next location; absence is a legitimate environment, not a failure.
    }
  }
  return null;
}

const SPEC = loadSpec();

/** The allowlist name in `lib/api/admin.ts` → the endpoint it is sent to. */
const OFFERED_TO = {
  CLIENT: '/v1/admin/clients',
  KYC: '/v1/admin/kyc',
  AUDIT: '/v1/admin/audit-log',
  WALLET: '/v1/admin/wallets',
  WITHDRAWAL: '/v1/admin/withdrawals',
  TRANSACTION: '/v1/admin/transactions',
  TRADING_ACCOUNT: '/v1/admin/trading-accounts',
  IB_ACCRUAL: '/v1/admin/ib/accruals',
  IB_APPLICATION: '/v1/admin/ib/applications',
  IB_PARTNER: '/v1/admin/ib/partners',
} as const;

function apiAccepts(path: string): Set<string> | null {
  const params = SPEC?.paths[path]?.['get']?.parameters ?? [];
  const sort = params.find((p) => p.name === 'sort');
  return sort ? new Set(sort.schema?.enum ?? []) : null;
}

/**
 * The keys an allowlist offers.
 *
 * Comments are stripped FIRST. These arrays carry long explanations of why a
 * key is absent — `CLIENT_SORT_KEYS` explains the `'type'` incident inline —
 * and an apostrophe in that prose ("a client's type") reads as a string
 * literal to a naive matcher, which then reports drift that is really a
 * possessive. Found exactly that way while writing this.
 */
function consoleOffers(name: string): Set<string> | null {
  const src = readFileSync('src/lib/api/admin.ts', 'utf8');
  const match = new RegExp(`${name}_SORT_KEYS = \\[(.*?)\\] as const`, 's').exec(src);
  if (!match?.[1]) return null;
  const withoutComments = match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return new Set([...withoutComments.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? ''));
}

/**
 * ⚠️ AND EVERY SCREEN THAT OFFERS A SORT MUST BE ONE THIS FILE CAN SEE.
 *
 * The census above reads `<NAME>_SORT_KEYS` out of `lib/api/admin.ts`. That is
 * its subject list, and it is DERIVED — so a screen which declares its sortable
 * headers INLINE, in its own `columns` array, is not checked by it at all. Not
 * reported as uncovered: invisible.
 *
 * Measured 11 Sep 2026: ten console screens declare `sortKey:`, and SEVEN import
 * an allowlist. The other three — roles, products, agencies — were outside the
 * census entirely, and the roles screen offers a `description` sort that
 * `ROLE_SORT_COLUMNS` does not accept. All three sort client-side against
 * unpaginated endpoints, so nothing ever asks the API for that key and the 400
 * it would answer is unreachable.
 *
 * That mismatch is left in place DELIBERATELY, and the three files now say so
 * together (`roles.store.ts`, `roles/page.tsx`, here). Adding the key was tried
 * and withdrawn the same day: a key in a `*_SORT_COLUMNS` map is a promise of an
 * INDEX, not of a column — `admin-sort-indexes.spec.ts` imports every allowlist
 * and EXPLAINs each ordering under `enable_seqscan = off` — so it would have
 * bought a b-tree on a nullable text column of a ten-row table for a sort no
 * caller performs. The day any of these three is wired to the server, that spec
 * forces the index into the same commit, which is the outcome the roles
 * screen's docblock asks for, arrived at by a failing test rather than by
 * trusting somebody to have read a comment.
 *
 * This is the vacuity shape one level out from the one the file above guards:
 * the check was correct about everything it looked at, and the thing it did not
 * look at is where the mismatch was. A derived subject list needs an assertion
 * that it covers the population — not only a floor on how many it found.
 *
 * So a screen with inline sort keys must be one of two things, explicitly:
 * covered by an allowlist, or declared client-side with the reason. Silence is
 * the state this refuses.
 */
const CLIENT_SIDE_SORTED = new Set([
  // `GET /admin/roles` returns every role as an array — no page, limit or
  // cursor — so the screen holds the whole dataset and DataTable orders all of
  // it. Its endpoint DOES accept sort/order, which the page does not use.
  'roles',
  // `GET /admin/products` and `/admin/agencies` take no query parameters at
  // all. Unpaginated by construction, so client-side ordering IS ordering the
  // dataset.
  'products',
  'agencies',
]);

describe('every screen that offers a sort is visible to this census', () => {
  /*
   * Walked rather than globbed. `fs.globSync` exists on this Node but is not in
   * the typed surface TypeScript compiles against, so it runs green under vitest
   * and fails `tsc --noEmit` — a test that passes and a repo that does not
   * typecheck, which is the split this project's gates exist to close and which
   * landed in this repo once already today.
   */
  const CONSOLE_ROOT = join('src', 'app', '(console)');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('page.tsx') ? [full] : [];
    });

  const screens = walk(CONSOLE_ROOT)
    .filter((file) => readFileSync(file, 'utf8').includes('sortKey:'))
    .map((file) => ({
      file,
      name: file
        .slice(CONSOLE_ROOT.length + 1)
        .replace(/[\\/]page\.tsx$/, '')
        .replace(/\\/g, '/'),
      censused: readFileSync(file, 'utf8').includes('_SORT_KEYS'),
    }));

  it('found the screens it is meant to be checking', () => {
    /*
     * NON-VACUITY. Every assertion below passes trivially against an empty
     * list, and an empty list is exactly what a broken glob produces — which is
     * the failure this whole file exists to name.
     */
    expect(
      screens.length,
      'no console screen appears to declare a sortKey, which cannot be true of this app — ' +
        'the walk or the filter is not matching, and every case below is passing over nothing',
    ).toBeGreaterThan(5);
  });

  it('has no screen offering a sort that is neither censused nor declared client-side', () => {
    const invisible = screens
      .filter((s) => !s.censused && !CLIENT_SIDE_SORTED.has(s.name))
      .map((s) => s.name);

    expect(
      invisible,
      'these screens offer sortable headers, do not use a *_SORT_KEYS allowlist, and are ' +
        'not declared client-side — so nothing checks their sort keys against the API. ' +
        'Either give the screen an allowlist (and add it to OFFERED_TO above), or add it to ' +
        'CLIENT_SIDE_SORTED with the reason its endpoint is unpaginated.',
    ).toEqual([]);
  });

  it('has no STALE client-side exemption — each one still exists and still avoids the allowlist', () => {
    /*
     * The mirror, and the reason an exemption list needs one: a name left here
     * after the screen gained an allowlist, or after the screen was deleted,
     * silently excuses nothing and looks like diligence.
     */
    const names = new Set(screens.map((s) => s.name));
    const stale = [...CLIENT_SIDE_SORTED].filter(
      (name) => !names.has(name) || screens.find((s) => s.name === name)?.censused === true,
    );
    expect(
      stale,
      'these are exempted as client-side but no longer need to be — the screen is gone, or ' +
        'it now uses an allowlist and is censused for real. Remove them.',
    ).toEqual([]);
  });
});

describe.skipIf(SPEC === null)(
  'every sort the console offers is one the API accepts ' +
    '(skipped here: oxshare-crm-backend is not checked out beside this repo, ' +
    'so openapi.json cannot be read — see loadSpec above)',
  () => {
    for (const [name, path] of Object.entries(OFFERED_TO)) {
      it(`${name}_SORT_KEYS is accepted by GET ${path}`, () => {
        const offered = consoleOffers(name);
        expect(offered, `${name}_SORT_KEYS was not found in lib/api/admin.ts`).not.toBeNull();

        const accepted = apiAccepts(path);
        expect(
          accepted,
          `GET ${path} declares no \`sort\` parameter, but the console offers ` +
            `${[...(offered ?? [])].join(', ')}. Either the endpoint lost its ordering or the ` +
            'allowlist is pointed at the wrong route.',
        ).not.toBeNull();

        const refused = [...(offered ?? [])].filter((k) => !accepted?.has(k));
        expect(
          refused,
          `These orderings are offered by the console and REFUSED by ${path}. Clicking such a ` +
            `header replaces the table with an error, and looks identical to a sort that ` +
            `worked:\n${refused.map((k) => `  ${k}`).join('\n')}`,
        ).toEqual([]);
      });
    }

    it('covers every sort allowlist the console defines', () => {
      /*
       * The list above is hand-written, so it can fall behind. This makes that a
       * red build rather than a silent gap — a new allowlist is a new surface
       * with no contract check until somebody maps it.
       */
      const src = readFileSync('src/lib/api/admin.ts', 'utf8');
      const defined = [...src.matchAll(/export const (\w+)_SORT_KEYS = \[/g)].map(
        (m) => m[1] ?? '',
      );
      const unmapped = defined.filter((n) => !(n in OFFERED_TO));
      expect(
        unmapped,
        'These sort allowlists exist and are checked against no endpoint. Add them to ' +
          `OFFERED_TO:\n${unmapped.map((n) => `  ${n}_SORT_KEYS`).join('\n')}`,
      ).toEqual([]);
    });
  },
);
