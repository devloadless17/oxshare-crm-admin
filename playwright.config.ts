import { defineConfig, devices } from '@playwright/test';
import { CROSS, TOPOLOGY } from './e2e/topology';
import { STORAGE_STATE } from './e2e/helpers';

/**
 * End-to-end tests for the admin console.
 *
 * ## Why, given the unit suite passes
 *
 * The same reason as the portal's: every defect found by actually USING these
 * apps lived in the seam between a layout, a page and a fetch, and every one of
 * them passed its component tests. The admin-specific version of that seam is
 * permission gating — the nav is filtered client-side from a permission
 * catalogue and the API enforces the same catalogue with 403s, in two separate
 * repos with nothing connecting them. A disagreement between those two is
 * invisible to both test suites and obvious in a browser.
 *
 * These specs are therefore written against WHOLE JOURNEYS and cross-page state.
 * Anything assertable with testing-library belongs in a `.test.tsx`, where it
 * runs in milliseconds.
 *
 * ## No mobile project, deliberately
 *
 * The portal has one because nearly every KYC submission arrives from a phone.
 * Whether the ADMIN console supports small screens at all is an open question
 * (DECISIONS D-43, raised by the KYC review as §11r: "desktop-only, and
 * undeclared"). Asserting a mobile layout here would invent a requirement
 * nobody has agreed to, and asserting the absence of one would freeze an
 * accident into a contract. When that decision is made, add the project.
 *
 * ## What must be running
 *
 * The admin app is started by `webServer`. The BACKEND is not: it needs
 * Postgres, and standing the whole stack up from here would make a failure in
 * any of it look like a failed test. `global-setup.ts` checks and says what to
 * start.
 *
 * ## In CI, under E2E_STRICT
 *
 * This block used to say "not in CI yet — add the job once the specs have been
 * stable for a while". That job exists: `.github/workflows/ci.yml` stands up
 * Postgres, Redis, Mailpit and the API, and runs `npm run e2e` with
 * `E2E_STRICT=1` on pull requests and `workflow_dispatch`.
 *
 * `E2E_STRICT` is what makes that run evidence rather than decoration. A
 * skipped Playwright test reports as PASSING, so a guard that steps aside for a
 * missing fixture is indistinguishable in the summary from one that ran. Under
 * the flag those guards throw instead — see `requirePrecondition` and
 * `requireRail` in `e2e/helpers.ts`, and the lint rule in `eslint.config.mjs`
 * that refuses a bare `test.skip()` so the escape cannot be reintroduced.
 *
 * The stale sentence is recorded rather than simply deleted: it was believed
 * for long enough to be quoted back as fact while the job was already running.
 */
export default defineConfig({
  testDir: './e2e',
  // A real browser against a real API is slower than the unit suite by design.
  // A tight timeout turns a slow machine into a failing build.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Sequential. These journeys mutate ONE shared database — claiming a KYC
  // submission, creating a role — so parallel workers would race each other's
  // data, and a suite that fails only under concurrency is worse than a slow one.
  fullyParallel: false,
  workers: 1,

  // A test that only passes on the third attempt is not passing. Retries hide
  // exactly the flakiness worth knowing about while the suite is young.
  retries: 0,
  forbidOnly: true,

  globalSetup: './e2e/global-setup.ts',

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    // `localhost` for an ordinary run; `admin.crm.localhost` when E2E_TOPOLOGY=crosshost
    // reproduces the production cookie topology. See e2e/topology.ts.
    baseURL: TOPOLOGY.adminOrigin,
    // Kept only for failures: a trace per test is gigabytes and nobody opens the
    // passing ones. This is what makes a red run diagnosable without
    // reproducing it.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      // Signs in once and writes the session to disk; everything else depends on
      // it and starts authenticated. See auth.setup.ts on why this is not just
      // a convenience.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    // `dev`, not `build && start`: this suite is for catching things while
    // building, and a production build per run would make it too slow to reach
    // for. A CI job, when it exists, should use the built app.
    // In cross-host mode the dev server listens on a DIFFERENT port, so the
    // ordinary localhost server can stay up beside it; `NEXT_PUBLIC_*` is baked
    // at compile time, so it must be a fresh server rather than a reused one.
    command: CROSS ? `npx next dev --port ${TOPOLOGY.ports.admin}` : 'npm run dev',
    url: `http://localhost:${TOPOLOGY.ports.admin}`,
    reuseExistingServer: !CROSS,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
