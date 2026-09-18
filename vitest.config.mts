import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import FlakyReporter from './src/test/flaky-reporter.js';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // .tsx too: the previous glob was .test.ts only, so a component test could
    // be written, committed, and silently never run.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // jsdom, so a screen can actually be rendered and asserted on. Before this
    // there was no way to test a page at all, only pure functions.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
     * 20s, not vitest's default 5s.
     *
     * Every test in this suite that has ever timed out has been a `userEvent`
     * one — invite, kyc/builder, admin-users, audit-log, data-table — and none
     * of them assert anything time-sensitive. They are slow for a structural
     * reason: `userEvent.setup()` advances real timers between keystrokes, each
     * render goes through jsdom, and React Query settles on its own schedule. A
     * form fill that is 40ms of work on an idle machine is several seconds when
     * the box is also compiling another app or running a Testcontainers suite.
     *
     * 5s is not a deadline anybody chose for these tests; it is a default that
     * happens to sit just above their cost on a quiet machine and just below it
     * on a busy one. That produces a suite which is green locally and red in CI
     * for reasons unrelated to the code — and a flaky gate is one people learn
     * to re-run rather than read.
     *
     * Raising it costs nothing real: a test that genuinely hangs still fails,
     * 15 seconds later. It does NOT mask a slow application — nothing here
     * measures production performance.
     */
    /*
     * RETRY A FAILED TEST TWICE — the cheapest correct answer to this suite's
     * residual flakiness, and chosen only after the alternatives were measured.
     *
     * The flake is always the same shape: an assertion waiting for an error
     * state (a 404 becoming a BackendPending card) times out on a loaded
     * machine, and passes alone immediately afterwards. `src/test/render.tsx`
     * already disables React Query's back-off, so nothing is waiting on a
     * retry — the test is starved of CPU, not misconfigured.
     *
     * Measured on 18 Aug 2026, under `--coverage`, which is what CI runs:
     *   uncapped          48.5s   passed
     *   maxThreads: 8     56.2s   FAILED
     *   maxThreads: 8     46.6s   passed
     * Capping the workers neither fixed the flake nor paid for itself, so it is
     * not here. Raising `asyncUtilTimeout` a fourth time was refused for the
     * reason vitest.setup.ts states.
     *
     * Retrying is honest about what this is: a scheduling failure, not a product
     * failure. A genuinely broken test still fails — it fails all three
     * attempts — while a starved one costs milliseconds instead of a SIX-MINUTE
     * CI re-run, which on a private repo is real money.
     *
     * The cost is that a test which becomes genuinely flaky is quieter. That is
     * accepted deliberately, not overlooked: the flakiness is understood, the
     * failing shape is documented above, and if these retries ever start hiding
     * a real defect the fix is to shard the suite rather than to raise the
     * retry count.
     */
    retry: 2,
    /*
     * `default`, plus one that NAMES what the retry above absorbed.
     *
     * The retry note is honest that its cost is "a test which becomes genuinely
     * flaky is quieter", and nothing could tell you the retries had started: a
     * pass on the third attempt reports identically to a pass on the first. So
     * "is this suite getting flakier" was answerable only by remembering how
     * often somebody re-ran it.
     *
     * This gates nothing and changes no exit code — the retries were measured
     * and chosen, and failing on them here would undo that decision sideways.
     * It prints the names, which is the half that was missing and the half you
     * need before you can fix or shard anything.
     */
    reporters: ['default', new FlakyReporter()],
    /*
     * CAP THE WORKERS AT FOUR. This reverses the "capping is not here" verdict
     * in the note above, so here is the evidence and what changed.
     *
     * The measurement above (18 Aug, `maxThreads: 8`) stands exactly as taken.
     * It is not being called wrong — it was answering a different question. Its
     * variable was CPU: on a machine with cores to spare, eight workers versus
     * twenty-two is a scheduling detail, and it read as noise because it was.
     *
     * The variable that actually governs this suite is MEMORY. Every worker
     * carries its own jsdom, and this box has 5 GB total with roughly 2 GB free
     * once a Next dev server and an editor are up. Vitest defaults to
     * availableParallelism (22 here), so the suite asks for twenty-two jsdom
     * heaps out of two spare gigabytes, and v8 coverage instrumentation adds to
     * each one. That is why the flake appears under `--coverage` — which is
     * what CI runs — and why `retry: 2` could not absorb it: all three attempts
     * are starved by the same shortage, so retrying buys three timeouts.
     *
     * Measured 21 Aug 2026, under `--coverage`, same machine, back to back:
     *   uncapped        150.6s   FAILED (roles/page)
     *   uncapped        119.2s   FAILED (invite-admin-modal)
     *   maxWorkers: 4    90.0s   passed  68 files / 788 tests
     *   maxWorkers: 4    91.8s   passed
     *   maxWorkers: 4    89.4s   passed
     * Both failures passed 3/3 alone immediately afterwards, which is the
     * starvation shape the note above describes. Capping is 30-60s FASTER as
     * well as green: past the memory ceiling the extra workers spend their time
     * competing rather than working.
     *
     * Four, not eight: eight was measured on the memory ceiling and this is a
     * cap meant to sit under it. It costs nothing in CI — a GitHub runner has
     * four vCPUs, so vitest would land at or below four there regardless, and
     * this cannot make a CI run slower than it already is. What it buys is a
     * local `Stop` hook that means something. An unreliable hook is the same
     * failure the note above names: a gate people learn to re-run rather than
     * read. This one once reported 17 failures that were all starvation, and
     * hid two real ones (permission keys missing from src/test/permissions.ts)
     * inside the noise.
     *
     * If a machine ever wants more, raise it deliberately and re-measure under
     * `--coverage` — never uncap it silently.
     */
    maxWorkers: 4,
    testTimeout: 20_000,
    // Same reasoning for `beforeAll`/`afterAll`, which mount providers.
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Generated wholesale from the backend's OpenAPI document.
        'src/lib/api/types.gen.ts',
        '**/*.test.{ts,tsx}',
        // Layout shells and providers are wiring, not decisions; covering them
        // inflates the number without testing anything.
        'src/app/**/layout.tsx',
        'src/components/query-provider.tsx',
        'src/components/theme-provider.tsx',
      ],
      /*
       * A FLOOR pinned just under the current measured numbers — not a target.
       * An 80% threshold on a suite sitting near 20% gets disabled the first time
       * it blocks someone, and then it protects nothing at all.
       *
       * These may only ever go up. `npm run test:coverage` prints the figures.
       */
      // Raised after the RBAC slice — the admin directory, the outstanding-invites
      // panel and the per-admin permission editor all arrived with tests, and the
      // roles/settings split brought its three screens under test too. Measured
      // 2026-08-05: statements 70.19, branches 64.73, functions 58.53, lines 71.93.
      // Set a point or two under.
      //
      // ⚠️ LOWERED 2026-08-10, and the rule above says these may only go up — so
      // this is the exception, deliberately taken, and here is exactly why.
      //
      // The numbers above were never actually enforced. `npm audit
      // --audit-level=high` sits two steps earlier in the CI job and the shell
      // runs with `-e`, so from 6 August every push died at the audit and this
      // gate never executed — twenty-five consecutive red runs, none of them
      // about the code in the commit. Roughly fourteen points of screens landed
      // untested behind that, invisible, because the pipeline was already red
      // and nobody could tell one red from another.
      //
      // Fixing the audit revealed the drop. Measured 2026-08-10: statements
      // 56.74, branches 54.09, functions 47.63, lines 57.25. The choice was
      // between leaving CI red until the missing tests are written and pinning
      // the floor where the suite actually stands; the second was taken
      // knowingly, so that the NEXT regression is visible rather than hidden
      // under a threshold nothing had checked in a week.
      //
      // These are the real numbers now. They go UP from here — see DECISIONS
      // D-53, which records the debt so it is a decision somebody made and not
      // a limit that quietly slipped.
      //
      // ⚠️ RE-BASED 18 Aug 2026, DOWNWARD, and the reason is named rather than
      // absorbed. CI had been red on every push for days with all 57 files and
      // 679 tests PASSING — only these four numbers failed, each by about a
      // point. Every one of those runs cost 5–6 minutes to prove the same known
      // thing, which is how a gate stops being read.
      //
      // The coverage did not erode across the codebase; ten new console screens
      // arrived with NO tests at all, ~650 statements at 0%:
      //   transactions · approvals/ib · products · agencies · currencies
      //   ib-levels · api-keys · payment-methods · commissions
      //   components/transactions/withdrawal-rival
      //
      // That list IS the debt. Lowering the floor does not repay it — it stops
      // the gate lying about being broken while the debt stays visible here.
      // Cover any two of those screens and every number below can go back up.
      // Do not lower them a third time without naming what lost the coverage.
      /*
       * Raised 21 Aug 2026 from 54/45/51/53, against a measured run of 66 files
       * / 773 tests: statements 58.65, branches 56.31, functions 49.16, lines
       * 59.28. The jump came from covering the partner and catalogue screens,
       * which had none at all.
       *
       * A FLOOR, a point or so under the measurement — never a target. It may
       * only ever go up.
       */
      /*
       * Raised 24 Aug 2026, against a measured `--coverage` run of 74 files /
       * 870 tests: statements 60.79, branches 58.62, functions 52.13, lines
       * 61.69. The gain came from the screens that arrived with tests this
       * round — the product catalogue's spread markup and the IB programme
       * order — plus the partner and catalogue work before it.
       *
       * A FLOOR, a point or so under the measurement, never a target. Raising
       * it is the whole mechanism: a floor left below the real number cannot
       * see the next regression, which is how this file came to be re-based
       * DOWNWARD twice while ten screens landed with no tests at all.
       */
      /*
       * RAISED 17 Sep 2026, against a measured run of 99 files / 1055 tests:
       * lines 68.22, statements 67.15, functions 58.77, branches 63.66.
       *
       * The previous floor had drifted six to seven points under that — nobody lowered it,
       * the suite grew and nothing lifted it. A floor far enough under the
       * measurement stops catching the regressions it was written for: at the old
       * number a change could delete most of that gap and still pass.
       *
       * Set about a point and a half under rather than flush, the same margin the
       * backend uses and for the same reason — a threshold that reddens for
       * environment reasons is one people route around.
       */
      thresholds: {
        lines: 66,
        statements: 65,
        functions: 57,
        branches: 62,
      },
    },
  },
});
