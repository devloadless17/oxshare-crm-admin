import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_DOMAIN, STORAGE_STATE, signIn } from './helpers';

/**
 * The auth-correctness regressions — `docs/AUTH-CORRECTNESS-oxshare-crm-admin.md`.
 *
 * Each test here fails on the console as it stood on 6 Aug 2026 and passes with
 * the fix beside it. They are separate from `auth-session.spec.ts`, which covers
 * the flows that already worked; this file is only the defects.
 *
 * Every time-dependent case is forced rather than waited for — cookies are
 * deleted or forged, and failures are injected with `page.route`. Nothing here
 * uses `waitForTimeout` as a stand-in for expiry.
 */

test.describe('a dead session always has a way out', () => {
  test('a present-but-invalid refresh cookie lands on sign-in, not a spinner', async ({
    page,
    context,
  }) => {
    /*
     * The frozen console (A-C2). `proxy.ts` admits on the mere PRESENCE of the
     * refresh cookie, so a forged one gets past the gate; `/admin/auth/me` then
     * 401s and the refresh fails. The eviction used to be gated on the CSRF
     * cookie existing — and that cookie lives 8 hours against the refresh
     * cookie's 30 days, so an operator returning the next morning had one and
     * not the other, and the redirect was silently suppressed.
     *
     * Deleting the CSRF cookie reproduces the morning-after state exactly.
     */
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(
      cookies
        .filter((c) => c.name.includes('oxshare_crm_admin_rt'))
        .map((c) => ({ ...c, value: 'forged-but-present' })),
    );
    expect(
      (await context.cookies()).some((c) => c.name.includes('csrf')),
      'the CSRF cookie was not actually removed — this would pass for the wrong reason',
    ).toBe(false);

    await page.goto('/clients');

    await expect(page, 'a dead session was left on a spinner with no way out').toHaveURL(
      /\/login/,
      {
        timeout: 20_000,
      },
    );
  });

  test('an unreachable API says so instead of spinning forever', async ({ page }) => {
    /*
     * A-C3. `useQuery` collapses an error into `data === undefined`, so a 500 or
     * a dropped connection on `/admin/auth/me` was indistinguishable from "no
     * session" — and the layout rendered the spinner whose comment claims the
     * interceptor is already redirecting. On this path there is no 401, so
     * nothing was redirecting. Stopping the backend was enough to reproduce it.
     */
    await page.route('**/api/admin/auth/me', (route) => route.fulfill({ status: 500, body: '{}' }));

    await page.goto('/dashboard');

    await expect(
      page.getByText(/cannot reach the server/i),
      'a transport failure still renders as an endless spinner',
    ).toBeVisible({ timeout: 20_000 });
    // And it must NOT have been mistaken for a dead session.
    expect(page.url()).toContain('/dashboard');
  });

  test('a repeated 401 sends the operator to sign in rather than to a dead Retry button', async ({
    page,
  }) => {
    /*
     * A-C5. The interceptor refreshes once and replays. If the replay ALSO 401s
     * — a suspended admin, a revoked family, a role deleted mid-session — the
     * `_retry` guard was false and control fell through to a bare reject, so the
     * screen showed "something went wrong" with a Retry that could never work.
     *
     * The refresh is made to succeed so the replay is genuinely reached.
     */
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.route('**/api/admin/auth/refresh', (route) =>
      route.fulfill({ status: 200, body: '{}' }),
    );
    await page.route('**/api/admin/auth/me', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ code: 'SESSION_REVOKED' }) }),
    );

    await page.goto('/clients');

    await expect(page, 'a permanently-401ing session never reached sign-in').toHaveURL(/\/login/, {
      timeout: 20_000,
    });
  });
});

test.describe('the front door', () => {
  test('a signed-in operator visiting / lands on the console, not the login form', async ({
    page,
  }) => {
    /*
     * A-C4. `app/page.tsx` is an unconditional `redirect('/login')`, `/login` is
     * public, and the console had no reverse gate — so typing the bare host, or
     * clicking a `/` bookmark, showed an empty sign-in form to somebody who was
     * demonstrably signed in. Not a flash: permanent, and `loginPathFor`
     * excludes `/` from `?next=`, so there was not even a destination to
     * recover.
     */
    await page.goto('/');

    await expect(page, 'the bare host stranded a signed-in operator on the login form').toHaveURL(
      /\/dashboard/,
      { timeout: 20_000 },
    );
  });

  test('a signed-in operator visiting /login is not left on the form', async ({ page }) => {
    // Submitting it would mint a SECOND thirty-day token family over the first,
    // and on a shared machine it is a sign-in box sitting under a live session.
    await page.goto('/login');

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });
});

test.describe('layout', () => {
  test('the client profile renders ONE console, not two', async ({ page }) => {
    /*
     * A-C1. `clients/layout.tsx` and `clients/[id]/layout.tsx` both wrapped
     * `<AdminLayout>`, and Next nests layouts — so the deepest route in the
     * console drew two sidebars, two headers and two logout buttons, and
     * evaluated the session and permission gate twice.
     *
     * The existing suite could not see it: `auth-session.spec.ts` reaches the
     * logout button with `.first()`, which passes whether there is one or two.
     */
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    const firstClient = page.getByRole('link', { name: /alpha/i }).first();
    if (!(await firstClient.isVisible().catch(() => false))) {
      test.skip(true, 'no seeded client row to open — needs the e2e client fixture');
    }
    await firstClient.click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('navigation'),
      'the client profile rendered a nested second console shell',
    ).toHaveCount(1);
  });
});

test.describe('invites', () => {
  test('refreshing the accept page keeps the invite usable', async ({ browser }) => {
    /*
     * A-C8. The page scrubs the token out of the address bar as soon as it has
     * read it — right, for a bearer credential that creates an admin account —
     * but it then re-read the token from the URL on every render. So a RELOAD
     * found nothing and showed "invalid link" to somebody holding a good invite,
     * with no way back except the original email. A person who has just mistyped
     * a password, or whose browser restored the tab, does not always still have
     * it.
     *
     * A REAL invite is minted for this, because a fake token renders the same
     * "invalid" screen before and after and so cannot tell the two apart. With a
     * real one the first render shows the password form, and the assertion is
     * simply that a reload still shows it.
     */
    const admin = await browser.newContext({ storageState: STORAGE_STATE });
    /*
     * Origin AND the anti-forgery header, by hand.
     *
     * `context.request` sends the cookie jar but not the headers a page would:
     * the API checks the Origin on every state change and demands the CSRF
     * cookie echoed into `X-OxShare-CSRF`. Without both this is a 403 that reads
     * like a permissions problem.
     */
    const csrf = (await admin.cookies()).find((c) => c.name.includes('admin_csrf'))?.value;
    expect(csrf, 'no CSRF cookie in the saved session').toBeTruthy();
    const created = await admin.request.post('/api/admin/invite', {
      headers: { Origin: 'http://localhost:3002', 'X-OxShare-CSRF': csrf! },
      data: {
        email: `e2e-reload-${Date.now()}@${E2E_DOMAIN}`,
        name: 'Reload Invitee',
        permissions: ['users.view'],
      },
    });
    expect(created.ok(), `could not mint an invite: ${created.status()}`).toBe(true);
    const body = (await created.json()) as { inviteUrl?: string };
    const inviteUrl = body.inviteUrl;
    expect(
      inviteUrl,
      'the API returned no inviteUrl — it is echoed outside production only',
    ).toBeTruthy();
    const token = new URL(inviteUrl!).searchParams.get('token');

    // A clean browser: the invitee has no session, which is the whole premise.
    const invitee = await browser.newContext();
    const page = await invitee.newPage();
    await page.goto(`/invite/accept?token=${token}`);

    const passwordField = page.locator('#new-password');
    await expect(passwordField, 'the invite did not validate on first load').toBeVisible({
      timeout: 20_000,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(
      passwordField,
      'reloading the accept page destroyed the invite — the token did not survive the URL scrub',
    ).toBeVisible({ timeout: 20_000 });

    await invitee.close();
    await admin.close();
  });
});

test.describe('two tabs', () => {
  test('signing out in one tab signs the other out', async ({ browser }) => {
    /*
     * A-C9. Nothing in this app knew another tab existed. `logout` hard-navigates
     * the tab it runs in; the others kept their React Query cache and their
     * chrome, and — because the eviction was gated on a CSRF cookie the logout
     * had just cleared — never corrected even on their next request. On a shared
     * back-office machine that is the console still showing an operator's name
     * and data to whoever sits down next.
     *
     * ONE context, two pages: that is what makes them share a cookie jar, which
     * is what makes this the real scenario rather than a simulation of it.
     */
    /*
     * ONE context, two pages, seeded from the SAVED session.
     *
     * Not `signIn` — the fixture is already authenticated, so driving the form
     * would be bounced straight off `/login` by the reverse gate this same
     * change added, and would spend one of the five logins a minute the API
     * allows. Sharing a context is the part that matters anyway: it is what
     * gives the two pages one cookie jar, which is what makes this the real
     * scenario rather than a simulation of it.
     */
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await tabA.goto('/dashboard');
    await tabA.waitForLoadState('networkidle');
    await tabB.goto('/clients');
    await tabB.waitForLoadState('networkidle');
    await expect(tabB.getByRole('navigation').first()).toBeAttached();

    await tabA
      .getByRole('button', { name: /log ?out/i })
      .first()
      .click();
    await tabA.waitForURL(/\/login/, { timeout: 20_000 });

    await expect(tabB, 'the second tab kept rendering the console after sign-out').toHaveURL(
      /\/login/,
      { timeout: 20_000 },
    );

    /*
     * Put the shared session back, and rewrite the file the other specs load.
     *
     * Logging out revokes EVERY refresh family for that admin (R-3.3), so this
     * test does not merely end its own context — it kills the seeded session
     * that `auth.setup.ts` saved and every later spec restores from. Without
     * this the next spec inherits cookies the server has already revoked and
     * fails for a reason that has nothing to do with what it is testing, which
     * is exactly the kind of order-dependent failure that makes a suite
     * untrustworthy.
     *
     * It costs one extra sign-in per run, which is inside the five-per-minute
     * cap because nothing else in this file signs in at all.
     */
    await signIn(tabA, E2E_ADMIN);
    await context.storageState({ path: STORAGE_STATE });

    await context.close();
  });

  test('two tabs renewing at once do not destroy the session', async ({ browser }) => {
    /*
     * A-C10. The single-flight lock is module scope, which is per TAB, and each
     * tab runs its own ten-minute timer — so a laptop waking with two tabs open
     * fires two refreshes at one rotating token. One was told "Session has been
     * revoked" and bounced to sign-in holding a valid thirty-day session; worse,
     * the whole family could be destroyed with a credential-theft alert.
     *
     * Deleting the access cookie makes both tabs need a renewal at the same
     * instant, which is the state a wake produces.
     */
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await tabA.goto('/dashboard');
    await tabA.waitForLoadState('networkidle');
    await tabB.goto('/dashboard');
    await tabB.waitForLoadState('networkidle');

    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(cookies.filter((c) => !c.name.includes('oxshare_crm_admin_at')));

    // Both tabs act at once. Neither may end up signed out.
    await Promise.all([
      tabA.goto('/clients').catch(() => undefined),
      tabB.goto('/kyc').catch(() => undefined),
    ]);
    await Promise.all([tabA.waitForLoadState('networkidle'), tabB.waitForLoadState('networkidle')]);

    expect(tabA.url(), 'tab A was signed out by a concurrent renewal').not.toContain('/login');
    expect(tabB.url(), 'tab B was signed out by a concurrent renewal').not.toContain('/login');

    await context.close();
  });
});
