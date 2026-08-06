import { test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { signIn, STORAGE_STATE } from './helpers';

/**
 * Sign in ONCE, and let every spec reuse the session.
 *
 * Not a convenience. Admin login is rate limited — correctly — and a suite that
 * signs in per spec rate-limits itself and anybody signing in from a browser at
 * the same time. The cap should not be relaxed for tests; the tests should stop
 * asking. Login itself is still exercised here, and by the specs that
 * deliberately drive the form.
 */
setup('authenticate as the e2e admin', async ({ page }) => {
  await signIn(page);

  // Not committed: these are live session cookies, and `.auth/` is gitignored.
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
