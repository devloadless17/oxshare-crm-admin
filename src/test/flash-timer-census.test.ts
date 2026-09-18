import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A TIMER ARMED IN A COMPONENT MUST BE CLEARED WHEN THAT COMPONENT GOES.
 *
 * `setTimeout(() => setSaved(false), 2000)` is the "Saved ✓" flash every
 * settings panel uses. Unguarded it is a state update on a component that may
 * already be unmounted — and in jsdom the environment is torn down by then, so
 * it does not warn, it THROWS: `ReferenceError: window is not defined`,
 * reported as an unhandled error against whichever test happened to be running.
 *
 * `rival-settings-panel.tsx` records what that cost the first time — "a red
 * gate with 965 passing tests and no failure to point at" — and was fixed with
 * a ref plus an unmount cleanup. The fix was applied THERE and to nothing else,
 * so four more components kept the defect: smtp-settings-panel,
 * admin-identity-panel, copyable-id and invite-admin-modal. The gate went red
 * again on exactly the same error, from a different file, months later.
 *
 * That is the argument for this test rather than for fixing five files. A fix
 * lives in one file; a rule lives in all of them, including the ones not
 * written yet.
 *
 * The rule: if a component arms a timer, the timer id is held (`flashTimer.current
 * = …` or a local `const timer = …` cleaned up in the same effect) and cleared.
 * A bare call whose handle is discarded cannot be cancelled by anyone.
 */

/*
 * COMPONENTS ONLY — `src/components` and `src/app`.
 *
 * The rule is about a timer outliving the React tree that armed it, so it does
 * not reach library code. `lib/api/export.ts` fires a 0ms
 * `setTimeout(() => URL.revokeObjectURL(url), 0)` to release a blob after the
 * download has started: no component, no state, nothing to leak into. Widening
 * the scan to catch it would mean either a false positive somebody silences or
 * an exemption list that grows until the rule means nothing.
 */
const ROOTS = ['components', 'app'].map((d) => join(__dirname, '..', d));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'test' ? [] : sources(full);
    return e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** `setTimeout(` / `window.setTimeout(` whose return value is thrown away. */
const DISCARDED_TIMER = /(^|[^.\w])(?:window\.)?setTimeout\s*\(/;

describe('a component never arms a timer it cannot cancel', () => {
  it('every setTimeout in a component keeps its handle', () => {
    const offenders: string[] = [];

    for (const file of ROOTS.flatMap(sources)) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (!DISCARDED_TIMER.test(line)) return;
        // Comments describe timers, they do not arm them. Without this the rule
        // fires on its own documentation, which is how a census gets disabled.
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        // Assigned to something (`x = setTimeout(`, `const t = setTimeout(`) —
        // the handle is kept, and cancelling it is then possible.
        if (/[=:]\s*(?:window\.)?setTimeout\s*\(/.test(line)) return;
        // `return setTimeout(...)` hands the handle to the caller.
        if (/return\s+(?:window\.)?setTimeout\s*\(/.test(line)) return;
        offenders.push(
          `${file.replace(join(__dirname, '..'), 'src')}:${i + 1}  ${code.slice(0, 80)}`,
        );
      });
    }

    expect(
      offenders,
      'A timer is armed and its handle discarded, so nothing can cancel it on unmount.\n' +
        'In jsdom the callback fires after teardown and throws `window is not defined`,\n' +
        'which is reported against an unrelated test — a red gate with nothing to point at.\n' +
        'Hold the id and clear it, as rival-settings-panel.tsx does:\n' +
        '  const flashTimer = React.useRef<number | null>(null);\n' +
        '  React.useEffect(() => () => {\n' +
        '    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);\n' +
        '  }, []);\n' +
        `Offenders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
