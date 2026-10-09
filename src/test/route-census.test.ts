import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
/*
 * POSIX `join`, deliberately. Every path this file derives is compared with
 * forward-slash literals (route prefixes, frozen lists, `src/app/...` keys),
 * and the platform `join` hands back BACKSLASHES on Windows — which turned this
 * census into a wall of false failures on every developer machine while CI, on
 * Linux, stayed green. `readdirSync` accepts forward slashes on every platform.
 */
import { join } from 'node:path/posix';

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
  'src/app/(console)/api-keys/page.tsx',
  'src/app/(console)/bridge/page.tsx',
  'src/app/(console)/currencies/page.tsx',
  'src/app/(console)/profile/page.tsx',
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

describe('a sortable column is backed by a real ordering', () => {
  /*
   * `DataTable` sorts CLIENT-SIDE when the caller passes no `onSortChange` —
   * which sorts the rows it currently holds. On a server-paginated screen that
   * is one page, so "sort by amount" orders 25 rows and presents the result as
   * the ordering of the list. R-2.5 names that failure exactly.
   *
   * The component's own comment carried the rule and had gone stale with it:
   * "No list endpoint accepts a sort parameter today, so callers that need a
   * true ordering must not mark a column sortable." Twelve `*_SORT_COLUMNS`
   * allowlists exist on the API now and ten screens here already pass
   * `onSortChange`, so the premise was false and the rule it justified was
   * left resting on it.
   *
   * This is the rule in the form that stays true, and enforced rather than
   * described: a page marking a column `sortable` must either sort on the
   * SERVER (`onSortChange`) or hold the WHOLE dataset (`clientPagination`),
   * where sorting first and slicing second is honest.
   */
  it('no page marks a column sortable without a server sort or the whole dataset', () => {
    const offenders: string[] = [];

    for (const page of pages()) {
      const source = readFileSync(page, 'utf8');
      if (!/\bsortKey\b/.test(source)) continue;

      const serverSorted = /\bonSortChange\b/.test(source);
      const holdsEverything = /\bclientPagination\b/.test(source);
      if (!serverSorted && !holdsEverything) offenders.push(page);
    }

    expect(
      offenders,
      'These screens mark a column sortable, do not pass onSortChange, and are not holding ' +
        'the whole dataset — so clicking the header sorts ONE PAGE and shows it as the ' +
        'ordering of the list:\n' +
        offenders.map((p) => `  ${p}`).join('\n'),
    ).toEqual([]);
  });

  it('finds the sortable screens at all, so this cannot pass vacuously', () => {
    // A regex that stopped matching would report a clean bill of health for
    // every screen at once — the failure a census must not have.
    const sortable = pages().filter((page) => /\bsortKey\b/.test(readFileSync(page, 'utf8')));
    expect(sortable.length).toBeGreaterThanOrEqual(10);
  });
});

describe('every console screen declares who may open it', () => {
  /*
   * ⚠️ NOT a hole, and the framing matters.
   *
   * `canAccess` ends with `if (!match) return false`, so a page with no entry in
   * `ROUTE_REQUIREMENTS` is refused for EVERYONE — deliberately: "a new page
   * fails visibly for its author on the first click, instead of quietly showing
   * itself to everyone until the API refuses the data behind it". And the client
   * side is not the enforcement in any case; `PermissionsGuard` answers 403
   * whatever this file says (ARCHITECTURE §8.8).
   *
   * So the failure a missing entry produces is a screen NOBODY can open, which
   * is visible rather than dangerous. What this adds is finding it in CI instead
   * of on that first click — and, more usefully, proving the reverse: that the
   * entries still describe pages which exist.
   */
  const ROUTE_OF = (page: string) =>
    page
      .replace(/^src\/app/, '')
      .replace(/\/page\.tsx$/, '')
      .replace(/\/\([^)]+\)/g, '')
      .replace(/\/\[[^\]]+\]/g, '/:param') || '/';

  const consoleRoutes = () =>
    pages()
      .filter((page) => page.includes('(console)'))
      .map(ROUTE_OF);

  it('finds the console screens, so this cannot pass vacuously', () => {
    expect(consoleRoutes().length).toBeGreaterThanOrEqual(25);
  });

  it('leaves no console screen without a requirement', async () => {
    const { ROUTE_REQUIREMENT_PREFIXES } = await import('@/lib/permissions');

    const undeclared = consoleRoutes().filter((route) => {
      const concrete = route.replace(/\/:param/g, '');
      return !ROUTE_REQUIREMENT_PREFIXES.some(
        (prefix) => concrete === prefix || concrete.startsWith(prefix + '/'),
      );
    });

    expect(
      undeclared,
      'These console screens match no entry in ROUTE_REQUIREMENTS, so `canAccess` refuses ' +
        'them for every administrator including a master:\n' +
        undeclared.map((r) => `  ${r}`).join('\n'),
    ).toEqual([]);
  });

  it('names no prefix that no longer has a screen', async () => {
    /*
     * The direction that actually decays. An entry for a deleted page is a line
     * that looks like a considered decision and governs nothing — the same
     * staleness the backend's exemption lists are checked for.
     */
    const { ROUTE_REQUIREMENT_PREFIXES } = await import('@/lib/permissions');
    /*
     * EVERY page, not just the console ones. `ROUTE_REQUIREMENTS` also governs
     * `/` and `/login`, which live outside `(console)` — comparing against the
     * console subset alone reported both as orphaned, which is the test being
     * wrong rather than the map.
     */
    const routes = pages()
      .map(ROUTE_OF)
      .map((r) => r.replace(/\/:param/g, ''));

    const orphaned = ROUTE_REQUIREMENT_PREFIXES.filter(
      (prefix) => !routes.some((route) => route === prefix || route.startsWith(prefix + '/')),
    );

    expect(
      orphaned,
      `These prefixes govern no screen that exists:\n${orphaned.map((p) => `  ${p}`).join('\n')}`,
    ).toEqual([]);
  });
});
