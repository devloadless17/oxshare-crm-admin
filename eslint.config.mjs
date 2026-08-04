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
/**
 * Screens whose user-visible text has been moved into `src/lib/i18n`.
 *
 * This list only ever GROWS. Converting a screen means adding it here in the
 * same commit, which is what makes the remaining work visible rather than
 * indefinite.
 */
const I18N_ENFORCED = [
  'src/components/layout/admin-layout.tsx',
  'src/app/login/page.tsx',
];

/**
 * Text that is not copy: punctuation, separators and symbols a translator would
 * leave untouched anyway.
 */
const ALLOWED_JSX_LITERALS = ['·', '—', '–', '/', '%', '+', '-', '×', ':', '*', '(', ')', '&'];

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
    // ── Money paths: no coercion at all ─────────────────────────────────────
    // PLATFORM-CONVENTIONS R-2.6 / R-2.5.5. The global rule above bans only
    // `parseFloat`; the backend additionally bans `Number()` inside
    // modules/{wallet,partners,payments} and the frontends did not, even though
    // `Number(balance)` is the *more* likely way to lose precision here — it is
    // what `.toFixed(2)` and `.toLocaleString()` want you to reach for.
    //
    // Scoped to the screens that actually render money rather than applied
    // globally, exactly as the backend scopes it to its money modules: a blanket
    // ban would fire on genuinely non-monetary conversions (a page number, a KYC
    // step index) and get disabled wholesale, which is how a rule stops working.
    //
    // Keep this list in step with the screens that display amounts.
    files: [
      'src/lib/money.ts',
      'src/app/withdrawals/**/*.tsx',
      'src/app/ledger/**/*.tsx',
      'src/app/commission-plans/**/*.tsx',
    ],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='Number']",
          message:
            'ARCHITECTURE §6.1: Number() on a monetary string silently truncates past 2^53. Use decimal.js via lib/money.ts (formatMoney, isZeroMoney).',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message: 'Never coerce a monetary string to a float — use decimal.js via lib/money.ts.',
        },
        {
          name: 'parseInt',
          message:
            'Suspicious on a money screen. If this is not money, use Number.parseInt with an explicit radix.',
        },
      ],
    },
  },

  {
    // ── Layering: the shared layers know nothing about the pages ────────────
    // PLATFORM-CONVENTIONS R-2.5.1. The backend enforces the same direction
    // (`store/`, `common/`, `config/`, `database/` may not import `modules/**`);
    // the frontends had no equivalent, so nothing stopped a generic helper or a
    // UI primitive from importing a page and quietly creating a cycle.
    //
    // Verified 0 violations when this landed — it is a ratchet on the current
    // state, not a migration.
    files: ['src/lib/**/*.ts', 'src/lib/**/*.tsx', 'src/components/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/app', '**/app/*'],
              message:
                'Dependencies point one way: pages may import from lib/ and components/ui/, never the reverse. If a page owns something these layers need, move it down into lib/.',
            },
          ],
        },
      ],
    },
  },

  {
    // ── File size, as a ratchet ─────────────────────────────────────────────
    // 400 code lines (comments and blanks excluded, so documenting a decision is
    // never penalised). An `error`, not a warning, because both frontends run at
    // --max-warnings 0 and a warning nobody can see is not a limit.
    //
    // The overrides below pin the four files that already exceed it at their
    // CURRENT size. They cannot grow, and new files must come in under 400. Lower
    // these numbers as the files are split; never raise one.
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Pinned at their current size — see the note above. Splitting these is
    // feature-driven work; kyc/[userId] in particular nearly doubled when the
    // DataTable rework landed and is the first that should come down.
    files: [
      // Escaped: minimatch reads [userId] as a character class, so the unescaped
      // form silently matched nothing and this file was held to 400.
      'src/app/kyc/\\[userId\\]/page.tsx',
      'src/app/kyc/builder/page.tsx',
      'src/app/commission-plans/page.tsx',
      'src/app/withdrawals/page.tsx',
    ],
    rules: {
      // Lowered from 950 after kyc/[userId] was split (973 -> 745 lines). This
      // number only ever goes DOWN: 720 leaves the largest of these files no room
      // to grow, and each split should be followed by lowering it again.
      'max-lines': ['error', { max: 720, skipBlankLines: true, skipComments: true }],
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

  {
    // ── i18n: no new hardcoded UI text ──────────────────────────────────────
    // docs/CLAUDE.md seam 4. The catalogue and t() exist; this is what stops the
    // next screen adding literals faster than they get externalised.
    //
    // Scoped to the screens ALREADY converted, and widened as more are done —
    // the same ratchet shape as max-lines. A blanket ban across an app that is
    // half converted produces hundreds of errors, gets disabled wholesale, and
    // then enforces nothing, which is how a rule stops working.
    //
    // It catches the two forms that actually carry copy: a bare string as a JSX
    // child, and a `placeholder` attribute. It deliberately does not chase every
    // possible string — aria-labels and titles are caught by review, and a rule
    // with too many false positives is one people learn to silence.
    files: I18N_ENFORCED,
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          allowedStrings: ALLOWED_JSX_LITERALS,
          ignoreProps: true,
        },
      ],
    },
  },
]);
