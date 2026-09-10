import { expect, test } from './fixtures';

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
    /*
     * The directory display is PAGED, and every invite-minting spec run today
     * grows it — the fixture row drifts onto later pages. Walk the pages until
     * it appears rather than assuming page one.
     */
    const row = page.getByRole('row', { name: /e2e-restricted/i }).first();
    for (let hops = 0; hops < 15 && (await row.count()) === 0; hops += 1) {
      const next = page.getByRole('button', { name: /^next$/i });
      if ((await next.count()) === 0 || (await next.isDisabled())) break;
      await next.click();
    }
    await expect(row, 'the e2e-restricted fixture is not in the directory').toBeVisible();
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

/**
 * The full journey, now provable end to end: Mailpit holds the mailbox, so the
 * emailed link itself can be followed rather than simulated. A FRESH admin is
 * invited for the run — resetting a seeded fixture's password would break
 * every later spec that signs in as it.
 */
test.describe('completing an armed reset through the emailed link', () => {
  test('invite → arm → emailed link → new password in, old password and old session dead', async ({
    browser,
    playwright,
  }) => {
    test.setTimeout(240_000);
    const { adminApiSession, API_NODE_BASE, APP_ORIGIN, linkIn, waitForMail } =
      await import('./helpers');
    const master = await adminApiSession();
    const invitee = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const email = `e2e-reset-${Date.now()}@oxshare-e2e.test`;
    const firstPassword = 'First-credential-123!';
    const newPassword = 'Recovered-credential-456!';

    /* Admin login is capped at 5/min/IP and this test needs two probes on top
       of the run's other logins — waiting out a 429 keeps the cap honest. */
    const login = async (password: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ctx = await playwright.request.newContext({
          storageState: { cookies: [], origins: [] },
        });
        const res = await ctx.post(`${API_NODE_BASE}/admin/auth/login`, {
          headers: { Origin: APP_ORIGIN },
          data: { email, password },
        });
        const status = res.status();
        await ctx.dispose();
        if (status !== 429) return status;
        await new Promise((r) => setTimeout(r, 61_000));
      }
      throw new Error('admin login stayed rate limited for three minutes');
    };

    try {
      // ── Invite and accept, so a session opened with the FIRST password exists.
      const created = await master.post('/admin/invite', {
        email,
        name: 'E2E Reset Journey',
        permissions: ['clients.view'],
      });
      expect(created.ok(), `invite answered ${created.status()}`).toBe(true);
      const { inviteUrl } = (await created.json()) as { inviteUrl?: string };
      expect(inviteUrl, 'the invite link is echoed outside production only').toBeTruthy();
      /*
       * WAIT OUT A 429 HERE TOO. `invite/accept` ESTABLISHES a session, so it
       * shares the admin login cap (5/min/IP) — and this file already waits the
       * window out for its two login probes a few lines above. Accept did not,
       * so a full-suite run that had spent the budget elsewhere failed here with
       * "accept answered 429", which reads as a broken invite flow and is a
       * queue of tests sharing a limit.
       *
       * Same choice as everywhere else in these suites: the cap is correct and
       * is waited out, never weakened.
       */
      const acceptOnce = () =>
        invitee.post(`${API_NODE_BASE}/admin/invite/accept`, {
          headers: { Origin: APP_ORIGIN },
          data: {
            token: new URL(inviteUrl!).searchParams.get('token')!,
            password: firstPassword,
          },
        });
      let accepted = await acceptOnce();
      for (let attempt = 0; accepted.status() === 429 && attempt < 3; attempt++) {
        // eslint-disable-next-line no-console
        console.log('↻ invite/accept rate limited; waiting 65s…');
        test.setTimeout(65_000 + 120_000);
        await new Promise((r) => setTimeout(r, 65_000));
        accepted = await acceptOnce();
      }
      expect(accepted.ok(), `accept answered ${accepted.status()}`).toBe(true);
      const me = (await (await invitee.get(`${API_NODE_BASE}/admin/auth/me`)).json()) as {
        id: string;
      };
      expect(me.id).toBeTruthy();

      // ── The master arms the reset; the link arrives by mail.
      const armed = await master.post(`/admin/users/${me.id}/password-reset`);
      expect(armed.ok(), `arming answered ${armed.status()}`).toBe(true);
      const mail = await waitForMail(email, { subject: /reset|password/i });
      const link = linkIn(mail, APP_ORIGIN);
      const resetToken = new URL(link).searchParams.get('token') ?? '';
      expect(resetToken, 'the reset mail carries no token').toBeTruthy();

      // ── Followed with NO session, as the recipient would.
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await ctx.newPage();
      try {
        await page.goto(link);
        await page.locator('#new-password').fill(newPassword);
        await page.locator('#confirm-password').fill(newPassword);
        const [completed] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('/password-reset/complete') && r.request().method() === 'POST',
          ),
          page.getByRole('button', { name: /set password/i }).click(),
        ]);
        expect(completed.ok(), `completing answered ${completed.status()}`).toBe(true);
        await expect(page.getByText(/password set/i).first()).toBeVisible();
      } finally {
        await ctx.close();
      }

      // ── The credential swap is total.
      expect(await login(firstPassword), 'the OLD password still signs in').toBe(401);
      expect(await login(newPassword), 'the NEW password does not sign in').toBe(200);
      const replay = await invitee.post(`${API_NODE_BASE}/admin/password-reset/complete`, {
        headers: { Origin: APP_ORIGIN },
        data: { token: resetToken, password: 'Yet-another-789!' },
      });
      expect(replay.status(), 'the reset link is replayable').toBeGreaterThanOrEqual(400);
      const stale = await invitee.get(`${API_NODE_BASE}/admin/auth/me`);
      expect(stale.status(), 'a pre-reset session survived the reset').toBe(401);
    } finally {
      await invitee.dispose();
      await master.dispose();
    }
  });
});
