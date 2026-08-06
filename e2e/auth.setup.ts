import { test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { E2E_RESTRICTED, RESTRICTED_STATE, signIn, STORAGE_STATE } from './helpers';

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
});

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
