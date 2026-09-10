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
  /** Each `<AsyncBoundary …>` opening tag, with arrows inside props tolerated. */
  const openingTags = (source: string): { offset: number; tag: string }[] => {
    const out: { offset: number; tag: string }[] = [];
    let i = source.indexOf('<AsyncBoundary');
    while (i >= 0) {
      let j = i + '<AsyncBoundary'.length;
      let depth = 0;
      while (j < source.length) {
        const c = source[j];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0 && source[j - 1] !== '=') break;
        j += 1;
      }
      out.push({ offset: i, tag: source.slice(i, j) });
      i = source.indexOf('<AsyncBoundary', j);
    }
    return out;
  };

  const sourceFiles = () =>
    walk(SRC).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

  /*
   * ⚠️ THE CENSUS MUST PROVE IT CAN SEE ITS OWN SUBJECT, AND THIS CASE GOES FIRST.
   *
   * Every rule below passes by finding NOTHING. So a scan that finds nothing
   * because it is broken is indistinguishable from a codebase that is clean —
   * both are an empty offenders array, and the file reports success either way.
   *
   * That is not a theoretical worry. The portal's copy of this census shipped
   * with `/<AsyncBoundary\b[\s\S]*?>/`, which is non-greedy and therefore stops
   * at the FIRST `>` in the source — the arrow in `onRetry={() => …}`, which
   * nearly every boundary here carries. Every "tag" it captured ended before
   * `errorMessage` was reached, so the rule saw zero call sites out of 65 and
   * passed. Found by mutation-testing the rule rather than reading it.
   *
   * A low count that looks plausible is the dangerous shape: nobody checks a
   * number that seems about right. So this asserts a FLOOR on what was seen,
   * and it fails loudly if a future edit to the scanner blinds it. Same
   * convention as the coverage thresholds and the suite floor — pinned under
   * the measured number, and it may only ever go up.
   */
  it('can SEE the call sites it is censusing — a blind census passes vacuously', () => {
    const tags = sourceFiles().flatMap((f) => openingTags(readFileSync(f, 'utf8')));
    const withCopy = tags.filter(({ tag }) => tag.includes('errorMessage='));

    /*
     * A COUNT FLOOR ALONE DOES NOT CATCH THIS, WHICH I FOUND BY MUTATING IT.
     *
     * Restoring the truncating scanner here leaves 36 of the 43 tags still
     * carrying errorMessage — only the seven with an arrow BEFORE their
     * errorMessage go dark. So a floor of 30 passed the mutation and told me
     * the guard worked when it did not. The floor is pinned just under the
     * measured 43 for the ordinary regression, and the assertion below is what
     * actually distinguishes a correct scanner from a truncating one.
     */
    // Measured 10 Sep 2026: 43 boundaries, all 43 carrying errorMessage.
    expect(
      tags.length,
      'the scanner found far fewer AsyncBoundary tags than this app has — it is ' +
        'blind, and every rule below is passing over screens it never read. If ' +
        'boundaries were deliberately deleted, lower this floor in the same commit.',
    ).toBeGreaterThan(40);
    expect(
      withCopy.length,
      'no boundary appears to carry errorMessage, which cannot be true of this app',
    ).toBeGreaterThan(40);

    /*
     * THE TARGETED ONE. A tag whose `onRetry={() => …}` sits BEFORE its
     * errorMessage is exactly what a `>`-terminated scan cannot see past, so
     * finding one proves the scan survives an arrow. Measured: seven such tags,
     * `bridge/page.tsx` among them. This does not drift as screens are added or
     * removed, which the count floors do.
     */
    const arrowBeforeCopy = withCopy.filter(({ tag }) => {
      const at = tag.indexOf('errorMessage=');
      return at > 0 && tag.slice(0, at).includes('=>');
    });
    expect(
      arrowBeforeCopy.length,
      'not one tag was seen with an arrow before its errorMessage, and this app ' +
        'has seven. The scan is stopping at the `>` of `() =>`, so those tags end ' +
        'before their props are reached and every rule below skips them silently.',
    ).toBeGreaterThan(0);
  });

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

  /*
   * THE OTHER DOOR THE SAME DEFECT COMES BACK THROUGH.
   *
   * The failure message above ends "Keep error={…} so there is something to
   * resolve", and until this case nothing checked that. A screen passing
   * `errorMessage` with no `error` renders its own sentence with the API's
   * reason silently absent — which is half the original defect, arriving from
   * the opposite side: the first door dropped the SCREEN's line, this one drops
   * the API's.
   *
   * There are no offenders today, and that is exactly when a floor is worth
   * adding: it costs one assertion and it can only ever be lowered by somebody
   * writing the thing it forbids. Adding it after the first violation would
   * mean fixing a screen first.
   *
   * ## Why the tag is scanned brace-aware rather than line-grepped
   *
   * The two props are usually on different lines, so a line-based rule cannot
   * see them together — and a naive `<AsyncBoundary ... >` regex is worse than
   * useless here, because `onRetry={() => q.refetch()}` contains a `>` that ends
   * the match early. A tag truncated before its `errorMessage` is simply skipped
   * and the case reports success over a screen it never read. That is the
   * failure this whole file is about, so it would be a poor one to build into
   * it: the scanner tracks `{}` depth and ignores the `>` of an arrow.
   */
  it('has no call site passing errorMessage without an error to resolve', () => {
    const offenders = sourceFiles().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return openingTags(source)
        .filter(({ tag }) => tag.includes('errorMessage=') && !tag.includes('error={'))
        .map(
          ({ offset }) =>
            `${file.replace(SRC, 'src')}:${source.slice(0, offset).split('\n').length}`,
        );
    });

    expect(
      offenders,
      'these screens pass their own sentence but no error for the boundary to resolve, ' +
        "so the API's reason never reaches the reader — the same defect as above, from " +
        'the other side. Pass error={query.error} alongside errorMessage.',
    ).toEqual([]);
  });
});
