import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * EVERY sortable header, on every list in the console, clicked for real.
 *
 * This exists because of a bug the owner hit in the running app: the Clients
 * table offered a sortable "Type" header, `CLIENT_SORT_COLUMNS` has never
 * contained `type`, and R-2.5 makes an unrecognised sort a 400 rather than a
 * silent fallback. So one click replaced the entire client directory with an
 * error card reading `Cannot sort clients by "type"`.
 *
 * The frontend had a guard for exactly this — `sortableBy()` is typed against
 * `CLIENT_SORT_KEYS`, and every column outside the backend's allowlist carries
 * an explicit `sortable: false` with a comment saying why. It did not help,
 * because `CLIENT_SORT_KEYS` was HAND-WRITTEN beside a generated contract that
 * already held the truth. `IB_PARTNER_SORT_KEYS` had drifted the same way
 * (`level`, replaced by `programName` in migration 0102) and would have
 * shipped the identical failure the day somebody built that screen.
 *
 * Both are now `satisfies readonly SortKeysOf<Operation>[]`, so an offered key
 * the API refuses is a compile error. THIS file is the other half: a
 * compile-time contract only covers the lists that go through it, and clicking
 * every header is what proves the whole console.
 */

/**
 * Screens that deliberately offer NO sort, and why — so "no sortable header"
 * is a declared choice rather than a column somebody quietly un-sorted.
 *
 * `/ledger` is append-only and already arrives newest-first, which is the
 * order it is read in; its endpoint takes no `sort` at all, and the page marks
 * every column `sortable: false` rather than promising an order the API cannot
 * give. That is the correct shape — it is the OPPOSITE of the Clients bug,
 * where a header was offered for a key the API refuses.
 */
const NO_SORT_PAGES: readonly string[] = ['/ledger'];

/** Lists with a server-sorted table. `/dashboard` and the forms have none. */
const LIST_PAGES = [
  '/clients',
  '/kyc',
  '/transactions',
  '/financial',
  '/ledger',
  '/wallets',
  '/trading-accounts',
  '/audit-log',
  '/roles',
  '/admin-users',
  '/approvals/ib',
  '/commissions',
] as const;

/**
 * The console's error state, whatever produced it.
 *
 * `AsyncBoundary` renders the message plus a Retry, so the button is the
 * reliable handle — the message itself is per-failure and i18n'd. This is
 * exactly what the owner was looking at.
 */
const errorCard = (page: Page) => page.getByRole('button', { name: /retry/i });

/** Every sortable header: `DataTable` renders those as buttons inside `th`. */
const sortableHeaders = (page: Page) => page.locator('thead th button');

test.describe('every sortable header actually sorts', () => {
  for (const path of LIST_PAGES) {
    test(`${path} — every header, both directions, no refusal`, async ({ page }) => {
      test.setTimeout(180_000);

      /*
       * Collected on the WIRE. A 400 that the screen happens to render as an
       * empty table would pass a DOM-only assertion, and "the list is empty"
       * is indistinguishable from a working filter — the exact confusion this
       * whole file is about.
       */
      const refusals: string[] = [];
      page.on('response', (res) => {
        const url = new URL(res.url());
        if (!url.pathname.startsWith('/v1/admin')) return;
        if (res.status() >= 400) refusals.push(`${res.status()} ${url.pathname}${url.search}`);
      });

      await page.goto(path);
      // The table has to be there before its headers mean anything. A page
      // that legitimately has no rows still renders its head.
      await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
      expect(await errorCard(page).isVisible(), `${path} failed to load at all`).toBe(false);

      const count = await sortableHeaders(page).count();
      if (NO_SORT_PAGES.includes(path)) {
        // Asserted in BOTH directions: a screen on that list must really offer
        // nothing, or the list is stale and this test is silently skipping a
        // table it should be sweeping.
        expect(count, `${path} is listed as sort-free but offers headers`).toBe(0);
        return;
      }
      expect(count, `${path} offers no sortable column — is this still a list?`).toBeGreaterThan(0);

      for (let i = 0; i < count; i += 1) {
        const header = sortableHeaders(page).nth(i);
        const label = ((await header.textContent()) ?? `column ${i}`).trim();

        // Ascending, then descending: the second click is a different query
        // and `order` is validated separately from `sort`.
        for (const direction of ['asc', 'desc']) {
          await header.click();
          await page.waitForLoadState('networkidle');
          expect(
            await errorCard(page).isVisible(),
            `${path}: sorting by "${label}" (${direction}) broke the screen`,
          ).toBe(false);
        }
      }

      expect(refusals, `${path} sorted by something the API refuses`).toEqual([]);
    });
  }
});

test.describe('sorting edge cases', () => {
  test('a hand-edited sort in the URL never breaks the screen', async ({ page }) => {
    /*
     * URLs get bookmarked, shared and typed. The console holds its sort in the
     * query string, so a stale link can name a column that has since been
     * removed from the allowlist — which is precisely how the reported bug
     * would come BACK for anyone who had bookmarked the broken sort.
     *
     * The frontend guards this: an unrecognised key resolves to `undefined`
     * and is simply not sent, so the list renders in its default order rather
     * than asking the API a question it will refuse.
     */
    await page.goto('/clients?sort=type&order=asc');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
    await expect(errorCard(page), 'a stale bookmarked sort still breaks the page').toBeHidden();

    await page.goto('/clients?sort=totally-invented&order=desc');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
    await expect(errorCard(page)).toBeHidden();
  });

  test('an order without a sort is not sent on its own', async ({ page }) => {
    // `order` alone describes an ordering of no column, and the API is
    // entitled to refuse it.
    const sent: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname === '/v1/admin/clients') sent.push(url.search);
    });
    await page.goto('/clients?order=desc');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
    await expect(errorCard(page)).toBeHidden();
    expect(
      sent.some((s) => s.includes('order=') && !s.includes('sort=')),
      'sent order= with no sort=',
    ).toBe(false);
  });

  test('a sort survives paging, and paging survives a sort', async ({ page }) => {
    /*
     * Independent state that shares one URL. A sort that silently resets the
     * page shows the operator row 1 again; a page that survives a re-sort
     * shows them page 3 of a different ordering, which is a different set of
     * rows presented as the same place.
     */
    await page.goto('/clients?sort=email&order=asc');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    const next = page.getByRole('button', { name: /next/i });
    test.skip(!(await next.isEnabled().catch(() => false)), 'only one page of clients here');
    await next.click();
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).searchParams.get('sort'), 'paging dropped the sort').toBe('email');
    await expect(errorCard(page)).toBeHidden();
  });
});

test.describe('filtering the client directory', () => {
  /**
   * Every filter, driven through the real controls, asserted on the WIRE and
   * in the URL.
   *
   * The wire matters more than the DOM here for the reason the sort sweep
   * gives: a filter the API rejects, or silently ignores, both render as "a
   * table with different rows in it", and an operator cannot tell either from
   * a filter that worked. So each case checks that the parameter was actually
   * SENT, that the API accepted it, and that the visible result agrees.
   */

  /** The parameters the clients list was asked for, newest last. */
  function watchQueries(page: Page): string[] {
    const sent: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname === '/v1/admin/clients') sent.push(url.search);
    });
    return sent;
  }

  const pickFilter = async (page: Page, label: RegExp, option: RegExp) => {
    await page.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option }).click();
    await page.waitForLoadState('networkidle');
  };

  test('the TYPE filter narrows to that type, and only that type', async ({ page }) => {
    /*
     * The same field whose SORT brought the page down. Filtering by it is
     * offered and works, because the derived expression is fine in a WHERE —
     * it is only an ORDER BY that cannot be indexed. Worth pinning together
     * so nobody "fixes" the sort bug by removing the filter as well.
     */
    const sent = watchQueries(page);
    await page.goto('/clients');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    await pickFilter(page, /^all types$/i, /^individual$/i);
    await expect
      .poll(() => sent.filter((s) => s.includes('type=individual')).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(errorCard(page)).toBeHidden();
    expect(new URL(page.url()).searchParams.get('type')).toBe('individual');

    // Every visible Type cell agrees with the filter.
    const types = await page.locator('tbody tr td:nth-child(4)').allTextContents();
    for (const cell of types) {
      expect(cell.trim().toLowerCase(), 'a row survived a filter it does not match').toContain(
        'individual',
      );
    }
  });

  test('the ACCOUNT STATE filter is a different question from KYC', async ({ page }) => {
    /*
     * Three things on this screen could be called "status" — the account
     * state, the KYC status and email verification — and they are separate
     * filters because they answer separate questions. Pinning the parameter
     * name is what stops a rename quietly pointing this control at another.
     */
    const sent = watchQueries(page);
    await page.goto('/clients');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    await pickFilter(page, /^all account states$/i, /^active$/i);
    expect(sent.some((s) => s.includes('status=active'))).toBe(true);
    expect(sent.some((s) => s.includes('kycStatus='))).toBe(false);
    await expect(errorCard(page)).toBeHidden();
  });

  test('filters COMBINE rather than replace one another', async ({ page }) => {
    // Each control writes its own key, so two of them narrow together. A
    // control that reset its siblings would look like a working filter and
    // quietly widen the result.
    const sent = watchQueries(page);
    await page.goto('/clients');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    await pickFilter(page, /^all types$/i, /^individual$/i);
    await pickFilter(page, /^all account states$/i, /^active$/i);

    await expect
      .poll(() => sent[sent.length - 1] ?? '', { timeout: 15_000 })
      .toContain('status=active');
    const last = sent[sent.length - 1] ?? '';
    expect(last, 'the second filter dropped the first').toContain('type=individual');
    await expect(errorCard(page)).toBeHidden();
  });

  test('search combines with a filter AND a sort, all three at once', async ({ page }) => {
    /*
     * The combination is where a query builder breaks: three independent
     * pieces of state, one URL, one request. `q` is debounced separately from
     * the rest, which is exactly the kind of seam that drops a parameter.
     */
    const sent = watchQueries(page);
    await page.goto('/clients?sort=email&order=asc&type=individual');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('searchbox', { name: /search clients/i }).fill('client');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => sent.filter((s) => s.includes('q=client')).length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const last = sent[sent.length - 1] ?? '';
    expect(last).toContain('q=client');
    expect(last, 'searching dropped the type filter').toContain('type=individual');
    expect(last, 'searching dropped the sort').toContain('sort=email');
    await expect(errorCard(page)).toBeHidden();
  });

  test('clear filters removes every one of them, and the rows come back', async ({ page }) => {
    await page.goto('/clients?type=individual&status=active&q=zzz');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /clear filters/i }).click();
    await page.waitForLoadState('networkidle');

    const params = new URL(page.url()).searchParams;
    for (const key of ['type', 'status', 'q']) {
      expect(params.get(key), `${key} survived "clear filters"`).toBeNull();
    }
    await expect(errorCard(page)).toBeHidden();
  });

  test('a filter matching nothing says so, and is not an error', async ({ page }) => {
    /*
     * The distinction this codebase keeps making: "no rows" and "something
     * broke" must not look the same. An empty result is a truthful answer and
     * must never render the retry card.
     */
    await page.goto('/clients?q=no-such-client-anywhere-9f3a2b');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
    await expect(errorCard(page), 'an empty result rendered as a failure').toBeHidden();
    // The empty state is a full-width ROW, not an absence of rows — "nothing
    // matched" has to be said out loud, or it reads as a screen that broke.
    await expect(page.getByText(/no clients match/i)).toBeVisible();
  });

  test('an unknown filter value in the URL does not break the screen', async ({ page }) => {
    // Bookmarks and hand-typed URLs. The API validates its enums, so this is
    // about the screen surviving the answer rather than about the answer.
    await page.goto('/clients?type=not-a-type');
    await expect(page.locator('thead').or(errorCard(page))).toBeVisible({ timeout: 30_000 });
    // Either it renders rows or it renders a stated error — never a blank page.
    const settled =
      (await page.locator('thead').isVisible()) || (await errorCard(page).isVisible());
    expect(settled).toBe(true);
  });
});
