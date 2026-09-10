import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NO SCREEN MAY PRE-RESOLVE ITS OWN ERROR MESSAGE.
 *
 * `AsyncBoundary` renders the caller's sentence with the API's beneath it —
 * `headline = errorMessage`, `detail = apiErrorMessage(error, '')`, and the
 * detail is dropped when the two are equal so a card never says one thing
 * twice.
 *
 * A call site written as
 *
 *     errorMessage={apiErrorMessage(query.error, t('x.loadFailed'))}
 *
 * defeats that, and does it silently. The prop arrives ALREADY resolved to the
 * API's message, `detail` resolves to the same string, they compare equal, the
 * dedup drops the second line — and the screen's own sentence never appears.
 * The component is correct and the caller has taken the decision away from it.
 *
 * ## Why this is a test rather than a convention
 *
 * Nine admin screens and seventeen portal ones were written this way, and every
 * one of them was a REASONABLE thing to write at the time: the component used to
 * throw the caller's line away, so the screens resolved the message themselves
 * to get anything useful on the card. They were working around a defect. When
 * the defect was fixed the workarounds became the defect — they were the reason
 * the fix reached 39 of 65 screens while being reported as closed.
 *
 * That is the shape worth guarding. A workaround for a bug outlives the bug, is
 * indistinguishable from ordinary code once the bug is gone, and nothing fails.
 *
 * ## Deliberately a test, not a lint rule
 *
 * `eslint.config.mjs` merges `no-restricted-syntax` by NAME across flat-config
 * blocks, so a new standalone block silently replaces the options of every
 * earlier one — that is how the §6.1 `Number()` ban on the money path was
 * disarmed once already, and the repo's own CLAUDE.md carries the warning. A
 * rule here would have to be spread into all six existing blocks. This costs
 * one file and cannot disarm anything else.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

describe('error copy is resolved by the boundary, never by the screen', () => {
  it('has no call site passing apiErrorMessage into errorMessage', () => {
    const offenders = walk(SRC)
      .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .flatMap((file) => {
        const lines = readFileSync(file, 'utf8').split('\n');
        return lines
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => /errorMessage=\{\s*apiErrorMessage\(/.test(line))
          .map(({ n }) => `${file.replace(SRC, 'src')}:${n}`);
      });

    expect(
      offenders,
      'these screens resolve the API message before AsyncBoundary sees it, so their own ' +
        'sentence is dropped by the dedup and never reaches the reader. Pass the plain ' +
        "string — errorMessage={t('x.loadFailed')} — and let the boundary add the API's " +
        'message beneath it. Keep error={…} so there is something to resolve.',
    ).toEqual([]);
  });
});
