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
  // Every `src/app/**` entry below used to name a PRE-route-group path
  // (`src/app/clients/page.tsx`) after the pages moved under `(console)/`, so
  // minimatch matched nothing and the rule had silently stopped running on all
  // of them — which is exactly where the hardcoded English crept back in.
  'src/components/layout/admin-layout.tsx',
  'src/components/layout/sidebar-nav.tsx',
  'src/app/(console)/partners/page.tsx',
  'src/components/partners/partner-columns.tsx',
  'src/components/partners/reassign-parent-from-list.tsx',
  'src/app/login/page.tsx',
  'src/app/(console)/transactions/page.tsx',
  'src/app/(console)/approvals/deposits/page.tsx',
  'src/components/deposits/deposit-receipt-cell.tsx',
  'src/components/deposits/deposit-reject-dialog.tsx',
  'src/app/(console)/ledger/page.tsx',
  'src/app/(console)/financial/page.tsx',
  'src/components/financial/transaction-badges.tsx',
  'src/components/financial/transaction-columns.tsx',
  'src/components/financial/transaction-filters.tsx',
  'src/components/financial/transaction-summary.tsx',
  'src/components/financial/date-range-filter.tsx',
  'src/app/(console)/audit-log/page.tsx',
  'src/components/kyc-review/approve-dialog.tsx',
  'src/components/kyc-review/reject-dialog.tsx',
  'src/components/cursor-pagination.tsx',
  'src/app/(console)/clients/page.tsx',
  'src/app/(console)/dashboard/page.tsx',
  'src/app/(console)/kyc/page.tsx',
  'src/app/(console)/settings/page.tsx',
  'src/app/(console)/kyc/builder/page.tsx',
  'src/app/(console)/commissions/page.tsx',
  'src/app/(console)/admin-users/page.tsx',
  'src/app/(console)/api-keys/page.tsx',
  'src/app/(console)/api-keys/new/page.tsx',
  'src/components/async-boundary.tsx',
  'src/components/backend-pending.tsx',
  'src/components/data-table.tsx',
  'src/components/pagination.tsx',
  'src/components/kyc-review/doc-viewer.tsx',
];

/*
 * NOT enforced, and why — so each gap is a decision rather than an oversight.
 *
 * These three use styled-jsx, and `jsx-no-literals` flags the CSS template
 * literal as a string child. Their COPY is externalised; adding them would mean
 * either suppressing the rule per file — which enforces nothing — or rewriting
 * each screen in Tailwind, which this change has no business doing:
 *
 *   src/app/invite/page.tsx
 *   src/app/invite/accept/page.tsx
 *   src/app/kyc/[userId]/page.tsx
 *
 * Convert a screen off styled-jsx, then move it into the list above.
 */

/**
 * Text that is not copy: punctuation, separators and symbols a translator would
 * leave untouched anyway.
 */
const ALLOWED_JSX_LITERALS = [
  '·',
  '—',
  '–',
  '/',
  '%',
  '+',
  '-',
  '×',
  ':',
  '*',
  '(',
  ')',
  '&',
  // Separators and required-field markers. Not copy: a translator has nothing
  // to do with them, and listing them keeps the rule usable on screens that are
  // otherwise fully converted.
  '•',
  '0',
];

/**
 * Query keys come from `src/lib/query-keys.ts`, never from an array literal.
 *
 * Spread into EVERY `no-restricted-syntax` block rather than living in one of
 * its own. ESLint's flat config merges rules by NAME, so the last config
 * object matching a file REPLACES that rule's options — a standalone block
 * silently disarmed the §6.1 `Number()` ban on the money files it overlapped,
 * and would have been disarmed in turn by the i18n block. Caught by putting a
 * `Number()` back into money.ts and finding lint quiet. Re-verify the same way
 * after touching this file.
 */
const QUERY_KEY_SELECTORS = [
  {
    selector: "Property[key.name='queryKey'] > ArrayExpression",
    message:
      'Query keys come from src/lib/query-keys.ts. An inline key silently drifts from the one the screen reads, and React Query reports nothing when it does.',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(invalidate|remove|cancel|refetch|reset)Queries$/] ArrayExpression',
    message:
      'Invalidate through src/lib/query-keys.ts. An invalidate against a key no query uses matches nothing and resolves successfully — the exact failure the registry exists to remove.',
  },
];

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
    /*
     * Playwright's own artefacts. Both are gitignored, but eslint does not read
     * .gitignore — so the HTML report's bundled CodeMirror ends up parsed as
     * project source and fails with "not found by the project service", which
     * turns a green run into a red gate for a file nobody wrote.
     */
    'playwright-report/**',
    'test-results/**',
    // Build tooling, not application code. These run under plain Node before
    // the app exists, so they are outside the TypeScript project the
    // type-checked rules need — linting them reports a parsing error rather
    // than anything about the code.
    'scripts/**',
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
    // ── Query keys come from the registry (the BROAD pass) ─────────────────
    // Deliberately placed BEFORE the money and i18n blocks: those match a
    // subset of these files and set `no-restricted-syntax` of their own, and
    // the LAST matching config object wins per rule name. They spread
    // QUERY_KEY_SELECTORS in for exactly that reason, so every file is covered
    // either by this block or by a more specific one that includes it.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/query-keys.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      // The generic primitive: it RECEIVES a key, it does not author one.
      'src/hooks/use-resource.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...QUERY_KEY_SELECTORS],
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
      // The `(console)` route group: these globs named the pre-group paths and
      // matched nothing, so the §6.1 ban covered lib/money.ts alone.
      'src/app/(console)/transactions/**/*.tsx',
      'src/app/(console)/ledger/**/*.tsx',
      'src/app/(console)/wallets/**/*.tsx',
      'src/app/(console)/commissions/**/*.tsx',
      'src/app/(console)/trading-accounts/**/*.tsx',
      'src/app/(console)/reconciliation/**/*.tsx',
      'src/app/(console)/financial/**/*.tsx',
      'src/components/financial/**/*.tsx',
    ],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...QUERY_KEY_SELECTORS,
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
      'max-lines': ['error', { max: 680, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Pinned at their current size — see the note above. Splitting these is
    // feature-driven work; kyc/[userId] in particular nearly doubled when the
    // DataTable rework landed and is the first that should come down.
    files: [
      // Escaped: minimatch reads [userId] as a character class, so the unescaped
      // form silently matched nothing and this file was held to 400. The
      // `(console)` segment needs no escaping — parentheses are literal in
      // minimatch — but every path here named the pre-group location and
      // pinned nothing until they were re-pointed.
      'src/app/(console)/kyc/\\[userId\\]/page.tsx',
      // (kyc/builder left this list on 26 Sep 2026 — split into
      // components/kyc-builder/*, it is ~280 code lines.)
      'src/app/(console)/commissions/page.tsx',
      'src/app/(console)/transactions/page.tsx',
    ],
    rules: {
      // 950 -> 720 when kyc/[userId] was first split (973 -> 745 lines), then
      // 720 -> 660 when its left-hand column moved to
      // components/kyc-review/submission-summary.tsx. This number only ever goes
      // DOWN: it is set to leave the largest of these files no room to grow, and
      // each split should be followed by lowering it again.
      'max-lines': ['error', { max: 660, skipBlankLines: true, skipComments: true }],
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
    // It catches the forms that actually carry copy: a bare string as a JSX
    // child, and the handful of ATTRIBUTES that render text to a user. It
    // deliberately does not chase every possible string — a rule with too many
    // false positives is one people learn to silence.
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
      // `ignoreProps: true` above is deliberate and NOT a gap: with it off,
      // `react/jsx-no-literals` flags every className, every type="submit" and
      // every href — hundreds of findings that carry no copy, which is exactly
      // how a rule gets switched off wholesale.
      //
      // But the comment above claimed this block caught `placeholder`, and it
      // did not: the two are mutually exclusive in that rule. So the props that
      // genuinely carry user-visible copy get their own check, which is narrow
      // enough to stay believable.
      // ESLint flat config REPLACES a rule rather than merging it, so this block
      // silently dropped the money-path Number() ban on every file it covers —
      // which is most of the screens that display a balance. The money selector
      // is repeated here so both rules apply. Change one, change the other.
      'no-restricted-syntax': [
        'error',
        ...QUERY_KEY_SELECTORS,
        {
          selector: "CallExpression[callee.name='Number']",
          message:
            'ARCHITECTURE §6.1: Number() on a monetary string silently truncates past 2^53. Use decimal.js via lib/money.ts (formatMoney, isZeroMoney).',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(placeholder|title|aria-label|alt)$/] > Literal[value=/[A-Za-z]{2}/]',
          message:
            "This attribute is user-visible copy. Use t('key') from lib/i18n so it can be translated (FSD §10, D-16).",
        },
        {
          selector:
            'JSXAttribute[name.name=/^(placeholder|title|aria-label|alt)$/] > JSXExpressionContainer > Literal[value=/[A-Za-z]{2}/]',
          message:
            "This attribute is user-visible copy. Use t('key') from lib/i18n so it can be translated (FSD §10, D-16).",
        },
      ],
    },
  },

  /**
   * THE SKIP CENSUS — a browser journey may not skip itself silently.
   *
   * A skipped Playwright test reports as PASSING in the summary. That is not a
   * theoretical hazard here: 26 bare `test.skip()` calls had accumulated across
   * eleven specs, `E2E_STRICT` could not see any of them, and the reasons they
   * gave were mostly WRONG — "no seeded client row", "this database already has
   * allowlist rules", "only one page of clients here". Four of the five that
   * actually fired were racing an unrendered locator or colliding with the
   * Next.js dev-tools button, not observing the data condition they named. They
   * had read as reasonable for months because nobody re-checks a plausible
   * sentence attached to a green test.
   *
   * So the guards go through a helper that the environment can escalate:
   *   `requirePrecondition(cond, why)` — a fixture that should be there. Skips
   *     locally, FAILS under `E2E_STRICT=1`, which CI sets.
   *   `requireRail(isLive)` — an optional external rail. Skips unless
   *     `E2E_RAIL=on` declares it should be live, and then fails.
   *
   * `test.skip()` with no condition (an unconditional skip at describe level)
   * is not matched — this targets the CALL form that decides at runtime, which
   * is the one that disappears from a summary.
   *
   * No other config block matches `e2e/**`, so this cannot be silently replaced
   * by a rules-merge the way the query-key selectors were. Re-verify that after
   * touching this file: put a bare `test.skip(true, 'x')` into any spec and
   * confirm lint goes red.
   */
  {
    files: ['e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='test'][callee.property.name='skip'][arguments.length>0]",
          message:
            'A bare test.skip() reports as PASSING. Use requirePrecondition(cond, why) for a fixture that should exist, or requireRail(isLive) for the optional payout rail — both in e2e/helpers.ts.',
        },
      ],
    },
  },
]);
