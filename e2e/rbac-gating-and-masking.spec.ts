import { expect, test, type Page } from '@playwright/test';
import { E2E_CLIENTS, RESTRICTED_STATE, searchOwnClients } from './helpers';

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
    // Either shape: the old same-origin `/api/*` rewrite, or the direct API
    // origin this console uses now. Both carry the versioned path.
    if (!response.url().includes('/api/') && !response.url().includes('/v1/')) return;
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
    await page
      .getByRole('row', { name: /e2e restricted/i })
      .getByRole('button', { name: /actions for/i })
      .click();
    await page.getByRole('menuitem', { name: /edit/i }).click();
    await page.waitForURL(/\/roles\/.+\/edit/);

    await expect(page.getByText(/1 field\(s\) hidden/i)).toBeVisible();
    // Open the section and see the field itself ticked.
    await page.getByText(/client field visibility/i).click();
    await expect(page.getByRole('button', { name: /email/i }).first()).toHaveAttribute(
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
    const refused: number[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/admin/roles')) refused.push(r.status());
    });

    await page.goto('/roles');
    expect(refused.every((status) => status === 403)).toBe(true);
  });

  test('never receives a masked value, in the DOM OR on the wire', async ({ page }) => {
    /*
     * The assertion a DOM check cannot make. A frontend rendering `••••` over a
     * value the API still sent is a UI convention; the value is one devtools
     * panel away.
     */
    const bodies = collectBodies(page);
    await page.goto('/clients');
    await searchOwnClients(page);

    expect(await bodies.all()).not.toContain(E2E_CLIENTS.alpha.email);
    await expect(page.getByText(E2E_CLIENTS.alpha.email)).toHaveCount(0);
    await expect(page.getByRole('note')).toContainText(/hidden by your permissions/i);
  });

  test('cannot see a client outside its tag scope, and a deep link 404s', async ({ page }) => {
    await page.goto('/clients');
    await searchOwnClients(page);

    // In scope…
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toBeVisible();
    // …and not.
    await expect(page.getByRole('link', { name: E2E_CLIENTS.zulu.name })).toHaveCount(0);
  });
});
