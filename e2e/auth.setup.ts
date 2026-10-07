import { test as setup, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  E2E_KYC_VIEWER,
  E2E_RESTRICTED,
  KYC_VIEWER_STATE,
  RESTRICTED_STATE,
  signIn,
  STORAGE_STATE,
} from './helpers';
import { completeAuthenticator, resetAuthenticator } from './authenticator';

/**
 * Sign in ONCE, and let every spec reuse the session.
 *
 * Not a convenience. Admin login is rate limited — correctly — and a suite that
 * signs in per spec rate-limits itself and anybody signing in from a browser at
 * the same time. The cap should not be relaxed for tests; the tests should stop
 * asking. Login itself is still exercised here, and by the specs that
 * deliberately drive the form.
 */
/*
 * A FRESH login every run, deliberately — the saved state is NOT reused across
 * runs, and that was tried and reverted.
 *
 * Caching it looked like free savings against the 5-per-minute login cap: the
 * access cookie lives 8 hours, so yesterday's session is still valid. It is
 * not, and the reason is R-3.3: refresh tokens ROTATE and are single-use.
 * Replaying a state file from an earlier run presents a token that has already
 * been spent, reuse detection correctly reads that as a leaked credential, and
 * it revokes the entire family — signing the run out mid-suite, several specs
 * away from the cause.
 *
 * The rate limit is handled by WAITING for it (see `signIn`), not by hoarding
 * sessions. A security control that punishes replay is doing its job; the
 * suite has to stop replaying, not the control stop noticing.
 */
setup('authenticate as the e2e admin', async ({ page }) => {
  await signIn(page);

  // Not committed: these are live session cookies, and `.auth/` is gitignored.
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });

  await warmRoutes(page);
});

/**
 * Compile the routes the suite drives, before any test is timed.
 *
 * `next dev` compiles a route the first time it is REQUESTED, so the first spec
 * to reach `/clients` pays a cold webpack build inside its own timeout. On a
 * loaded machine that alone exceeds the 15s row wait in `searchOwnClients`, and
 * the run reports "the client list never showed alpha" — which reads as a broken
 * filter and is really a compiler.
 *
 * That is the worst shape of flake: it hits whichever two specs happen to run
 * first, so it moves when the file order changes and looks like a different bug
 * each time. It cost one full-suite red whose every spec passed individually.
 *
 * Warming rather than raising the timeout keeps the timeout meaning what it says
 * — "the app did not respond" — instead of quietly becoming a budget for
 * compilation.
 *
 * It has to happen HERE and not in `global-setup.ts`: every route below is
 * behind `src/proxy.ts`, so an unauthenticated request is redirected to /login
 * and compiles nothing. This runs on the session that was just established.
 *
 * Navigation failures are swallowed on purpose. A route that will not load is a
 * test's job to report, with an assertion naming what was expected — not a setup
 * crash naming a URL.
 */
async function warmRoutes(page: Page): Promise<void> {
  const routes = [
    '/dashboard',
    '/clients',
    '/tags',
    '/roles',
    '/admin-users',
    '/kyc',
    '/audit-log',
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => null);
  }
}

/**
 * The second identity, and the reason there is one.
 *
 * FR-RBAC-03 says a section an administrator lacks the permission for is
 * "neither presented nor accessible". Neither half can be demonstrated by an
 * account that holds every permission, so the suite needs somebody who does
 * not — and a separate `storageState`, because these are two different
 * sessions and sharing one would mean the two suites fighting over a single
 * refresh-token family.
 */
setup('authenticate as the restricted e2e admin', async ({ page }) => {
  await signIn(page, E2E_RESTRICTED);
  mkdirSync(dirname(RESTRICTED_STATE), { recursive: true });
  await page.context().storageState({ path: RESTRICTED_STATE });
});

/**
 * The third identity: a READ-ONLY compliance reviewer — `kyc.view` and
 * `clients.view`, no `kyc.review`. The one that proves the review screen draws
 * no decision button for somebody who may not decide. Skipped, not failed, on
 * a database that predates the fixture.
 */
setup('authenticate as the kyc-viewer e2e admin', async ({ page }) => {
  await page.goto('/login');
  resetAuthenticator(E2E_KYC_VIEWER.email);
  await page.locator('#email').fill(E2E_KYC_VIEWER.email);
  await page.locator('#password').fill(E2E_KYC_VIEWER.password);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/auth/login')),
    page
      .getByRole('button', { name: /sign in|log ?in/i })
      .first()
      .click(),
  ]);
  setup.skip(response.status() === 401, 'e2e-kyc-viewer@oxshare.com is not seeded yet');
  if (response.status() === 429) {
    // Same cap as the others; the kyc-viewer specs skip when this state is absent.
    setup.skip(true, 'login rate limited; kyc-viewer specs will skip this run');
  }
  if ((await completeAuthenticator(page, E2E_KYC_VIEWER.email)) === 'rate-limited') {
    setup.skip(true, 'authenticator rate limited; kyc-viewer specs will skip this run');
  }
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  mkdirSync(dirname(KYC_VIEWER_STATE), { recursive: true });
  await page.context().storageState({ path: KYC_VIEWER_STATE });
});
