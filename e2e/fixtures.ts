import { test as base, expect } from '@playwright/test';
import { isApi, persistStateIfLive } from './helpers';

/**
 * Every spec imports `test` from HERE, not from `@playwright/test`.
 *
 * ## The rotated-token problem this closes
 *
 * Each test starts a fresh context from the storage-state file `auth.setup.ts`
 * wrote. The access cookie in that file lives fifteen minutes; a full run takes
 * longer. So mid-run the first request of some test finds its access token
 * expired, the interceptor renews — and renewal ROTATES the refresh token. The
 * test's context now holds the new token; the FILE still holds the old one.
 *
 * The next test replays the file. Presenting a refresh token that has already
 * been rotated is exactly what reuse detection exists to punish: the whole
 * family is revoked, and every test from then on — including a later project,
 * the mobile one here — is signed out for reasons that read as a dozen
 * unrelated failures. That is precisely what took 20 tests down in one run.
 *
 * ## What this does
 *
 * Watches the context for a successful `POST …/auth/refresh`. If one happened,
 * the test's jar is the only place the live token exists, so it is written back
 * over the storage-state file this test was started from — the one named by the
 * `storageState` option, which `test.use({ storageState })` overrides per spec.
 * A test that forged or cleared cookies never sees a SUCCESSFUL refresh, so it
 * never persists its junk.
 *
 * Auto, so no spec can forget it. The explicit `persistSharedState` calls in the
 * specs that DELIBERATELY force a renewal remain correct and merely redundant.
 */
export const test = base.extend<{ persistRotation: void }>({
  persistRotation: [
    async ({ context, storageState }, use) => {
      let rotated = false;
      const onResponse = (response: import('@playwright/test').Response) => {
        if (isApi(response, '/admin/auth/refresh', 'POST') && response.ok()) rotated = true;
      };
      context.on('response', onResponse);
      await use();
      context.off('response', onResponse);
      if (rotated && typeof storageState === 'string') {
        // Through the live-check: a successful rotation followed by a sign-out
        // (or a cleared jar) must never overwrite the file with nothing.
        await persistStateIfLive(context, storageState).catch(() => undefined);
      }
    },
    { auto: true },
  ],
});

export { expect };
