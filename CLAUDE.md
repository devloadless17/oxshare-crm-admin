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

### Mocking the API in a test

`src/lib/api/index.ts` exports `api` **both** as a named export and as the default,
and pages use whichever the author reached for. So a `vi.mock` must supply both:

```ts
vi.mock('@/lib/api', () => {
  const api = { get, post, admin: { getRoles } };
  return { api, default: api };
});
```

Mocking only `default` leaves the named `api` undefined. The page then throws on
first use, its own `catch` swallows the TypeError, and you get a generic "failed to
load" state — which reads as a broken query rather than a broken mock. That has cost
real time twice.

Two other traps worth knowing before writing a screen test:

- **Await something the query renders**, not a header control. Headers usually render
  during `loading`, so awaiting a header button asserts against an empty list.
- **`required` inputs mean native validation blocks submit**, so a page's own
  "please fill in everything" branch is unreachable through the UI. Assert "no
  request was made" rather than a specific message.

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

`npm test` → Vitest, 238 tests. `*.test.ts` / `*.test.tsx` colocated beside the code.
jsdom and testing-library **are** configured (`vitest.config.mts`, `vitest.setup.ts`), so a screen
can be rendered and asserted on — `admin-layout.test.tsx`, `login/page.test.tsx` and
`settings/page.test.tsx` are the patterns to copy. Render through `src/test/render.tsx`, which
supplies `QueryClientProvider` but deliberately **not** `AdminAuthProvider`: mock `useAdmin`
instead, so a test states the identity it is asserting about rather than inheriting one.

`src/proxy.test.ts` covers the route gate. Note it anchors the matcher (`^…$`) before testing
it — Next matches the whole pathname, and an unanchored check reports `/api/...` as gated when
the runtime excludes it.

**Every sidebar entry is a page that exists.** There is no "Soon" state any more — the
`comingSoon` flag, its disabled-item branch and the `nav.comingSoon*` strings are gone, and
`/trading-accounts` and `/payouts` were removed from both the nav and `ROUTE_REQUIREMENTS`
because neither had a `page.tsx`. This reverses the earlier rule that those links were
committed scope and must not be deleted: the navigation lists places an operator can go, not
a roadmap. When one of those pages is built, add the route back to `permissions.ts` and the
entry back to `NAV_SECTIONS` together — `canAccess` denies an unlisted path, so a page with
no route requirement renders the "no access" panel rather than itself.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
