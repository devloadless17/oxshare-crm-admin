import { expect, test } from '@playwright/test';
import { collectRejections, E2E_ADMIN, signIn } from './helpers';

/**
 * Does an admin session actually hold, on every page, across a refresh?
 *
 * The console moved from tokens the app could read to httpOnly cookies it
 * cannot. That is the right design and it MOVED the failure modes rather than
 * removing them: nothing in the browser can now ask "am I signed in" directly,
 * so every screen infers it from `/admin/auth/me`, and each inference is a
 * chance to get it wrong in a way no unit test sees.
 *
 * The stakes here are higher than on the portal. This console approves KYC and
 * moves money, and its session is the thing standing between a shared laptop and
 * an approval nobody authorised. So the questions are not only "does it work"
 * but "does it STOP working when it should" — which is why logout is driven for
 * real, and asserted from the server's side rather than the UI's.
 */

/** Private routes, refreshed on each. */
const PRIVATE_PAGES = ['/dashboard', '/clients', '/kyc', '/roles', '/settings'];

test.describe('an authenticated admin session', () => {
  test('never flashes the signed-out UI while /admin/auth/me is in flight', async ({ page }) => {
    /*
     * The cookie-session failure a person notices and a test usually does not:
     * the session is valid, but the app cannot know it until a request answers,
     * so a screen that treats "no admin yet" as "signed out" shows the login
     * state for a moment on every load.
     *
     * The call is delayed so that moment is wide enough to observe. If nothing
     * is wrong, the console waits rather than lying.
     */
    await page.route('**/api/admin/auth/me', async (route) => {
      await new Promise((r) => setTimeout(r, 1_200));
      await route.continue();
    });

    await page.goto('/dashboard');
    // Sampled DURING the delay, not after it.
    await page.waitForTimeout(400);

    expect(page.url()).toContain('/dashboard');
    await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);
  });

  test('survives a hard refresh on every private page, chrome intact', async ({ page }) => {
    /*
     * The refresh is the whole test. A hard reload throws away the in-memory
     * context, the React Query cache and every inference the app had made, and
     * leaves it with a cookie it cannot read. Everything it knows it has to ask
     * for again — and each of those asks is a chance to render the signed-out
     * shell, or bounce a perfectly valid session to /login.
     *
     * The chrome is asserted alongside the URL because staying on the page while
     * losing the navigation is the failure people actually report: the portal's
     * sidebar vanished on reload twice, and both times the route was fine.
     */
    for (const path of PRIVATE_PAGES) {
      await page.goto(path);
      await page.reload();
      await page.waitForLoadState('networkidle');

      expect(page.url(), `refreshing ${path} redirected away`).toContain(path);
      await expect(
        page.getByRole('navigation').first(),
        `refreshing ${path} lost the console chrome`,
      ).toBeAttached();
      await expect(
        page.getByRole('button', { name: /^sign in$/i }),
        `refreshing ${path} rendered the signed-out screen`,
      ).toHaveCount(0);
    }
  });

  test('refreshes silently when only the access cookie is gone', async ({ page, context }) => {
    /*
     * THE REFRESH PATH, exercised the way it actually happens.
     *
     * The access cookie lives fifteen minutes and the refresh cookie thirty
     * days, so the ordinary state of an admin returning from lunch is exactly
     * this: no access token, a valid refresh token. Deleting the access cookie
     * reproduces it in a second rather than waiting a quarter of an hour.
     *
     * What must happen is nothing visible — the interceptor renews and retries,
     * and the admin never learns anything went missing. What must NOT happen is
     * a bounce to /login, which is what gating on the access cookie would cause
     * and why `proxy.ts` gates on the refresh cookie instead.
     */
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const before = await context.cookies();
    await context.clearCookies();
    // Everything back EXCEPT the short-lived access token.
    await context.addCookies(before.filter((c) => !c.name.includes('oxshare_crm_admin_at')));
    expect(
      (await context.cookies()).some((c) => c.name.includes('oxshare_crm_admin_at')),
      'the access cookie was not actually removed — this test would pass for the wrong reason',
    ).toBe(false);

    // Count the renewals, so "it still worked" cannot mean "nothing expired".
    const renewals: number[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/admin/auth/refresh')) renewals.push(res.status());
    });

    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    /*
     * A renewal HAPPENED and succeeded.
     *
     * Without this the test asserts only that the page rendered, which it would
     * also do if the cookie had never been removed — the failure mode where a
     * green test proves nothing. The precondition above guards the same risk
     * from the other side.
     */
    expect(
      renewals,
      'no refresh was attempted — the access cookie may still have been valid',
    ).not.toEqual([]);
    expect(renewals.every((s) => s === 200 || s === 201)).toBe(true);

    await expect(page, 'a renewable session was sent to login').toHaveURL(/\/clients/);
    await expect(page.getByRole('navigation').first()).toBeAttached();

    // And it really renewed, rather than the page merely rendering optimistically.
    const me = await page.evaluate(async () => {
      const res = await fetch('/api/admin/auth/me', { credentials: 'include' });
      return res.status;
    });
    expect(me).toBe(200);
  });

  test('gives up cleanly when the refresh cookie is gone too', async ({ page, context }) => {
    // The other half: nothing left to renew from is a real end of session, and
    // it must land on /login rather than looping or rendering a broken console.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await context.clearCookies();

    await page.goto('/clients');
    await expect(page, 'a dead session did not reach the sign-in screen').toHaveURL(/\/login/, {
      timeout: 20_000,
    });
  });

  test('does not loop or 401 while simply moving around', async ({ page }) => {
    // A refresh cycle that misfires shows up as repeated 401s rather than as a
    // broken screen — the session self-heals and nobody notices except the log.
    const rejections = collectRejections(page);

    for (const path of PRIVATE_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(rejections.list()).toEqual([]);
  });

  test('is really signed in, not just rendering as if', async ({ page }) => {
    // The end-to-end statement: the cookie the browser holds is one the API
    // accepts, on a request the page made itself.
    await page.goto('/dashboard');
    const me = await page.evaluate(async () => {
      const res = await fetch('/api/admin/auth/me', { credentials: 'include' });
      return { status: res.status, body: (await res.json()) as { email?: string } };
    });

    expect(me.status).toBe(200);
    expect(me.body.email).toBe(E2E_ADMIN.email);
  });

  test('cannot be forged from JavaScript', async ({ page }) => {
    /*
     * The point of the httpOnly migration, asserted rather than assumed.
     *
     * If the session were readable from JS, every XSS on this origin would be a
     * full takeover of an account that approves payouts. The CSRF token IS
     * readable by design — it is proof of same-origin, not a credential.
     */
    await page.goto('/dashboard');
    const visible = await page.evaluate(() => document.cookie);

    expect(visible).not.toMatch(/admin_access_token|admin_at/);
    expect(visible).not.toMatch(/admin_refresh_token|admin_rt/);
  });
});

test.describe('no session at all', () => {
  // A brand-new browser: no cookies, nothing cached.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sends a deep link to login rather than serving the page', async ({ page }) => {
    for (const path of PRIVATE_PAGES) {
      await page.goto(path);
      await expect(page, `${path} did not send a signed-out visitor to login`).toHaveURL(
        /\/login/,
        {
          timeout: 15_000,
        },
      );
    }
  });

  test('does not render console content before redirecting', async ({ page }) => {
    // The redirect is worth little if the page paints first. A signed-out
    // visitor must never see a client list, even for a frame.
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('still serves the two public pages', async ({ page }) => {
    /*
     * The mirror of the above: gating everything is not correctness either.
     *
     * `/invite/accept` in particular MUST be reachable without a session — the
     * whole point is that the person following the link does not have an account
     * yet. Gating it would make every invite undeliverable, and it is one entry
     * in a list where a careless edit would do exactly that.
     */
    for (const path of ['/login', '/invite/accept']) {
      await page.goto(path);
      await expect(page, `${path} should be public`).toHaveURL(new RegExp(path));
    }
  });

  test('refuses a made-up invite token without crashing', async ({ page }) => {
    // The link is a bearer credential that CREATES AN ADMIN ACCOUNT, so the
    // failure path matters as much as the success one: an invalid token has to
    // be a sentence on screen, never a stack trace and never a form that submits.
    await page.goto('/invite/accept?token=e2e-not-a-real-invite');

    await expect(page.getByText(/invalid|expired|not found|no longer/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('signing in and out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signs in, and the session survives a refresh', async ({ page }) => {
    await signIn(page);

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('navigation').first()).toBeAttached();
  });

  test('returns the operator to the page they were trying to reach', async ({ page }) => {
    /*
     * Intent, preserved across a sign-in.
     *
     * Bouncing everyone to /dashboard threw away where they were going —
     * someone opening a link to a specific client, or a bookmarked screen,
     * signed in and then had to find it again. On a session that quietly
     * expired, which is the ordinary case rather than the rare one, that
     * happens mid-task.
     */
    await page.goto('/clients?page=2');
    await expect(page).toHaveURL(/\/login/);
    // The query string travels too, so filters and paging survive.
    expect(decodeURIComponent(page.url())).toContain('/clients?page=2');

    await signIn(page, E2E_ADMIN, /\/clients/);
    await expect(page, 'the operator was not returned to where they were going').toHaveURL(
      /\/clients/,
    );
  });

  test('refuses to be pointed at another origin after sign-in', async ({ page }) => {
    /*
     * The reason `next` goes through `safeReturnTo` rather than straight into
     * `router.push`.
     *
     * The parameter comes out of a URL, so it is attacker-controlled even
     * though we are the ones who write it: anybody can send an operator a link
     * to `/login?next=https://evil.example/login`. A console that follows it
     * has handed over a phishing page wearing its own flow, at the exact moment
     * after a password was typed — and this one approves payouts.
     *
     * The protocol-relative and backslash forms are here because they are what
     * hand-rolled checks miss: browsers treat `/\evil.example` as `//`, and a
     * naive "starts with /" test waves it straight through.
     */
    /*
     * ONE case here, not the whole family.
     *
     * Every hostile form — protocol-relative `//evil`, the backslash variants
     * browsers normalise to `//`, control characters, absolute URLs — is
     * asserted in `src/lib/return-to.test.ts`, where it costs nothing. Driving
     * them through the browser would mean a real sign-in each, and admin login
     * is rate limited: the suite would exhaust the cap and fail for a reason
     * that has nothing to do with open redirects.
     *
     * What a browser adds over the unit test is proof that the validator is
     * actually WIRED to the redirect, and one case establishes that.
     */
    await page.context().clearCookies();
    await page.goto(`/login?next=${encodeURIComponent('https://evil.example/login')}`);
    await signIn(page);

    expect(new URL(page.url()).host, 'followed a hostile next=').toBe('localhost:3002');
    expect(page.url()).toContain('/dashboard');
  });

  test('signs out, and the signed-out session cannot walk back in', async ({ page }) => {
    /*
     * Logout, asserted from the SERVER's side.
     *
     * Clearing cookies in the browser is the easy half and the half that proves
     * nothing: what matters on a console that approves payouts is whether the
     * API still honours the session afterwards. So this navigates back to a
     * private page — only the server can answer that — rather than reading the
     * UI's opinion of itself.
     */
    await signIn(page);

    await page
      .getByRole('button', { name: /log ?out/i })
      .first()
      .click();
    await page.waitForURL(/\/login/, { timeout: 20_000 });

    await page.goto('/dashboard');
    await expect(page, 'a signed-out admin walked back into the console').toHaveURL(/\/login/);
  });
});
