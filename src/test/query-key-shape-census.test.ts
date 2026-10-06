import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ONE cache key, ONE shape.
 *
 * React Query hands whatever is cached under a key to every reader of that key.
 * Two screens reading one key with DIFFERENT fetchers therefore receive each
 * other's data, depending only on which was opened first — and the second one
 * crashes or renders nonsense. That is how Network access failed in production
 * (6 Oct 2026): its admin picker read `keys.adminUsers.all()` as a list, while the
 * Admin users page caches `{ roles, adminUsers, fieldCatalog }` there, so the
 * picker called `.filter` on an object whenever Admin users had been visited first.
 *
 * Nothing in the type system sees it (each `useResource<T>` states its own T), so
 * this census reads every `useResource(keys.…(…), fetcher)` call and requires all
 * readers of one key factory to call the same API methods. A new reader with a
 * different fetcher needs its own key, under the same root if one invalidation
 * should refresh both.
 */

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

/** The text of the call's remaining arguments, up to the paren that closes `useResource(`. */
function restOfCall(source: string, openParen: number, from: number): string {
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

interface Reader {
  file: string;
  signature: string;
}

function readersByKey(): Map<string, Reader[]> {
  const byKey = new Map<string, Reader[]>();
  const call = /useResource(?:<[^>]*>)?\(\s*(keys\.[\w.]+)\([^)]*\)\s*,/g;
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(call)) {
      const openParen = source.indexOf('(', match.index);
      const fetcher = restOfCall(source, openParen, match.index + match[0].length)
        // `adminApi` is `api.admin` imported by its own name.
        .replace(/\badminApi\./g, 'api.admin.');
      const methods = [...new Set(fetcher.match(/\bapi\.[\w.]+(?=\()/g) ?? [])].sort();
      const signature = methods.length
        ? methods.join(' + ')
        : fetcher
            .replace(/\s+/g, ' ')
            .replace(/,\s*\{[^{}]*\}\s*,?\s*$/, '')
            .trim();
      const key = match[1] ?? '';
      const readers = byKey.get(key) ?? [];
      readers.push({ file: file.slice(SRC.length + 1), signature });
      byKey.set(key, readers);
    }
  }
  return byKey;
}

describe('query keys', () => {
  it('finds the readers it is meant to judge', () => {
    // A scanner that matched nothing would pass every assertion below.
    const total = [...readersByKey().values()].reduce((n, readers) => n + readers.length, 0);
    expect(total).toBeGreaterThan(50);
  });

  it('gives every key ONE fetcher, so readers never receive each other’s data', () => {
    const conflicts = [...readersByKey()]
      .filter(([, readers]) => new Set(readers.map((r) => r.signature)).size > 1)
      .map(
        ([key, readers]) =>
          `${key}:\n${readers.map((r) => `    ${r.file} → ${r.signature}`).join('\n')}`,
      );
    expect(
      conflicts,
      'These keys are read with different fetchers, so whichever screen loads first ' +
        'hands its data to the other. Give the odd reader its own key:\n' +
        conflicts.join('\n'),
    ).toEqual([]);
  });
});
