import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The logo has ONE size, owned by `components/brand-logo.tsx` (44px — the owner's call,
 * 29 Sep 2026). It had drifted to six heights because every call site chose its own, so a
 * call site that passes a height class to `<BrandLogo>` fails here.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

describe('the logo has one size', () => {
  it('no call site sets a height on <BrandLogo>', () => {
    const offenders = tsxFiles('src').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/<BrandLogo\b[^>]*>/g)]
        .filter((m) => /\b(h|size|min-h|max-h)-/.test(m[0]))
        .map((m) => `${file}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
