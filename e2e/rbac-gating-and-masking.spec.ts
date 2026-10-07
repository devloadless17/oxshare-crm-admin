import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  E2E_CLIENTS,
  RESTRICTED_STATE,
  adminApi,
  adminApiSession,
  searchClientsFor,
  searchOwnClients,
} from './helpers';

/**
 * FR-RBAC-03 — role-gating, and the "mask data" half of its title.
 *
 * ── The three-part assertion ────────────────────────────────────────────────
 *
 * R-4.1: "the backend enforces; the frontend only hides." A section a
 * sub-admin may not reach has to fail in THREE places, and checking fewer is
 * how a system ends up with cosmetic security:
 *
 *   1. the nav item is absent          (they cannot find it)
 *   2. a direct URL is refused         (they cannot type their way in)
 *   3. the API answers 403             (they cannot curl their way in)
 *
 * Checking only (1) is hiding. Checking only (3) is a screen that offers a
 * button which always fails. This file checks all three.
 *
 * ── And masking is asserted in the NETWORK, not the DOM ─────────────────────
 *
 * A screen rendering `••••` over a value the API still sent is a UI convention,
 * not access control: the value is one devtools panel away, and every logging
 * and error-reporting layer between the server and the browser has already seen
 * it. So the assertion is that the value never appears in the response body.
 */

/** Every response body the page received from the API, as text. */
function collectBodies(page: Page): { all: () => Promise<string> } {
  const pending: Promise<string>[] = [];

  page.on('response', (response) => {
    // The direct API origin, whichever host — matched on the versioned path.
    if (!new URL(response.url()).pathname.startsWith('/v1/')) return;
    pending.push(response.text().catch(() => ''));
  });

  return {
    all: async () => (await Promise.all(pending)).join('\n'),
  };
}

test.describe('what a MASTER admin can reach', () => {
  test('reaches every gated section', async ({ page }) => {
    /*
     * The control for the whole file. Without it, "a sub-admin cannot reach
     * /roles" would pass equally well against an app where nobody can.
     */
    for (const path of ['/clients', '/tags', '/roles', '/admin-users', '/audit-log', '/settings']) {
      await page.goto(path);
      await expect(page, `${path} was refused for the master admin`).toHaveURL(
        new RegExp(path.replace('/', '\\/')),
      );
      await expect(page.getByText(/access denied/i)).toHaveCount(0);
    }
  });

  test('masks nothing — FR-RBAC-01 is "without exception"', async ({ page }) => {
    const bodies = collectBodies(page);
    await page.goto('/clients');
    await searchOwnClients(page);

    // The master sees the email, so the column is present and the value is on
    // the wire. This is the baseline the masking assertions below invert.
    await expect(page.getByText(E2E_CLIENTS.alpha.email)).toBeVisible();
    expect(await bodies.all()).toContain(E2E_CLIENTS.alpha.email);
  });

  test('the role editor shows the mask the wire enforces', async ({ page }) => {
    /*
     * The restored RBAC-03 editor (13 Aug), tied to the enforcement the tests
     * below prove: the seeded "E2E Restricted" role masks `client.email`, and
     * its edit page must SAY so — pre-filled, not empty. Read-only against
     * seed state on purpose; a write round-trip here would mutate the mask
     * every other masking assertion in this file depends on.
     */
    await page.goto('/roles');
    /*
     * The list is PAGED, and specs that mint roles grow it — so the seeded
     * fixture drifts off page one as the dev database ages. Walk to it rather
     * than assuming where it sits. (The specs that create roles now delete
     * them too; this is the belt to that pair of braces.)
     */
    /*
     * ⚠️ FILTERED BY TEXT, not by accessible name.
     *
     * `getByRole('row', { name: /e2e restricted/i })` asks for the row's
     * ACCESSIBLE NAME, which these rows do not carry — so it matched nothing
     * even with the fixture sitting on page one, and the page-walk below then
     * ran to its limit and reported "not in the list". The role was visible on
     * screen the whole time; only the query was wrong.
     */
    /*
     * ⚠️ WAIT FOR THE TABLE BEFORE WALKING IT.
     *
     * The walk below was reading an EMPTY table: `goto` resolves on the
     * document, not on the query behind the list, so at that instant there
     * were no rows and no pager. The loop found no Next button, broke on its
     * first pass, and reported "not in the list" — about a list that had not
     * arrived yet.
     */
    await expect
      .poll(() => page.locator('tbody tr').count(), { timeout: 30_000 })
      .toBeGreaterThan(0);

    const row = page.getByRole('row').filter({ hasText: /e2e restricted/i });
    for (let hop = 0; hop < 15 && (await row.count()) === 0; hop += 1) {
      const next = page.getByRole('button', { name: /^next$/i });
      if ((await next.count()) === 0 || (await next.isDisabled())) break;
      /*
       * ⚠️ WAIT FOR THE TABLE TO ACTUALLY CHANGE between hops.
       *
       * Paging here is CLIENT-side, so `waitForLoadState('networkidle')`
       * resolves immediately — there is no request to wait for. The loop then
       * read `row.count()` against the page it had just left, found nothing,
       * and clicked Next again, sprinting past the page the fixture was
       * actually on. It reported "not in the list" having never looked at it.
       *
       * The first row's text is the cheapest proof the re-render committed.
       */
      const before = await page.locator('tbody tr').first().textContent();
      await next.click();
      await expect
        .poll(() => page.locator('tbody tr').first().textContent(), { timeout: 5_000 })
        .not.toBe(before);
    }
    await expect(row, 'the E2E Restricted role is not in the list').toBeVisible();
    await row.getByRole('button', { name: /actions for/i }).click();
    await page.getByRole('menuitem', { name: /edit/i }).click();
    await page.waitForURL(/\/roles\/.+\/edit/);

    await expect(page.getByText(/\b1 field hidden/i)).toBeVisible();
    // The section is always open since the Oct 2026 audit (it was a collapsed
    // "Client field visibility" <details>): the field is ticked in plain view.
    await expect(
      page.getByRole('heading', { name: /client details this role cannot see/i }),
    ).toBeVisible();
    // Anchored: the locked Portal ID row's reason mentions "email" too, so an
    // unanchored /email/ lands on that row instead of the Email field.
    await expect(page.getByRole('button', { name: /^email/i }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('shows the audit log with the actor ADDRESS', async ({ page }) => {
    /*
     * `audit_log.ip_address` was populated from the day the column existed and
     * was absent from the response DTO, so this screen could not show it —
     * "which address did this administrator approve the payout from" was
     * answerable in SQL and nowhere a person would look.
     */
    await page.goto('/audit-log');
    await expect(page.getByRole('columnheader', { name: /actor/i })).toBeVisible();
    // Loopback in development, but the point is that SOMETHING is rendered
    // rather than the column being silently empty.
    await expect(
      page
        .locator('tbody')
        .getByText(/\d+\.\d+\.\d+\.\d+|::1|no address/i)
        .first(),
    ).toBeVisible();
  });
});

/*
 * ── The restricted-identity half ────────────────────────────────────────────
 *
 * The assertions that actually prove FR-RBAC-03. They need a SECOND
 * administrator whose permissions are narrower than the fixture's — gating
 * demonstrated from a master's session proves nothing at all.
 */
test.describe('what a RESTRICTED sub-admin cannot reach', () => {
  /*
   * A DIFFERENT session, held by a seeded identity with `users.view`,
   * `kyc.review` and `tags.view`, a role that masks `client.email`, and a scope
   * limited to the `e2e-alpha` tag.
   */
  test.use({ storageState: RESTRICTED_STATE });

  test('does not show a section it cannot use', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /roles/i })).toHaveCount(0);
  });

  test('refuses a DIRECT URL to that section', async ({ page }) => {
    // Hiding a nav item is cosmetics (R-4.1). This is the half that matters.
    await page.goto('/roles');
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });

  test('and the API refuses it too, with 403', async ({ page }) => {
    /*
     * Two halves, because the first can be vacuous on its own.
     *
     * The console refuses `/roles` BEFORE any request is made (the route gate
     * renders AccessDenied from the permission catalogue), so watching the
     * page's traffic may see zero calls to `/admin/roles` — and `[].every()` is
     * true. That is what this test used to assert: nothing. So the page is
     * still watched (anything it DOES send must be a 403, and there must be no
     * retry storm), and the API's own answer is taken directly.
     */
    const refused: number[] = [];
    page.on('response', (r) => {
      if (new URL(r.url()).pathname === '/v1/admin/roles') refused.push(r.status());
    });

    await page.goto('/roles');
    await expect(page.getByText(/access denied/i)).toBeVisible();
    expect(refused.every((status) => status === 403)).toBe(true);
    expect(refused.length, 'the refused page retried the forbidden call').toBeLessThanOrEqual(1);

    // The API itself, on the restricted session: exactly one 403. Asked from
    // THIS page's context, whose session the app just kept fresh — a context
    // rebuilt from the run's start-up file carries an access token that has
    // long expired in a full run, and answers 401 for that reason alone.
    const direct = await (await adminApi(page.context())).get('/admin/roles');
    expect(direct.status(), 'the API answered a restricted admin with').toBe(403);
  });

  test('never receives a masked value, in the DOM OR on the wire', async ({ page }) => {
    /*
     * The assertion a DOM check cannot make. A frontend rendering `••••` over a
     * value the API still sent is a UI convention; the value is one devtools
     * panel away.
     */
    const bodies = collectBodies(page);
    await page.goto('/clients');
    // By NAME: this role hides email, and a fragment of a hidden field finds
    // nobody (D-82) — searching the email domain would make this vacuous.
    await searchClientsFor(page, E2E_CLIENTS.alpha.name);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toBeVisible();

    expect(await bodies.all()).not.toContain(E2E_CLIENTS.alpha.email);
    await expect(page.getByText(E2E_CLIENTS.alpha.email)).toHaveCount(0);
    await expect(page.getByRole('note')).toContainText(/hidden by your permissions/i);
  });

  test('cannot see a client outside its tag scope, and a deep link 404s', async ({ page }) => {
    /*
     * This test opens a MASTER API session mid-body (the only identity allowed
     * to know the out-of-scope client's id). Admin login is capped at five a
     * minute per IP and `adminApiSession` waits the window out rather than
     * weakening the cap — a 65-second backoff that the default 60-second test
     * timeout cannot survive. Past one full window, so a busy run costs a
     * slow test rather than a red one.
     */
    test.setTimeout(180_000);
    await page.goto('/clients');

    // In scope… (searched by name — this role hides email, D-82)
    await searchClientsFor(page, E2E_CLIENTS.alpha.name);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toBeVisible();
    // …and not, searched for by their own name.
    await searchClientsFor(page, E2E_CLIENTS.zulu.name);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.zulu.name })).toHaveCount(0);

    /*
     * The deep link. Zulu exists, and the restricted admin must be told exactly
     * what they are told about a client that does NOT exist — a 404, never a
     * 403 — or the scope becomes an existence oracle. The id is looked up with
     * the master's session, which is the only one allowed to know it.
     */
    const master = await adminApiSession();
    const lookup = await master.get(
      `/admin/clients?q=${encodeURIComponent(E2E_CLIENTS.zulu.email)}`,
    );
    expect(lookup.ok()).toBe(true);
    const zulu = ((await lookup.json()) as { items: { id: string; email: string }[] }).items.find(
      (c) => c.email === E2E_CLIENTS.zulu.email,
    );
    await master.dispose();
    expect(zulu, 'the zulu fixture is not seeded').toBeTruthy();

    const direct: number[] = [];
    page.on('response', (r) => {
      if (new URL(r.url()).pathname === `/v1/admin/clients/${zulu!.id}`) direct.push(r.status());
    });
    await page.goto(`/clients/${zulu!.id}`);
    // The SAME vague sentence the nonexistent-id case gets (clients-and-tags).
    await expect(page.getByText(/not available/i)).toBeVisible();
    await expect(page.getByText(/may not exist, or it may be outside/i)).toBeVisible();
    expect(direct.length, 'the profile was never requested').toBeGreaterThan(0);
    expect(
      direct.every((status) => status === 404),
      `the out-of-scope client answered something other than 404: ${direct.join(', ')}`,
    ).toBe(true);
  });
});
