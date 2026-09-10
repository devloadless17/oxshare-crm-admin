import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A SEARCH BOX THAT CHANGES THE ROWS ALSO CHANGES THE URL.
 *
 * ## Why this is a correctness property, not a nicety
 *
 * The console keeps table state in the address bar — `useTableQueryState` puts
 * filters, sort, page and page size there so a screen can be refreshed, shared
 * and gone back to. A search held only in React state breaks all three at once,
 * and the failure is quiet: the tab, the filters and the sort survive a refresh
 * while the search does not, so the operator gets a DIFFERENT row set at the
 * same URL and nothing says so. A link sent to a colleague shows them a wider
 * set than the sender was looking at.
 *
 * The withdrawals desk had exactly that. Its state tab was in the URL and its
 * search was `React.useState('')` — never read from the address bar, never
 * written to it, and used only to build the API params. On the one screen where
 * "these are the payouts matching X" being wrong is most expensive.
 *
 * ## The shape this checks
 *
 * A page that owns URL state AND holds a search in local state must do both
 * halves of the round trip: seed the state from `url.get('q')`, and write the
 * debounced value back with `url.set({ q ... })`. Half of it is worse than
 * neither — seeding without writing back makes the box look like it restored,
 * and writing without seeding blanks it on every reload.
 *
 * No exemptions. Both pages that hold a search do it properly now, and a list
 * of one invites a second.
 */

function pages(root = 'src/app'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...pages(path));
    else if (entry.name === 'page.tsx') found.push(path);
  }
  return found.sort();
}

describe('a filter that changes the rows changes the URL', () => {
  it('every locally-held search is seeded from the URL and written back', () => {
    const broken: string[] = [];

    for (const path of pages()) {
      const src = readFileSync(path, 'utf8');
      if (!src.includes('useTableQueryState')) continue;

      // A local state whose name says it holds a query the table is filtered by.
      const holdsSearch = /const \[(?:search|query)\s*,\s*set\w+\]\s*=\s*(?:React\.)?useState/.test(
        src,
      );
      if (!holdsSearch) continue;

      const seeded = /useState\((?:React\.)?\s*url\.get\('q'\)\)/.test(src);
      const writesBack = /url\.set\(\{\s*q:/.test(src);
      if (!seeded || !writesBack) {
        broken.push(
          `${path} — ${!seeded ? "not seeded from url.get('q')" : ''}${
            !seeded && !writesBack ? ' and ' : ''
          }${!writesBack ? 'never written back with url.set({ q ... })' : ''}`,
        );
      }
    }

    expect(
      broken,
      'These screens filter their rows by a search the address bar never learns about. ' +
        'A refresh keeps the tab and drops the search, and a shared link shows a ' +
        `different row set than the sender saw:\n${broken.map((b) => `  ${b}`).join('\n')}`,
    ).toEqual([]);
  });
});
