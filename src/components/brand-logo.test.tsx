import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BrandLogo } from './brand-logo';

/**
 * The logo is drawn inline, in the brand's own colours, and nothing loads it
 * as a file any more.
 *
 * A client's Android phone in dark mode showed no logo while an iPhone showed
 * it. None of the causes reproduced in Chrome's engine — light, real dark,
 * forced dark, any phone width — so the fix removed every candidate: no file
 * request, no image for a dark-mode classifier, no second copy swapped by CSS.
 * These cases keep it that way.
 */
describe('BrandLogo', () => {
  it('draws the mark in the brand orange from LOGOS/, not the old #FF6600', () => {
    const { container } = render(<BrandLogo />);
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toContain('#F26722');
    expect(fills).not.toContain('#FF6600');
  });

  it('draws the word in currentColor, so dark mode is a colour and not a second file', () => {
    const { container } = render(<BrandLogo />);
    const word = [...container.querySelectorAll('path')].filter(
      (p) => p.getAttribute('fill') === 'currentColor',
    );
    expect(word.length, 'the wordmark lost its letters').toBe(5);
  });

  it('the mark variant has no word at all', () => {
    const { container } = render(<BrandLogo variant="mark" />);
    expect(container.querySelectorAll('path[fill="currentColor"]')).toHaveLength(0);
  });

  it('declares its own size, so no engine has to infer one', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg')!;
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('is named when given a title, and hidden from assistive tech when not', () => {
    const named = render(<BrandLogo title="OXShare" />).container.querySelector('svg')!;
    expect(named.getAttribute('role')).toBe('img');
    expect(named.getAttribute('aria-label')).toBe('OXShare');

    const decorative = render(<BrandLogo />).container.querySelector('svg')!;
    expect(decorative.getAttribute('aria-hidden')).toBe('true');
  });

  it('`onDark` keeps the word white in BOTH themes, for a surface dark in both', () => {
    const svg = render(<BrandLogo tone="onDark" />).container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('text-white');
    expect(svg.getAttribute('class')).not.toContain('dark:');
  });
});

describe('no screen loads the logo as an image file', () => {
  /*
   * The guarantee the fix rests on. If anyone reintroduces
   * `<img src="/oxshare-logo…">`, the dark-mode failure it removed can come
   * back with it — so the app's own source is searched for one.
   */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
    });
  }

  it('finds no <img> or <Image> pointing at a logo file', () => {
    const offenders = sourceFiles(join(process.cwd(), 'src')).filter((file) =>
      /src=["{`']?\/oxshare-(logo|mark)/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders, 'a screen loads the logo as a file again').toEqual([]);
  });
});
