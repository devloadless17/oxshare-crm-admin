import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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

const SPEC = JSON.parse(readFileSync('../oxshare-crm-backend/openapi.json', 'utf8')) as {
  paths: Record<
    string,
    Record<string, { parameters?: { name: string; schema?: { enum?: string[] } }[] }>
  >;
};

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
  const params = SPEC.paths[path]?.['get']?.parameters ?? [];
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

describe('every sort the console offers is one the API accepts', () => {
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
    const defined = [...src.matchAll(/export const (\w+)_SORT_KEYS = \[/g)].map((m) => m[1] ?? '');
    const unmapped = defined.filter((n) => !(n in OFFERED_TO));
    expect(
      unmapped,
      'These sort allowlists exist and are checked against no endpoint. Add them to ' +
        `OFFERED_TO:\n${unmapped.map((n) => `  ${n}_SORT_KEYS`).join('\n')}`,
    ).toEqual([]);
  });
});
