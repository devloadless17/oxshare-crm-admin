import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path/posix';

/**
 * NO SCREEN ASKS FOR, SHOWS OR SENDS A SORT ORDER (owner, 26 Sep 2026).
 *
 * Products, currencies, leverages, external links, agencies, commission types
 * and the deposit and withdrawal methods all had an "Order" field or column.
 * They are gone: the API puts a new row after the last one and leaves an edited
 * row where it is, so no request carries `sortOrder` either — sending the
 * stored value back would let a stale copy reorder the list.
 *
 * The column stays in the database and in the API's answers. This only keeps
 * it out of screen code, where a new form would be the easiest way back in.
 */
const ROOTS = ['src/app', 'src/components'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

/** Comments may talk about the old field; code may not use it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no sort order on any console screen', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('finds the screens it is checking', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no screen or form that reads or sends sortOrder', () => {
    const offenders = files.filter((file) =>
      /\bsortOrder\b/.test(withoutComments(readFileSync(file, 'utf8'))),
    );

    expect(offenders).toEqual([]);
  });
});
