import type { Reporter } from 'vitest/node';

/**
 * Names every test that only passed because it was RETRIED.
 *
 * ## Why this exists
 *
 * `vitest.config.mts` sets `retry: 2`, and its note is honest about the price:
 * "the cost is that a test which becomes genuinely flaky is quieter. That is
 * accepted deliberately… if these retries ever start hiding a real defect the
 * fix is to shard the suite rather than to raise the retry count."
 *
 * The trouble is that nothing could tell you the retries had started. A test
 * that passes on the third attempt reports identically to one that passed on
 * the first — same tick, same green summary — so "is this suite getting flakier"
 * was a question nobody could answer except by remembering how often they had
 * re-run it. The scoreboard has carried this suite as load-sensitive and worth
 * FIXING rather than re-running for weeks, and the first thing fixing it needs
 * is knowing which tests to fix.
 *
 * So this changes no outcome and gates nothing. A retried pass is still a pass
 * and the exit code is untouched — deliberately, because the retries were
 * measured and chosen, and turning them into failures here would undo that
 * decision by the back door. It only makes the set VISIBLE, which is the half
 * that was missing.
 *
 * ## Why a reporter rather than a threshold
 *
 * A count is not the useful artefact — the NAMES are. Flakiness in this suite
 * is concentrated in a handful of `userEvent` journeys, and the point of
 * printing them is that a repeated offender becomes obvious across runs instead
 * of being averaged away. Whoever decides to shard, split or rewrite one needs
 * to know which one.
 */
export default class FlakyReporter implements Reporter {
  /** `file › suite › test` for each retried case, with how many attempts it took. */
  private readonly retried = new Map<string, number>();

  onTestCaseResult(testCase: {
    fullName?: string;
    name?: string;
    module?: { moduleId?: string };
    diagnostic?: () => { retryCount?: number; flaky?: boolean } | undefined;
  }): void {
    /*
     * Read defensively. `diagnostic()` is where Vitest keeps the retry count —
     * NOT `result()`, which reports the final state and, confusingly, still
     * carries the errors from the attempts that failed. A reporter that threw
     * would take the whole run down, which is a far worse outcome than not
     * reporting a flake, so the whole thing sits in a try.
     */
    try {
      const diagnostic = testCase.diagnostic?.();
      if (!diagnostic) return;

      /*
       * `flaky` is Vitest's own word for "failed, then passed on a retry",
       * which is exactly the set worth naming. `retryCount` alone would also
       * catch a test that failed every attempt — that one is already a loud red
       * failure and does not need this.
       */
      if (!diagnostic.flaky) return;

      const attempts = diagnostic.retryCount ?? 0;
      const where = testCase.module?.moduleId ?? '';
      const label = testCase.fullName ?? testCase.name ?? '(unnamed test)';
      this.retried.set(where ? `${short(where)} › ${label}` : label, attempts);
    } catch {
      // See above: never let the reporter fail the run.
    }
  }

  onTestRunEnd(): void {
    if (this.retried.size === 0) return;

    const lines = [...this.retried.entries()]
      /* Worst first: the one to fix is the one that needed the most attempts. */
      .sort((a, b) => b[1] - a[1])
      .map(([name, attempts]) => `  · ${name} — passed on attempt ${attempts + 1}`);

    /*
     * `console.error`, so it survives a reporter that buffers stdout and so it
     * is visible in a CI log that only surfaces the tail. This is not a failure
     * and does not say "FAIL" anywhere — the wording has to make that obvious,
     * or somebody will read a green run as red.
     */
    console.error(
      [
        '',
        `⚠ ${this.retried.size} test(s) passed only after a RETRY — the suite is green, but these were flaky:`,
        ...lines,
        '',
        '  Retries are deliberate (see vitest.config.mts) and absorb CPU starvation on a loaded',
        '  machine. A test that appears here across several runs is not starvation — fix or shard it.',
        '',
      ].join('\n'),
    );
  }
}

/** The repo-relative path, because an absolute one wraps and buries the name. */
function short(moduleId: string): string {
  const marker = `${'src'}/`;
  const index = moduleId.replace(/\\/g, '/').lastIndexOf(marker);
  return index === -1 ? moduleId : moduleId.replace(/\\/g, '/').slice(index);
}
