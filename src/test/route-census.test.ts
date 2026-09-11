import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY SCREEN IS RENDERED BY A TEST, AND EVERY SCREEN THAT FETCHES SAYS WHAT
 * IT DOES WHEN THE FETCH FAILS.
 *
 * ## Why this exists
 *
 * The backend makes forgetting a red build. `route-authorization.spec.ts`
 * refuses a route that declares no guard; `audit-coverage.spec.ts` refuses a
 * mutation that declares no audit stance; `client-scope-coverage.spec.ts`
 * refuses a route that declares no scope stance — and each has an enforcement
 * twin that proves the declaration is not a lie. That is why backend defects
 * are rare here.
 *
 * The frontends had no equivalent, and every defect found by hand recently was
 * frontend-shaped: a stale badge, a tab count, a filter missing from the URL, a
 * control the API does not back, a screen with no error state. This is the
 * first of that pair for the console — it derives its input from the FILE
 * SYSTEM rather than from a list somebody maintains, so a page added tomorrow
 * is covered without anyone remembering to add it here.
 *
 * ## Two properties, and they fail differently
 *
 * A page with no render test is UNPROVEN — it may be fine. A page that fetches
 * and renders no `AsyncBoundary` is a page whose failure state is a design
 * nobody chose: `useResource` distinguishes loading / ready / unavailable /
 * forbidden / unauthenticated / error, and a screen that ignores that renders a
 * 403 as "something went wrong" and an outage as an empty list. Slice 2 shipped
 * exactly that — a failed queue load reading to a reviewer as "no submissions
 * match the current filters", which is an empty compliance backlog.
 *
 * ## The lists SHRINK
 *
 * `UNTESTED` is thirteen screens that predate this check. It is frozen: a new
 * page cannot join it, and every entry removed is a screen that gained a test.
 * That is the ratchet this repo already uses for lint warnings and coverage
 * floors, for the reason it uses them — a threshold set above the measured
 * number gets disabled the first time it blocks someone.
 */

/**
 * Every page in the console, DERIVED — never listed.
 *
 * A plain walk rather than a glob dependency: the point of deriving is that a
 * page added tomorrow is covered without anyone editing this file, and that
 * property should not rest on a package.
 */
function pages(root = 'src/app'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...pages(path));
    else if (entry.name === 'page.tsx') found.push(path);
  }
  return found.sort();
}

/**
 * Screens with no colocated `page.test.tsx`, as of this check landing.
 *
 * FROZEN. Remove entries as they gain tests; never add one.
 *
 * The entry this list used to name first — `transactions/page.tsx`, the
 * withdrawals desk, the largest file in the app and once "the only core money
 * screen with no render test at all" — is GONE from it, which is the ratchet
 * working. It was closed in Domain 6 because the desk decides whether a
 * client's money leaves the platform, and a failed load there reads as an empty
 * queue.
 */
const UNTESTED = new Set([
  'src/app/(console)/api-keys/new/page.tsx',
  'src/app/(console)/api-keys/page.tsx',
  'src/app/(console)/bridge/page.tsx',
  'src/app/(console)/commissions/page.tsx',
  'src/app/(console)/currencies/page.tsx',
  'src/app/(console)/payment-methods/page.tsx',
  'src/app/(console)/profile/page.tsx',
  'src/app/(console)/reconciliation/page.tsx',
  'src/app/(console)/roles/[id]/edit/page.tsx',
  'src/app/(console)/roles/new/page.tsx',
  'src/app/page.tsx',
  'src/app/reset-password/page.tsx',
]);

describe('every console screen is rendered by a test', () => {
  it('no page ships without one, and the frozen list only shrinks', () => {
    const missing = pages().filter(
      (p) => !existsSync(p.replace('page.tsx', 'page.test.tsx')) && !UNTESTED.has(p),
    );
    expect(
      missing,
      'These pages render nothing under test. Add a `page.test.tsx` beside each — ' +
        '`src/test/render.tsx` supplies the providers:\n' +
        missing.map((p) => `  ${p}`).join('\n'),
    ).toEqual([]);
  });

  it('the frozen list names only pages that still exist and still lack a test', () => {
    /*
     * The other direction, and the one that rots. A stale exemption looks like
     * diligence and protects nothing — `response-shape-coverage.spec.ts` in the
     * backend makes the same assertion for the same reason.
     */
    const stale = [...UNTESTED].filter(
      (p) => !existsSync(p) || existsSync(p.replace('page.tsx', 'page.test.tsx')),
    );
    expect(
      stale,
      'These are exempted and no longer need to be — the page gained a test, or went ' +
        `away. Delete them from UNTESTED:\n${stale.map((p) => `  ${p}`).join('\n')}`,
    ).toEqual([]);
  });
});

describe('every screen that fetches declares its failure state', () => {
  it('a page using useResource renders an AsyncBoundary', () => {
    /*
     * No exemptions, deliberately. There is exactly one offender and it is the
     * KYC review screen — the surface where a 403 must read as "your
     * permissions" and an outage must not read as "nothing to review". Fixing
     * it is cheaper than carrying a list, and a list of one invites a second.
     */
    const unguarded = pages().filter((p) => {
      const src = readFileSync(p, 'utf8');
      return src.includes('useResource') && !src.includes('AsyncBoundary');
    });
    expect(
      unguarded,
      'These pages fetch through useResource and render no AsyncBoundary, so their ' +
        'forbidden / unavailable / error states are whatever the page improvised:\n' +
        unguarded.map((p) => `  ${p}`).join('\n'),
    ).toEqual([]);
  });
});
