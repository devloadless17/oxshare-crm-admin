import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // .tsx too: the previous glob was .test.ts only, so a component test could
    // be written, committed, and silently never run.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
