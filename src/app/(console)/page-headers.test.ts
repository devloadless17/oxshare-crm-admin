import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY PAGE HEADER KEEPS ITS ACTIONS ON THE RIGHT (owner, 29 Sep 2026).
 *
 * The title and description sit on the left and take the space left over,
 * wrapping their own text; the buttons (Export, New …) stay on the right. Only
 * on a small screen do the buttons go under the title.
 *
 * The bug this pins: a header row of `flex flex-wrap justify-between` whose
 * title block had no width limit — a long description took the whole row and
 * pushed the buttons onto a line of their own on every screen size.
 *
 * Read from the files, like `navigation.test.ts`: a header is markup, and jsdom
 * applies no CSS, so a rendered test could not see the layout anyway.
 */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return pages(path);
    return entry === 'page.tsx' ? [path] : [];
  });
}

const CONSOLE = join(__dirname);

describe('console page headers', () => {
  const headers = pages(CONSOLE).flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const at = lines.findIndex((line) => line.includes('<h1'));
    if (at < 2) return [];
    const row = /className="([^"]*)"/.exec(lines[at - 2] ?? '')?.[1] ?? '';
    const title = /className="([^"]*)"/.exec(lines[at - 1] ?? '')?.[1] ?? '';
    const holdsActions = /\bjustify-between\b/.test(row);
    return holdsActions ? [{ file: file.replace(CONSOLE, ''), row, title }] : [];
  });

  it('finds the headers it is checking', () => {
    expect(headers.length).toBeGreaterThan(15);
  });

  it.each(headers.map((h) => [h.file, h] as const))(
    '%s keeps its buttons on the right of the title',
    (_file, header) => {
      expect(header.row).not.toMatch(/\bflex-wrap\b/);
      expect(header.row).toMatch(/\bsm:flex-row\b/);
      expect(header.title).toMatch(/\bmin-w-0\b/);
      expect(header.title).toMatch(/\bflex-1\b/);
    },
  );
});
