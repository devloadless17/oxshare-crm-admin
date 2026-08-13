import { expect, test } from '@playwright/test';

/**
 * Admin password recovery, end to end — DECISIONS D-44.
 *
 * The backend suite proves the rules; this proves the JOURNEY exists and is
 * reachable: a master arms a reset from the directory, the emailed link lands on
 * a page that works with NO session, and the new password signs the person in.
 *
 * That last part is what neither unit nor API tests can show. `/reset-password`
 * has to be public in `lib/public-paths.ts`, and if it is not, the link
 * redirects to a login form the recipient cannot use — silently, because a
 * redirect to a working page does not look like a failure.
 */

test.describe('sending a reset link', () => {
  test('a master can send one from the directory', async ({ page }) => {
    await page.goto('/admin-users');
    await page.waitForLoadState('networkidle');

    /*
     * The reset control lives in the ROW ACTIONS MENU now — the directory
     * folded per-row buttons into one menu per row. Driven against the
     * restricted admin's row, never `.first()`: the first row can be the
     * signed-in admin themselves, whose own row deliberately hides reset.
     */
    const row = page.getByRole('row', { name: /e2e-restricted/i }).first();
    await row.getByRole('button', { name: /actions for/i }).click();

    const send = page.getByRole('menuitem', { name: /send reset link/i });
    await expect(send, 'no reset control in the directory').toBeVisible();
    await send.click();

    // Confirmed before sending: it arms a credential and signs the target out
    // everywhere, so a misclick on the wrong row matters. The confirm is the
    // app's own modal, not a native dialog.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/password-reset') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: /send link/i }).click(),
    ]);
    expect(response.status()).toBe(200);
  });

  test('is not offered to an admin without the grant', async ({ browser }) => {
    /*
     * FR-RBAC-03's "neither presented nor accessible", applied to the control
     * that can take over another administrator's account. Proven from the
     * restricted identity, because a master's session cannot demonstrate it.
     */
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/restricted.json' });
    const page = await ctx.newPage();
    try {
      await page.goto('/admin-users');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: /send reset link/i })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('following the link', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the reset page is reachable with NO session', async ({ page }) => {
    // The failure this catches is silent: if `/reset-password` is not public,
    // the recipient is redirected to a login form they cannot use, and the page
    // they were sent looks like it simply does not exist.
    await page.goto('/reset-password?token=e2e-not-a-real-token');

    await expect(page, 'the reset link was redirected away').toHaveURL(/\/reset-password/);
    await expect(page.getByRole('button', { name: /set password/i })).toBeVisible();
  });

  test('scrubs the token out of the address bar', async ({ page }) => {
    // It sets an administrator's password. Leaving it in history, autocomplete
    // and on screen during a screen-share is avoidable; the email is not.
    await page.goto('/reset-password?token=e2e-secret-token-value');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('e2e-secret-token-value');
  });

  test('refuses a dead token with a sentence, and offers a way out', async ({ page }) => {
    await page.goto('/reset-password?token=e2e-definitely-invalid');
    await page.waitForLoadState('networkidle');

    await page.locator('#new-password').fill('a-fresh-password-123');
    await page.locator('#confirm-password').fill('a-fresh-password-123');
    await page.getByRole('button', { name: /set password/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    // Never a dead end: unlike an invitee, this person HAS an account.
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('says when the link is incomplete rather than showing a broken form', async ({ page }) => {
    await page.goto('/reset-password');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/incomplete/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /set password/i })).toHaveCount(0);
  });
});
