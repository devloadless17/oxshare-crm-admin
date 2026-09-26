import { expect, test } from './fixtures';
import { collectRejections, openNavItem } from './helpers';

/**
 * ADM-13 and RBAC-08, in a real browser against the real API.
 *
 * Both were built from a tracker row rather than from a running screen, so the
 * question a browser answers and a unit suite cannot is whether the console and
 * the API agree. Each feature has a permission key that has to match in three
 * places — the route table, the nav filter and the endpoint's decorator — and a
 * disagreement shows an operator a page that then 403s. jsdom mocks the API, so
 * it cannot see that at all.
 */

test.describe('ADM-13 — the ledger', () => {
  test('renders, and the API does not refuse anything it asks for', async ({ page }) => {
    const rejections = collectRejections(page);
    const forbidden: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 403) forbidden.push(`${res.request().method()} ${res.url()}`);
    });

    await page.goto('/ledger');

    await expect(page.getByRole('heading', { name: 'Ledger', exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    // The point of the new `ledger.view` key: a 403 here would mean the console
    // offers a screen the API refuses, which is the exact drift these run for.
    expect(forbidden, `the ledger asked for something the API refused`).toEqual([]);
    expect(rejections.list()).toEqual([]);
  });

  test('filters by entry type through the SERVER, not the browser', async ({ page }) => {
    await page.goto('/ledger');
    await expect(page.getByRole('main')).toBeVisible();

    const request = page.waitForRequest(
      (r) => r.url().includes('/admin/ledger') && r.url().includes('entryType=deposit'),
    );
    await page.getByLabel(/entry type/i).click();
    await page.getByRole('option', { name: 'Deposit' }).click();
    await request; // resolves only if the filter reached the API

    await expect(page).toHaveURL(/entryType=deposit/);
  });

  test('offers no control that would edit an append-only row', async ({ page }) => {
    // `ledger_entries` is append-only and a trigger refuses UPDATE and DELETE.
    await page.goto('/ledger');
    await expect(page.getByRole('main')).toBeVisible();

    const table = page.getByRole('table');
    await expect(table.getByRole('button', { name: /edit|delete|remove/i })).toHaveCount(0);
  });

  test('is reachable from the sidebar, not only by typing the URL', async ({ page }) => {
    await page.goto('/dashboard');
    // Under Finance, beside Reconciliation: the report says whether the books
    // balance, and the ledger is the evidence read when they do not.
    await openNavItem(page, 'Finance', 'Ledger');
    await expect(page).toHaveURL(/\/ledger$/);
  });
});

test.describe('RBAC-08 — Network Access', () => {
  test('an old Settings → Security link lands on the page', async ({ page }) => {
    await page.goto('/settings?tab=security');
    await expect(page).toHaveURL(/\/network-access$/);
  });

  test('the Network access page opens and says the protection is OFF', async ({ page }) => {
    const forbidden: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 403) forbidden.push(`${res.request().method()} ${res.url()}`);
    });

    // Its own page under Security since 25 Sep 2026 — it was a Settings tab.
    // From a console page, as its neighbour does: a fresh test page is blank,
    // with no sidebar to open (this case timed out on about:blank).
    await page.goto('/dashboard');
    await openNavItem(page, 'Security', 'Network access');
    await expect(page).toHaveURL(/\/network-access$/);

    await expect(page.getByRole('heading', { name: /network access/i })).toBeVisible();
    /*
     * With no rules configured the panel must SAY the protection is off. A page
     * titled "Network access" showing no errors reads as protection to anybody
     * who does not know an empty list disables the feature — and on a fresh
     * database the list is empty.
     */
    await expect(
      page.getByText(/protection is OFF|Enforcing|switched OFF by configuration/i),
    ).toBeVisible();

    expect(forbidden, 'the panel asked for something the API refused').toEqual([]);
  });

  test('states the address the SERVER sees, rather than printing it bare', async ({ page }) => {
    /*
     * The confusion that got this feature deleted. In development the request
     * reaches the API through the console's own rewrite, so the address is
     * ::1 — not the operator's public address. A rule for the address they can
     * see in a browser is one the server can never match.
     */
    await page.goto('/network-access');
    await expect(
      page.getByText(/the address the SERVER sees|could not determine the address/i),
    ).toBeVisible();
  });

  test('warns before the FIRST rule, which is the one that starts enforcement', async ({
    page,
  }) => {
    await page.goto('/network-access');
    await expect(page.getByRole('heading', { name: /network access/i })).toBeVisible();

    /*
     * ASSERT the empty state, do not probe for it.
     *
     * This was a `test.skip` on `isVisible().catch(() => false)`, meant to step
     * aside when a database already had rules. Two things were wrong with it.
     * `isVisible()` does NOT auto-wait — it answers about this instant — so
     * before the panel finished rendering it returned false and the case
     * skipped itself for a reason unrelated to any rule. And a skipped
     * Playwright test reports as PASSING, so the warning that guards the one
     * irreversible click in RBAC-08 was going unchecked and reading as green.
     *
     * It is also the trap alpha's KYC row had: add a single rule by hand and
     * the test retires permanently, silently, with the suite still green.
     *
     * The suite's own contract already fixes the state — the block below this
     * one asserts the allowlist is a complete no-op "while no rule is
     * configured", so an empty list is a precondition of this FILE, not a
     * coincidence of the database. Asserting it makes that explicit: if rules
     * exist, this run cannot prove what it claims and must say so.
     */
    await expect(
      page.getByText(/protection is OFF/i),
      'this database already has allowlist rules, so the first-rule warning cannot be observed',
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/this is the FIRST rule/i)).toBeVisible();
  });
});

test.describe('the allowlist does not interfere with anything else', () => {
  /*
   * The reason this block exists: RBAC-08 was deleted once because it caused
   * problems, and a global guard is exactly the kind of thing that breaks a
   * neighbouring feature quietly. With no rules configured it must be a
   * complete no-op — so these are ordinary pages, asserted to be untouched.
   */
  for (const route of ['/dashboard', '/clients', '/kyc', '/transactions', '/admin-users']) {
    test(`${route} is unaffected while no rule is configured`, async ({ page }) => {
      const forbidden: string[] = [];
      page.on('response', (res) => {
        if (res.status() === 403) forbidden.push(`${res.request().method()} ${res.url()}`);
      });

      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      expect(forbidden, `${route} was refused with the allowlist empty`).toEqual([]);
    });
  }
});
