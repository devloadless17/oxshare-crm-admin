import { expect, test, type Page } from '@playwright/test';
import { CONSOLE_PAGES, collectRejections } from './helpers';

/**
 * Every page of the admin console, as an operator actually meets them.
 *
 * Four questions of each, all of which have broken in these apps before:
 *
 *   1. Does it render, or does something throw on the way in?
 *   2. Does the chrome survive a hard refresh? A layout that decides what to
 *      show from async data flashes or vanishes on reload — that exact bug was
 *      found by a human on the portal, twice, past a passing unit suite.
 *   3. Does it stay signed in, or does a page bounce a valid session to login?
 *   4. Does it ask the API for anything it is not allowed to have?
 *
 * The fourth is the admin-specific one and the reason this file earns a browser.
 * The nav is filtered client-side from a permission catalogue; the API enforces
 * the same catalogue with 403s. They live in separate repos with nothing
 * connecting them, so a disagreement is invisible to both unit suites. A 403
 * here means the console offered something the API refuses.
 *
 * A table, so a new route costs one line — and a route nobody adds a line for is
 * a route nobody checked.
 */

async function expectConsoleChrome(page: Page, where: string): Promise<void> {
  await expect(page.getByRole('main'), `${where} rendered no main content`).toBeVisible();
  await expect(page.getByRole('navigation').first(), `${where} lost its chrome`).toBeAttached();
}

/**
 * The BUILT pages, reachable by a master-level admin — `CONSOLE_PAGES` in
 * `helpers.ts`, shared with the UX sweep.
 *
 * Every entry is a real `page.tsx`: the "Soon" disabled-nav state is gone
 * (sidebar lists places an operator can go, not a roadmap), `/withdrawals`
 * became `/transactions`, and `/invite` became a modal on `/admin-users` —
 * asserting on a route that does not exist would test Next's 404, not this app.
 */
test.describe('every console page', () => {
  for (const route of CONSOLE_PAGES) {
    test(`${route} renders, refreshes and stays signed in`, async ({ page }) => {
      const rejections = collectRejections(page);

      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(page.url(), `${route} redirected away from itself`).toContain(route);
      await expectConsoleChrome(page, route);

      // The hard refresh: a fresh document, an empty in-memory context, and a
      // cookie the app cannot read. Everything it knows it must ask for again.
      await page.reload();
      await page.waitForLoadState('networkidle');
      expect(page.url(), `${route} redirected away after a refresh`).toContain(route);
      await expectConsoleChrome(page, `${route} after refresh`);

      expect(
        rejections.list(),
        `${route} asked the API for something it is not allowed to have`,
      ).toEqual([]);
    });
  }
});

test.describe('the console navigation', () => {
  test('marks exactly one nav item as current, on every page', async ({ page }) => {
    /*
     * The double-highlight regression, asserted rather than remembered.
     *
     * Active state was decided by prefix, so `/kyc/builder` lit up both "KYC"
     * and "KYC Builder" — two places claiming to be where you are. The fix was
     * longest-match (`activeNavHref`), and this is what stops the next nav entry
     * from quietly reintroducing it: any route that is a prefix of another is a
     * candidate, and nobody checks by hand.
     */
    for (const route of ['/dashboard', '/kyc', '/clients', '/roles']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const current = page.getByRole('navigation').first().locator('[aria-current]');
      await expect(current, `${route} did not mark exactly one nav item as current`).toHaveCount(1);
    }
  });

  test('navigates between pages without losing the session', async ({ page }) => {
    // Client-side navigation, not `goto`. A full load re-runs everything and
    // hides state that is built once at mount and never updated again — which is
    // the shape of every layout bug these suites have caught.
    const rejections = collectRejections(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const nav = page.getByRole('navigation').first();
    for (const route of ['/clients', '/kyc', '/roles', '/dashboard']) {
      await nav
        .getByRole('link', { name: new RegExp(route.slice(1).replace('-', ' '), 'i') })
        .first()
        .click();
      await page.waitForURL(new RegExp(route));
      await expectConsoleChrome(page, `${route} via the sidebar`);
    }

    expect(rejections.list()).toEqual([]);
  });
});
