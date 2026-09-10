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
        await persistStateIfLive(context, storageState).catch((reason: unknown) => {
          /*
           * ⚠️ THE REFUSAL AND THE DAMAGE ARE THE SAME EVENT, so this must not be
           * silent — and it must not throw either.
           *
           * `persistStateIfLive` throws by design when the context holds no
           * refresh cookie, and refusing is CORRECT: writing a signed-out jar
           * would sign out every later test. But by the time it refuses, this
           * test has already rotated the token — so the one still in the FILE is
           * spent, and the next test to replay it trips reuse detection, which
           * revokes the whole family and signs out everything after it,
           * including a later project.
           *
           * That is the failure the docblock at the top of this file describes,
           * arriving through the mitigation's own escape hatch. `.catch(() =>
           * undefined)` erased the only evidence it had happened: a run where
           * the persist SUCCEEDED and a run where it REFUSED were
           * indistinguishable afterwards, which is exactly why a 22-failure
           * portal run on 10 Sep 2026 could be inferred and never diagnosed.
           * Playwright clears `test-results/` on each run, so the traces that
           * would have settled it were gone before the question was asked.
           *
           * It does NOT throw. Failing an unrelated test for a fixture problem
           * mislabels it, and this suite has already paid for that once — a hook
           * timeout wearing the costume of the defect it was detecting. Being
           * loud is the whole fix.
           *
           * The message names WHAT STATE THE FILE IS IN rather than that a call
           * failed. "Persist failed" sends a reader to the persist function;
           * this sends them to the consequence, which is where the next hour of
           * their evening is otherwise going to go.
           */
          console.warn(
            `\n[e2e] STORAGE STATE NOT PERSISTED after a token rotation: ${String(reason)}\n` +
              `      ${storageState} still holds the PREVIOUS refresh token, which this test ` +
              'has already rotated.\n' +
              '      The next test to replay it will trip reuse detection and sign out every ' +
              'test after it,\n' +
              '      including a later Playwright project. If later tests fail as unexplained ' +
              'sign-outs, this line is why.\n',
          );
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
