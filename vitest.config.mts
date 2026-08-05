import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // .tsx too: the previous glob was .test.ts only, so a component test could
    // be written, committed, and silently never run.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // jsdom, so a screen can actually be rendered and asserted on. Before this
    // there was no way to test a page at all, only pure functions.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
     * 20s, not vitest's default 5s.
     *
     * Every test in this suite that has ever timed out has been a `userEvent`
     * one — invite, kyc/builder, admin-users, audit-log, data-table — and none
     * of them assert anything time-sensitive. They are slow for a structural
     * reason: `userEvent.setup()` advances real timers between keystrokes, each
     * render goes through jsdom, and React Query settles on its own schedule. A
     * form fill that is 40ms of work on an idle machine is several seconds when
     * the box is also compiling another app or running a Testcontainers suite.
     *
     * 5s is not a deadline anybody chose for these tests; it is a default that
     * happens to sit just above their cost on a quiet machine and just below it
     * on a busy one. That produces a suite which is green locally and red in CI
     * for reasons unrelated to the code — and a flaky gate is one people learn
     * to re-run rather than read.
     *
     * Raising it costs nothing real: a test that genuinely hangs still fails,
     * 15 seconds later. It does NOT mask a slow application — nothing here
     * measures production performance.
     */
    testTimeout: 20_000,
    // Same reasoning for `beforeAll`/`afterAll`, which mount providers.
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Generated wholesale from the backend's OpenAPI document.
        'src/lib/api/types.gen.ts',
        '**/*.test.{ts,tsx}',
        // Layout shells and providers are wiring, not decisions; covering them
        // inflates the number without testing anything.
        'src/app/**/layout.tsx',
        'src/components/query-provider.tsx',
        'src/components/theme-provider.tsx',
      ],
      /*
       * A FLOOR pinned just under the current measured numbers — not a target.
       * An 80% threshold on a suite sitting near 20% gets disabled the first time
       * it blocks someone, and then it protects nothing at all.
       *
       * These may only ever go up. `npm run test:coverage` prints the figures.
       */
      // Raised again after the clients and audit-log screens gained tests. Measured
      // 2026-08-04: statements 47.1, branches 42.9, functions 38.4, lines 48.1.
      // Set a couple of points under.
      thresholds: {
        lines: 46,
        functions: 36,
        branches: 41,
        statements: 45,
      },
    },
  },
});
