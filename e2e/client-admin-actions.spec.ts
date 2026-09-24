import { type BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  adminApi,
  E2E_CLIENTS,
  E2E_TAGS,
  RESTRICTED_STATE,
  searchOwnClients,
  STORAGE_STATE,
  TOPOLOGY_PORTAL_ORIGIN,
  requirePrecondition,
} from './helpers';

/**
 * What an administrator does TO a client, driven through the console and
 * proved on the server — FR-ADM-01 / CORE-18 / ADM-14 / CORE-10.
 *
 * Every write here lands on `suspend-target` (the one client the suite may
 * mutate) or on a TAG assignment that is undone before the spec ends, so the
 * seeded cohort the list specs assert on is left exactly as it was found.
 */

/**
 * Look a seeded client up through the MASTER session this file runs under —
 * never a fresh login per lookup: admin login is capped at five a minute and a
 * spec that signs in to ask a question spends the cap on itself.
 */
async function idOf(context: BrowserContext, email: string): Promise<string> {
  const api = await adminApi(context);
  const res = await api.get(`/admin/clients?q=${encodeURIComponent(email)}&limit=5`);
  expect(res.ok()).toBe(true);
  const found = ((await res.json()) as { items: { id: string; email: string }[] }).items.find(
    (c) => c.email === email,
  );
  expect(found, `${email} is not seeded`).toBeTruthy();
  return found!.id;
}

test.describe('CORE-18 — editing an ordinary client', () => {
  test('Edit profile is offered for a client who is NOT a partner, and the edit lands', async ({
    page,
    context,
  }) => {
    const targetId = await idOf(context, E2E_CLIENTS.suspendTarget.email);
    /*
     * The two CORE-18 dialogs were mounted inside the partner-only block, so for
     * an individual client — the overwhelming majority — the menu offered
     * "Edit profile", the click set state, and NOTHING rendered. The unit tests
     * rendered the dialogs directly and could not see it.
     */
    await page.goto(`/clients/${targetId}`);
    await expect(page.getByRole('heading', { name: E2E_CLIENTS.suspendTarget.name })).toBeVisible();

    await page.getByRole('button', { name: /actions for/i }).click();
    await page.getByRole('menuitem', { name: /edit profile/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, 'the Edit profile dialog never rendered').toBeVisible();

    const phone = `+96170${String(Date.now()).slice(-6)}`;
    await dialog.getByLabel(/phone/i).fill(phone);
    const [saved] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/admin/clients/${targetId}`) && r.request().method() === 'PATCH',
      ),
      dialog.getByRole('button', { name: /save/i }).click(),
    ]);
    expect(saved.status(), 'the profile edit was refused').toBe(200);

    // The second read: the server holds the new value, not only the toast.
    const api = await adminApi(context);
    const fresh = await api.get(`/admin/clients/${targetId}`);
    expect(((await fresh.json()) as { phone?: string | null }).phone).toBe(phone);
  });

  test('Change email is offered for an ordinary client and explains what it does', async ({
    page,
    context,
  }) => {
    const targetId = await idOf(context, E2E_CLIENTS.suspendTarget.email);
    await page.goto(`/clients/${targetId}`);
    await page.getByRole('button', { name: /actions for/i }).click();
    await page.getByRole('menuitem', { name: /change sign-in email|change email/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The takeover primitive says so before anything is sent: sessions die,
    // verification resets, the old address is told.
    await expect(dialog.getByText(/this changes how the client signs in/i)).toBeVisible();
    // Not submitted — the fixture keeps its address.
    await page.keyboard.press('Escape');
  });

  test('an admin without clients.edit is offered no Edit profile, and the API refuses it', async ({
    browser,
    context,
  }) => {
    const targetId = await idOf(context, E2E_CLIENTS.alpha.email);
    const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
    const page = await restricted.newPage();
    await page.goto(`/clients/${targetId}`);
    await expect(page.getByRole('heading', { name: E2E_CLIENTS.alpha.name })).toBeVisible();

    const menu = page.getByRole('button', { name: /actions for/i });
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      await expect(page.getByRole('menuitem', { name: /edit profile/i })).toHaveCount(0);
      await page.keyboard.press('Escape');
    }

    const api = await adminApi(restricted);
    const refused = await api.patch(`/admin/clients/${targetId}`, { phone: '+96100000000' });
    expect(refused.status()).toBe(403);
    await restricted.close();
  });
});

test.describe("ADM-14 — tags move a client in and out of a scoped admin's sight", () => {
  test('assigning and removing a tag is visible to the scoped admin in BOTH directions', async ({
    browser,
    context,
  }) => {
    /*
     * The restricted admin is scoped to the `e2e-alpha` tag. Bravo does not carry
     * it, so bravo is invisible to them; after the master tags bravo, bravo is
     * visible; after the master removes it, invisible again. All three states
     * are read from the API with the restricted session, not inferred from the
     * master's screen.
     */
    const master = await adminApi(context);
    const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
    const restrictedApi = await adminApi(restricted);
    const bravoId = await idOf(context, E2E_CLIENTS.bravo.email);

    const tags = (await (await master.get('/admin/tags')).json()) as { id: string; slug: string }[];
    const alphaTag = tags.find((t) => t.slug === E2E_TAGS.alpha.slug);
    expect(alphaTag, 'the e2e-alpha tag is not seeded').toBeTruthy();

    // By ID, not email: the restricted role MASKS `client.email`, so the rows it
    // receives carry no email at all — matching on it would read "masked" as
    // "absent" and call a working territory a broken one.
    const seesBravo = async () => {
      const res = await restrictedApi.get(
        `/admin/clients?q=${encodeURIComponent(E2E_CLIENTS.bravo.email)}&limit=5`,
      );
      expect(res.ok()).toBe(true);
      return ((await res.json()) as { items: { id: string }[] }).items.some(
        (c) => c.id === bravoId,
      );
    };

    try {
      expect(await seesBravo(), 'bravo was visible before being tagged').toBe(false);

      const tagged = await master.post(`/admin/clients/${bravoId}/tags/${alphaTag!.id}`);
      expect(tagged.ok(), `tagging answered ${tagged.status()}`).toBe(true);
      expect(await seesBravo(), 'bravo stayed invisible after entering the territory').toBe(true);
    } finally {
      // Leave the cohort exactly as found, whatever happened above.
      await master.del(`/admin/clients/${bravoId}/tags/${alphaTag!.id}`);
    }
    expect(await seesBravo(), 'bravo stayed visible after leaving the territory').toBe(false);
    await restricted.close();
  });
});

test.describe('CORE-10 — suspension reaches a live portal session', () => {
  test('suspending a client ends their portal session on its next navigation', async ({
    browser,
    context,
  }) => {
    /*
     * The portal runs beside the console. The client signs in THERE, the
     * administrator suspends them HERE, and the next thing the client does in
     * the portal lands on sign-in — not fifteen minutes later when a token
     * expires. Reactivated in a `finally`, so the fixture is usable again.
     */
    /*
     * A REAL BUDGET, because this is the heaviest case in the file.
     *
     * It drives TWO apps and two browser contexts: an admin API session, a
     * second context against the portal, a portal sign-in, a wait for
     * /dashboard, an admin write, a navigation, and a redirect assertion — then
     * reactivates the fixture in a `finally`.
     *
     * It ran on the 60s default and took 33s locally. That is not headroom, it
     * is luck: CI is slower (a cold `next start` portal, three storage-state
     * setups before it) and it hit exactly 1.0m and died. The failure surfaced
     * as `page.waitForResponse: Test ended`, which reads as "the login request
     * was never issued" — a claim about the portal's sign-in form, not about a
     * budget. Third time today a timeout has worn the costume of the defect its
     * test exists to detect.
     */
    test.setTimeout(180_000);

    const master = await adminApi(context);
    const lookup = await master.get('/admin/clients?q=e2e-suspend%40oxshare.com&limit=5');
    const target = ((await lookup.json()) as { items: { id: string; email: string }[] }).items.find(
      (c) => c.email === 'e2e-suspend@oxshare.com',
    );
    requirePrecondition(!target, 'the e2e-suspend@oxshare.com portal fixture is not seeded');

    const portal = await browser.newContext({ baseURL: TOPOLOGY_PORTAL_ORIGIN });
    const client = await portal.newPage();
    const reachable = await client.goto('/auth/login').then(
      (r) => r?.ok() ?? false,
      () => false,
    );
    requirePrecondition(!reachable, `the portal is not running at ${TOPOLOGY_PORTAL_ORIGIN}`);

    await client.getByPlaceholder('you@example.com').fill('e2e-suspend@oxshare.com');
    await client.locator('input[type="password"]').fill('client123');
    const [login] = await Promise.all([
      client.waitForResponse(
        (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
      ),
      // "Log In" — the portal's wording since it adopted the client's own
      // (4d037ab); the portal's e2e helper already matches it this way.
      client.getByRole('button', { name: /^log in$/i }).click(),
    ]);
    /*
     * A 429 is INCONCLUSIVE, not a reason to pass.
     *
     * This used to `test.skip` on it, so the one case proving an admin's
     * suspension ends a live portal session disappeared from a green summary
     * exactly when the suite was under load — the moment it was most likely to
     * be hiding something. Same reasoning `railIsLive` states for the rail: a
     * rate limit is a harness problem, and a harness problem must not be
     * reported as a passing test.
     */
    if (login.status() === 429) {
      throw new Error(
        'Portal login is rate limited (429), so this run cannot prove suspension ends a live ' +
          'session. That is a HARNESS condition, not a passing test — re-run with fewer ' +
          'concurrent portal logins, or wait out the 5/minute cap.',
      );
    }
    expect(login.ok(), `portal sign-in answered ${login.status()}`).toBe(true);
    await client.waitForURL(/\/dashboard/);

    try {
      const suspended = await master.patch(`/admin/clients/${target!.id}/status`, {
        status: 'suspended',
      });
      expect(suspended.ok(), `suspend answered ${suspended.status()}`).toBe(true);

      // The eviction can interrupt this very load (ERR_ABORTED) — that IS the
      // suspension working; the URL is the assertion.
      await client.goto('/wallet').catch(() => null);
      await expect(client, 'a suspended client kept their portal session').toHaveURL(
        /\/auth\/login/,
        { timeout: 20_000 },
      );
    } finally {
      await master.patch(`/admin/clients/${target!.id}/status`, { status: 'active' });
      await portal.close();
    }
  });
});

test.describe('the master sees the cohort the specs above relied on', () => {
  test('the seeded cohort is intact after the writes above', async ({ page }) => {
    await page.goto('/clients');
    await searchOwnClients(page);
    for (const c of [E2E_CLIENTS.alpha, E2E_CLIENTS.bravo, E2E_CLIENTS.suspendTarget]) {
      await expect(page.getByRole('link', { name: c.name })).toBeVisible();
    }
  });
});

// The master storage state is what this file runs under by default.
void STORAGE_STATE;
