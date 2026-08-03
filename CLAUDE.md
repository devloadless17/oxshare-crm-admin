# oxshare-crm-admin

> Cross-repo context — doc authority, ports, auth cookies, the `/api` rewrite, the §6 money
> rules, and the quality-gate machinery — lives in `../CLAUDE.md`. This file is only what is
> specific to this repo. If the two disagree, `../CLAUDE.md` wins on facts about the system
> and this file wins on conventions inside this directory.

Next.js 16 admin app on **:3002**. Per-deliverable status is in `../docs/Phase1-Feature-Status.md`.

## Layout

```
src/app/<feature>/{layout,page}.tsx   one flat segment per feature, no route groups
src/components/                       async-boundary · backend-pending · data-table ·
                                      pagination · query-provider · theme-* ·
                                      layout/admin-layout · rbac/* · ui/* (shadcn)
src/context/AdminAuthContext.tsx      useAdmin()
src/hooks/                            use-resource · use-debounced · use-focus-trap · use-hydrated
src/lib/api/                          client · auth · admin · index · types.gen.ts
src/lib/                              permissions · kyc-doc-url · utils
src/proxy.ts                          route gate — Next 16's rename of middleware.ts
```

Files are **kebab-case**, except `src/context/*Context.tsx` (PascalCase, matching the portal).
Every page is `'use client'`.

**Never create `middleware.ts`** — it will not run. The gate is `src/proxy.ts`.

## Data fetching: one primitive

`src/hooks/use-resource.ts` wraps React Query's `useQuery` into a 4-state `Resource<T>`:

```
'loading' | 'ready' | 'unavailable' | 'error'
```

`unavailable` is a **404 = the endpoint is not built yet**, which is a to-do for the API owner,
not a failure. It is distinct from `error` on purpose.

Render the four states with `<AsyncBoundary status label endpoints onRetry errorMessage>`, which
shows a spinner, `<BackendPending endpoints={…}>`, a retry card, or the children.

**Never render mock or placeholder data.** A screen with no backend says so, by naming the
missing endpoints. That rule is why `partners` and `withdrawals` render `BackendPending` rather
than plausible rows.

Mutations use `useMutation` + `queryClient.invalidateQueries({ queryKey: [...] })`. Pass the
`AbortSignal` from `useResource` into the axios call so superseded requests cancel — that is what
makes the search boxes race-free. Filtering, sorting and paging are server-side via
`URLSearchParams`.

Async handlers on JSX attributes need an explicit `void`: `onClick={() => void save()}`,
`onSubmit={(e) => void submit(e)}`. React types those as returning `void`, and
`no-misused-promises` is an error here. `AsyncBoundary.onRetry` is typed `() => unknown`
precisely so `onRetry={query.refetch}` needs no wrapper.

## API types are generated, never hand-written

`npm run gen:api-types` (with the backend running) regenerates `src/lib/api/types.gen.ts` from
`http://localhost:3001/api/docs-json`. Types in `src/lib/api/admin.ts` are **aliases**:

```ts
export type Role = components['schemas']['RoleResponseDto'];
```

Hand-writing a response interface removes the only mechanism that turns backend drift into a
compile error (`docs/API-CONTRACTS.md` Part C). `npm run build` in CI is that gate.

Where an alias is impossible, say so in a comment naming the gap — several backend endpoints
still carry no `@ApiOkResponse`, so their request/response schemas generate as
`Record<string, never>` / `content?: never`. `src/lib/api/auth.ts` shows the pattern: alias the
generated part, hand-declare only what is undocumented, and mark it.

`types.gen.ts` is excluded from lint and prettier — it is regenerated wholesale.

## Money in the UI

Balances arrive as **strings** (`'250.00000000'`) and stay strings. `Number(balance)` and
`parseFloat(balance)` are lint errors on the API/money paths, because
`Number('12345678901234567.89')` is wrong before formatting even starts. `Intl.NumberFormat` is
out for the same reason — it takes a number.

## Forms

`useState` per field + an `async handleSubmit` + local `error`/`isLoading`. There is deliberately
**no form library and no zod**: server-side class-validator is the authoritative gate, and a
second client-side copy of every rule would drift from it. On a money system two sources of truth
for "is this a valid commission rate" is a downgrade.

Numeric form input goes through a parse helper rather than `Number(x) || fallback` — that idiom
silently turns a typo into `1` or `0` on forms that configure commission rates.

## Permissions

Nav and routes are gated client-side by `src/lib/permissions.ts` (`hasPermission(admin, key)`);
the API independently enforces per-permission 403s via `PermissionsGuard`. Client-side gating is
UX, not security — never rely on it alone.

`assertPermissionKeysExist` logs route keys missing from the backend catalog in dev. Keep the
route requirements in step with `config/permissions.json` in the backend.

## Twin files

These exist at the **same path** in `oxshare-crm-client` and are meant to stay identical:
`lib/api/client.ts`, `lib/api/errors.ts`, `hooks/use-resource.ts`,
`components/{query-provider,backend-pending,async-boundary}.tsx`, `components/ui/*`, `lib/utils.ts`.

Behaviour changes belong in **both**. Per-app values (cookie names, token lifetimes, redirect
paths, endpoint patterns) belong in the delimited `twin:config` block at the top of the file,
never inline.

`npm run check:twins` enforces this: it strips comments and the `twin:config` block and compares
the rest, so a reported difference is a real divergence. It is advisory and skips cleanly when the
sibling repo is not checked out, so CI never depends on a sibling directory.

`lib/api/client.ts` is a **near**-twin and excluded from that check: its exported names
(`clearAdminSession`, `refreshAdminToken`) and its token casing differ irreducibly from the
portal's. Diff it by hand.

## Tests

`npm test` → Vitest, 38 tests. `*.test.ts` / `*.test.tsx` colocated beside the code.
There is no jsdom or testing-library yet, so component tests need those added first.

Unbuilt sidebar entries (`/trading-accounts`, `/payouts`, `/commission-plans`, `/admin-users`)
render as disabled "Soon" items. They are committed scope — **don't delete the links**.
