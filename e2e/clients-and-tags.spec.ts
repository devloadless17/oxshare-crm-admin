import { expect, test } from './fixtures';
import { clientSearchBox, E2E_CLIENTS, E2E_DOMAIN, E2E_TAGS, searchOwnClients } from './helpers';

/**
 * ADM-01 and ADM-14, as an operator actually uses them.
 *
 * ── Why these need a browser ────────────────────────────────────────────────
 *
 * Every assertion below is about a seam the component tests cannot see: a
 * filter chosen in the UI has to reach SQL, come back, and change the rows on
 * screen. Both halves are unit-tested and neither test can tell you they are
 * wired to each other.
 *
 * The SORTING cases are the sharpest. Seven columns declared `sortable: true`
 * with no handler passed, so clicking a header re-ordered the twenty-five rows
 * on screen and presented the result as the dataset. Both a component test and
 * an API test pass throughout that bug — the component sorts what it is given,
 * the API sorts what it is asked — and only a whole journey catches it.
 */

test.describe('the client index', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clients');
    await searchOwnClients(page);
  });

  test('searches the server, not the page', async ({ page }) => {
    // Narrowed to one client: if this were client-side filtering over the
    // current page, the other five would still be in the DOM.
    await clientSearchBox(page).fill(E2E_CLIENTS.zulu.email);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.zulu.name })).toBeVisible();
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toHaveCount(0);
  });

  test('honours a bookmarked country segment', async ({ page }) => {
    /*
     * The country SELECT is gone — removed at the operator's request, because
     * its options were built from the rows on screen over a free-text column
     * and shifted as you paged. What deliberately SURVIVES is the URL
     * parameter: the clients page still reads `?country=` so a saved segment
     * resolves instead of silently widening (see the comment beside
     * `country: url.get('country')` in the page). That preserved behaviour is
     * what this asserts, against `users_country_idx`. The cohort has two
     * Lebanon clients and one Cyprus, so the result is a COUNT CHANGE rather
     * than a vacuous pass.
     */
    await page.goto(`/clients?country=Cyprus&q=${E2E_DOMAIN}`);

    await expect(page.getByRole('link', { name: E2E_CLIENTS.charlie.name })).toBeVisible();
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toHaveCount(0);
  });

  test('puts the filter in the URL, so a segment can be shared', async ({ page }) => {
    // The forcing requirement: /tags shows a client count per tag and has to
    // make it clickable. A screenshot is not a link. ("All account states",
    // not "All statuses": the list shows three things a reader could call a
    // status, and the account one got the unambiguous name.)
    await page
      .getByRole('combobox')
      .filter({ hasText: /all account states/i })
      .click();
    await page.getByRole('option', { name: /pending/i }).click();

    await expect(page).toHaveURL(/status=pending/);
  });

  test('restores filters from a shared URL', async ({ page }) => {
    // The other half. A link that does not reconstruct the view is decoration.
    await page.goto(`/clients?q=${encodeURIComponent(E2E_CLIENTS.charlie.email)}`);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.charlie.name })).toBeVisible();
  });

  test('SORTS THE DATASET, not the rows on screen', async ({ page }) => {
    /*
     * The regression this whole spec file is worth writing for.
     *
     * Clicking Email must reach the API. Asserting the URL rather than the row
     * order is deliberate — row order alone would pass against the old
     * client-side sort, which is precisely the bug.
     */
    // Armed BEFORE the click: the sorted refetch is what proves the header
    // reached the API, and it fires immediately on the URL change.
    const sorted = page.waitForResponse(
      (r) => r.url().includes('/admin/clients') && r.url().includes('sort=email'),
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /^email$/i }).click();
    await expect(page).toHaveURL(/sort=email/);
    await expect(page).toHaveURL(/order=/);
    await sorted;

    // And the rows actually came back ordered. Polled, because the response
    // landing and React committing the new rows are two separate moments — a
    // single read can catch the previous render and report the default
    // ordering as a sort failure.
    await expect(async () => {
      const emails = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
      const owned = emails.filter((e) => e.includes('oxshare-e2e.test'));
      expect(owned.length).toBeGreaterThan(2);
      expect(owned).toEqual([...owned].sort());
    }).toPass({ timeout: 10_000 });
  });

  test('opens a client profile from the list', async ({ page }) => {
    // FR-ADM-01's acceptance criterion, verbatim: "an administrator searches the
    // client base and opens a full client profile."
    await page.getByRole('link', { name: E2E_CLIENTS.alpha.name }).click();

    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: E2E_CLIENTS.alpha.name })).toBeVisible();
  });
});

test.describe('the client profile', () => {
  test('shows the sections FR-ADM-01 asks for', async ({ page }) => {
    await page.goto('/clients');
    await searchOwnClients(page);
    await page.getByRole('link', { name: E2E_CLIENTS.alpha.name }).click();

    await expect(page.getByText(/verification/i).first()).toBeVisible();
    await expect(page.getByText(/documents/i).first()).toBeVisible();
    await expect(page.getByText(/trading accounts/i).first()).toBeVisible();
    // Referral relationships moved to the profile's Network tab when the
    // profile was split into tabs — rendered as the client's "Downline" and
    // who "Introduced" them, one click away.
    await page.getByRole('tab', { name: /network/i }).click();
    await expect(page.getByRole('heading', { name: /downline/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /introduced by/i })).toBeVisible();
  });

  test('gives a client that does not exist ONE vague answer', async ({ page }) => {
    /*
     * A security property, not a UX one. The API answers an identical 404 for
     * "no such client" and "outside your client scope", and this screen must
     * not undo that by explaining which happened — the difference is an oracle
     * for enumerating the client base a restricted admin was denied.
     */
    await page.goto('/clients/00000000-0000-4000-8000-000000000000');
    await expect(page.getByText(/not available/i)).toBeVisible();
    await expect(page.getByText(/may not exist, or it may be outside/i)).toBeVisible();
  });
});

test.describe('ADM-14 tags', () => {
  test('lists the segments with their sizes', async ({ page }) => {
    await page.goto('/tags');
    await expect(page.getByText(E2E_TAGS.alpha.label)).toBeVisible();
    await expect(page.getByText(E2E_TAGS.alpha.slug)).toBeVisible();
  });

  test('links a tag INTO the filtered client list', async ({ page }) => {
    // A count nobody can act on is a number on a screen. This link is the
    // reason the client list keeps its filters in the URL at all.
    await page.goto('/tags');
    // Scoped to the TABLE: the sidebar's own "Clients" link matches a loose
    // name query too, and clicking that would land on an unfiltered list and
    // pass for entirely the wrong reason.
    await page
      .getByRole('table')
      .getByRole('link', { name: /client/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/clients\?tag=/);
  });

  test('filters the client list by tag, end to end', async ({ page }) => {
    // Only `alpha` carries the tag, so this is a real narrowing rather than a
    // page that happens to look the same.
    await page.goto(`/clients?tag=${E2E_TAGS.alpha.slug}`);

    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toBeVisible();
    await expect(page.getByRole('link', { name: E2E_CLIENTS.zulu.name })).toHaveCount(0);
  });

  test('refuses a tag that does not exist, rather than showing an empty list', async ({ page }) => {
    /*
     * R-2.5: a silently ignored filter is a lie the UI tells. Zero clients for
     * a typo'd segment reads as "nobody is in this segment" — a statement about
     * the client base rather than about the URL — and an operator would act on
     * it.
     */
    await page.goto('/clients?tag=no-such-segment');
    await expect(page.getByText(/no client tag/i)).toBeVisible();
  });
});
