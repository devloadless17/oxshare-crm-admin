// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Rule changes belong in both.
//
// Why this file grew past the create-next-app default:
//
// `eslint-config-next/typescript` is `tseslint.configs.recommended` — the
// NON-type-checked set — plus two rules downgraded to warn. That means
// no-floating-promises, no-misused-promises and await-thenable were all invisible
// here. The backend learned this the expensive way: with no ESLint config at all,
// a floating promise on an authorization check shipped to main (see the note atop
// oxshare-crm-backend/eslint.config.mjs). Nothing about that failure mode is
// backend-specific — an unawaited mutation on a withdrawal approval loses money
// just as quietly from a browser.
//
// So `recommendedTypeChecked` is spread AFTER the Next configs. `typescript-eslint`
// is declared in devDependencies rather than borrowed from eslint-config-next's
// transitive tree, so a future Next bump cannot silently take type-aware linting
// away again.
export default defineConfig([
  globalIgnores([
    // Defaults from eslint-config-next, restated because we override its ignores.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    // Generated from the backend's OpenAPI document by `npm run gen:api-types`.
    // Linting it would report on the generator's output, and any fix would be
    // erased by the next regeneration.
    'src/lib/api/types.gen.ts',
  ]),

  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── The rules that catch real defects, not style ────────────────────
      // An unawaited promise on a money mutation or a permission check is a
      // correctness bug that no amount of review reliably catches.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `any` on an API response defeats the whole point of generating types
      // from the backend's OpenAPI document.
      '@typescript-eslint/no-explicit-any': 'error',

      // Warn, not error: these fire on legitimate boundary code where a value
      // genuinely is unknown until it is narrowed (axios error bodies, JSON
      // from sessionStorage). Ratchet to error once the count reaches zero.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          // `const { passwordHash, ...safe } = user` is the idiomatic way to
          // strip a field; the binding is meant to be unused.
          ignoreRestSiblings: true,
        },
      ],

      // In a browser app console.error IS the log sink, so it stays. console.log
      // is what leaks tokens and balances into a shared devtools session.
      'no-console': ['error', { allow: ['error', 'warn'] }],

      // An empty catch is how the KYC config failure and the kyc-config payload
      // bug both stayed invisible.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'always'],

      // ── Money invariants (ARCHITECTURE §6.1) ───────────────────────────
      // Monetary values cross the API as strings and must stay strings.
      // `Number(balance)` / `parseFloat(amount)` silently truncates past 2^53.
      // Formatting and comparison go through lib/money.ts, which uses decimal.js.
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Never coerce a monetary string to a float — use decimal.js via lib/money.ts. For non-money input use Number.parseInt with a radix.',
        },
      ],
    },
  },

  {
    // Test files may use loose typing against fixtures.
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // Config files are not part of the app's tsconfig project graph, so
    // type-aware rules cannot resolve them.
    files: ['*.mjs', '*.mts', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
]);
