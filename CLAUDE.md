# oxshare-crm-admin

> Cross-repo context — doc authority, ports, auth cookies, the `/api` rewrite, the §6 money
> rules, and the quality-gate machinery — lives in `../CLAUDE.md`. This file is only what is
> specific to this repo. If the two disagree, `../CLAUDE.md` wins on facts about the system
> and this file wins on conventions inside this directory.

Next.js 16 admin app on **:3002**. Per-deliverable status is in `../docs/Phase1-Feature-Status.md`.

## Layout

```
src/app/(console)/<feature>/page.tsx  the console pages live in the `(console)` route group
                                      (login, invite, reset-password sit outside it)
src/components/                       async-boundary · backend-pending · data-table ·
                                      pagination · query-provider · theme-* ·
                                      layout/admin-layout · rbac/* · ui/* (shadcn)
src/context/AdminAuthContext.tsx      useAdmin()
src/hooks/                            use-resource · use-debounced · use-focus-trap · use-hydrated
src/lib/api/                          client · auth · admin · index · types.gen.ts
src/lib/                              permissions · kyc-doc-url · utils · session-hint
src/proxy.ts                          route gate — Next 16's rename of middleware.ts
```

Files are **kebab-case**, except `src/context/*Context.tsx` (PascalCase, matching the portal).
Every page is `'use client'`.

**Never create `middleware.ts`** — it will not run. The gate is `src/proxy.ts`.

### The gate reads a MARKER, never the session

`src/proxy.ts` cannot see the session and the file says so at length: the refresh cookie is
`__Host-` prefixed and set by the API's host, so the browser locks it there. What it _can_ read
is `lib/session-hint.ts` — a non-sensitive cookie this app writes on its OWN host whenever
`/admin/auth/me` answers "signed in", and clears when it answers 401.

It exists for one bug: `app/page.tsx` was an unconditional `redirect('/login')`, so the URL every
operator types showed a sign-in form to somebody who was already signed in, held for a whole
round trip. That reads as having been logged out, and the response it invites is typing the
password again — which mints a second thirty-day session over the first.

**The marker decides what to PAINT, never who may ENTER.** Any visitor can write it in a console,
so it only moves people between the two public screens; a forged one buys a redirect to
/dashboard that `/admin/auth/me` reverses. Access is still decided by that endpoint and by the
API, which verify a signature. Building a real gate on it would be the exact failure `proxy.ts`
was stripped down to remove.

Redirecting off `/login` uses `AUTH_ONLY_PATHS`, **not** `PUBLIC_PATHS`, and that is why
`public-paths.ts` now keeps two lists: `/invite/accept` and `/reset-password` must work WITH a
session. The person following an invitation may be signed in as somebody else on that machine,
and recovery runs from the device still holding a stale cookie (D-44) — redirecting either to
the dashboard makes the emailed link useless with no way back but clearing cookies by hand.

A stale marker cannot loop, and the line that guarantees it is `clearSessionHint()` inside
`clearAdminSession`: it runs in the axios interceptor, before React Query settles and long before
any navigation, so the 401 eviction reaches `/login` with the marker already gone.

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

## Query keys come from the registry — `src/lib/query-keys.ts`

Every `queryKey` and every `invalidateQueries` resolves through it. Lint refuses an array
literal in either position, and `queryKeysFor`/`resourceKeysFor` return the registry's own
union type, so an invented key is a compile error.

**Why it is enforced rather than encouraged.** React Query's prefix matching fails SILENTLY:
an invalidate against a key no query uses matches nothing, resolves successfully, and
refetches nothing. No error, no warning, nothing in the network tab. That produced five
production-visible staleness bugs at once — a KYC approval leaving the sidebar badge reading
1 (reported by the owner), a client suspended from their profile still listed as Active, and
three realtime events refreshing keys that named nothing at all.

Two rules the registry encodes:

1. **A badge shares a root with the list it counts**, so one invalidate covers both. Their
   living under different roots (`['kyc',…]` vs `['admin','kyc','pending-count']`) _was_ the
   reported bug.
2. **One resource, one root.** The old code mixed `['admin', X]` and bare `['X']`, and every
   bug above was a pair that landed on opposite sides of that line.

Keys are internal cache addresses — never persisted, never in a URL — so renaming one is free.

⚠️ **The lint rule is spread into every `no-restricted-syntax` block, not given one of its
own.** Flat config merges rules by NAME, so the last matching config object replaces that
rule's options: a standalone block silently disarmed the §6.1 `Number()` ban on the money
files it overlapped. After touching `eslint.config.mjs`, re-verify by putting a `Number()`
back into `money.ts` and confirming lint complains.

## Realtime: three events, and what must NOT be live

The socket (`hooks/use-realtime.ts`, a twin) carries three events into
`components/notifications/notification-bell.tsx`:

| event                  | means                                               | maps through                |
| ---------------------- | --------------------------------------------------- | --------------------------- |
| `notification.created` | a client did something that needs handling (a TASK) | `queryKeysFor(kind)`        |
| `notification.changed` | one of YOUR tasks was seen elsewhere or HANDLED     | `keys.notifications.all()`  |
| `resource.changed`     | another OPERATOR decided something                  | `resourceKeysFor(resource)` |

`notification.changed` is what makes a handled task leave every inbox: the backend resolves it
by trigger the moment anybody approves or rejects the item (backend 0140, D-78) and tells the
rooms of exactly the admins who held it. It carries no data; the bell re-reads through the
scoped endpoint.

`resource.changed` has no bell, no chime and no toast, deliberately: a notification row per
reviewer per decision fills every bell with "somebody else approved a document for a client you
cannot see", which is how a bell stops being read. It carries a resource NAME and nothing else,
which is why fan-out is not permission-scoped — see the backend's `common/realtime/resource-changed.ts`.

A missed `resource.changed` leaves NO trace (no row, no badge), so the reconnect effect
re-syncs every `BROADCAST_RESOURCES` entry. Do not narrow that back to the bell.

### The notification centre (`components/notifications/`)

An admin notification is a TASK — "you must handle something" — and the files are cut by that:
`catalogue.ts` (task-phrased copy, the deep link that opens the task's record, outcome
labels; keyed by the backend's enum, so a new kind is a compile error), `notification-bell.tsx`
(badge = inbox count, the socket), `notification-center.tsx` (Inbox / History and nothing else —
**no category chips or status filters, on the owner's call**: a handful of tasks is read, not sorted
through, and what a task IS is on the row already; the full page keeps one search, in History),
`notification-feed.tsx` (shared by the sheet and `/notifications`: day groups, load more),
`notification-item.tsx`, `realtime-keys.ts`.
Opening the panel marks nothing. Opening a task marks it SEEN (it un-bolds, the dot goes) and it
stays in the Inbox, and on the badge, until anybody handles it; History holds only handled tasks
(the owner's rule, 5 Oct 2026, backend 0189). There is no clear, mark-all or mark-unread control,
on purpose: each took a task out of the Inbox unhandled, which is what the buyer reported.
The one control a row may carry is a DECISION its kind declares for leaving the item as it is
(`close` in `catalogue.ts`; only the clawback's "Keep commission", via `close-task-dialog.tsx`, a
reason required) — an answer that ends the task for everyone, never a dismiss. A handled task is
never drawn as new: the dot and tint belong to waiting tasks nobody here has opened.
**Many arrivals are ONE announcement**: the transfer scheduler announces every transfer that stuck while the bridge was down in one pass, so the bell gathers arrivals within
400 ms — one refetch, one chime (never closer than 3 s), one toast (the task when alone, "N new tasks
need your action" under one toast id when not), and no toast while the panel is open.

Three things outside the folder make that true, and each is easy to break without noticing:

- **Every record has a detail panel, and a task's link opens it** (`?open=<record id>`, 30 Sep
  2026). The world-class rule: a notification is just a link to the record's detail view. So a task
  link, a click on a row and a pasted URL all open `components/record-sheet.tsx` over the desk's
  normal, unfiltered queue, with the open row marked (`DataTable`'s `onRowClick` / `activeRowKey`).
  It is BUILT from what the desk already defines: the body is the desk's own `columns` (label and
  cell; the actions column is left out), the footer is the desk's own actions as real buttons — each
  desk keeps ONE `actionsFor(row)` list that feeds both its row menu and the panel — so the panel
  cannot lack a field or an action the table has. `status`, `callout` (a refusal reason, a provider
  note, why it needs attention), `omit` and `extraFields` (what has no room in a cell) shape the
  rest. Integrity: it shows ONLY the record the URL names (the cache's previous one would put a live
  Approve on the wrong record), a missing / out-of-territory / malformed id reads "not available",
  and the record's task is marked seen once the record is on screen. The data is the desk's own list
  endpoint asked for one `id` (backend: every desk list takes `?id=`, scoped and masked like any
  filter). **Never deep-link by typing into a search box** (`?q=<client>`): it filtered by client,
  read as the reader's own search and outlived the visit — the reported defect, retired on every
  desk and on Financial's "Open in desk". A new desk a task links to needs `useOpenedRecord`, an
  `actionsFor`, and `<RecordSheet>`. KYC keeps its own page (`/kyc/<portalId>`).
- **Looking at the item marks its task seen** (never removes it). The KYC review calls
  `useMarkSubjectRead('kyc', id)` once the submission has LOADED — never on a 403/404 — with the response's id (the client's Portal
  ID, their only identifier since backend 0159), not the URL's, which may carry `#` or spaces.
- **An attention task has a finish line**: `components/financial/resolve-attention-dialog.tsx`
  ("Mark resolved", a note of 10–500 characters, the DTO's bounds), opened from the Financial row
  menu (key by direction: `deposits.approve` / `withdrawals.settle`) and the withdrawal desk.
  Never on the desk's retryable case (`isRetryableSubmission`): clearing that flag would hide an
  approved payout that was never sent. The deposit task opens its payment on Financial
  (`?open=`); the `attention=true` filter lists every flagged one.

**Deliberately not live**, and covered by tests that assert it stays that way:

- **The audit log.** A forensic record read deliberately and paginated; refetching it under
  its reader moves the rows they are reading.
- **Settings, roles and any open form.** Realtime targets lists and counts; detail keys are
  invalidated by their own mutation only.
- **Money is refetched, never patched.** No `setQueryData` computing a balance — §6.1 bans
  client-side money arithmetic, and an optimistic balance is a plausible invented number.

## Payments: the console of the backend's payments CORE (0173, 30 Sep 2026)

The backend decides every provider's money once (`modules/payments/core/`). Here is its
provider-neutral console:

- **Withdrawal desk** (`components/transactions/withdrawal-payout.tsx`, Rival's `withdrawal-rival.tsx`
  before). It reads the NEUTRAL fields (`providerPayoutId`, `providerSubmittedAt`,
  `needsAttention`, `attentionReason`), never `rival*`, which stay populated for one release only.
  - **Resend** (`provider-submit`) only on `isRetryableSubmission`.
  - Each open row carries a `payoutPlan`:
    - `provider`: the approve dialog shows the quote ("sends 102.00: 100.00 to the client, 2.00 fee
      paid by the company").
    - `paused`: the reason is shown up front, never a confirm that can only fail.
    - `desk`: approval pays in one step.
- **Flagged hosted deposits** (`financial/resolve-attention-dialog.tsx`). An open one with a
  `providerPaymentId` offers _Credit what arrived_ (`deposits.approve`) and _Close without credit_
  (`deposits.reject`), beside _Mark resolved_, which moves no money. `finish-deposit`, a reason
  required.
- **Channel switches** (`payment-providers/channel-switch.tsx`, on the provider page): a network
  on or off per direction.
  - Switching off states the consequence and requires a reason.
  - Methods show `channel_off`.
  - The desk shows Paused, with the reason.
- The notification catalogue has the neutral payout kinds (`withdrawal.payout_*`) and the 0173
  deposit reasons (`wrong_asset`, `over_limit`, `unconfirmed_funds`). Rival's old kinds stay for the
  rows already raised.

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

`npm test` → Vitest, 889 tests. `*.test.ts` / `*.test.tsx` colocated beside the code.
jsdom and testing-library **are** configured (`vitest.config.mts`, `vitest.setup.ts`), so a screen
can be rendered and asserted on — `admin-layout.test.tsx`, `login/page.test.tsx` and
`settings/page.test.tsx` are the patterns to copy. Render through `src/test/render.tsx`, which
supplies `QueryClientProvider` but deliberately **not** `AdminAuthProvider`: mock `useAdmin`
instead, so a test states the identity it is asserting about rather than inheriting one.

`src/proxy.test.ts` covers the route gate. Note it anchors the matcher (`^…$`) before testing
it — Next matches the whole pathname, and an unanchored check reports `/api/...` as gated when
the runtime excludes it.

**Every sidebar entry is a page that exists.** There is no "Soon" state any more — the
`comingSoon` flag, its disabled-item branch and the `nav.comingSoon*` strings are gone. The
navigation lists places an operator can go, not a roadmap. A new page gets its route in
`permissions.ts` and its leaf in `NAV` **together** — `canAccess` denies an unlisted path, so a
page with no route requirement renders the "no access" panel rather than itself.

## KYC: the builder and the review (26 Sep 2026)

The rules are in `../CLAUDE.md` ("The identity core is the PLATFORM's"). Here they are SHAPES the
screens take, so nothing on them can do what the server refuses:

- **Builder** (`app/(console)/kyc/builder/page.tsx` + `components/kyc-builder/`). Since Phase 2
  (29 Sep 2026, the owner's "everything customizable") the whole form is the broker's to arrange:
  - An identity detail on Personal Information is an `IdentityRow` (`identity-block.tsx`). It can be
    placed anywhere in the step's list, made required or optional, or taken off ("Stop asking for …").
    It is asked for again from "Ask for an identity detail…", whose list comes from
    `GET /admin/kyc-config/identity-catalogue`. It has no label or type to edit, so re-adding First
    Name gives back the client's name, never a lookalike box.
  - Every built-in step can be retitled, moved and switched off, never deleted. Identity Document,
    Proof of Address and Selfie each have a Required box (`evidenceRequired`); unticked, the client
    may skip that step.
  - Questions of every type, uploads included, go on any step. "Move to…" sends one to another step,
    and the answers clients already gave follow it.
  - The document steps keep `document-checklist.tsx`; the last ticked document cannot be unticked.
  - Every save sends `format: 2` and the `If-Match` of the version the draft was STARTED from
    (`draftVersion`). Sending the latest refetch's version instead would overwrite a colleague's save
    without a word. A 409 `KYC_CONFIG_STALE` or `KYC_BUILDER_OUTDATED` shows the Reload banner and
    never retries. `builder-save.ts` turns a refusal's `steps.i.fields.j` keys into the step and field
    they name, so each sentence appears under its field.
- **Review** (`app/(console)/kyc/[userId]/page.tsx` + `components/kyc-review/`). It renders the SERVER's
  `layout` through `review-sections.ts` and never reads the builder config. Dates of birth are UTC-safe
  (`formatCalendarDate`). Documents are named by the one on file, never a guessed passport. The reject
  and re-verification dialogs offer the same `reviewFieldGroups`, and only pages that exist.
  The selfie has its own heading in the summary. While a submission is `rejected`, every item the
  reviewer returned reads **Returned** in red: an answer, a document page (`doc_back`), the selfie and
  a broker's upload, in the summary AND on its tile (`reviewDocumentGroups` sets `returned`). Until
  28 Sep 2026 only answers turned red, and a returned passport or bill still said "Uploaded".
- **An approved submission** offers _Correct details_ (`correct-identity-dialog.tsx`: every identity field
  but the phone, pre-filled, sends only what changed, a reason required, each refusal under its field)
  and _Request re-verification_ (`reverify-dialog.tsx`: items, a reason, and the plain money-pause
  line). **A reason may be any length, just not blank** — the server trims it and refuses only an
  empty one. Both dialogs demanded ten characters until 28 Sep 2026, and a reviewer had to pad
  "Expired" before the button worked, with nothing on screen saying why.
- E2E: `kyc-builder.spec.ts` (the reported scenario, crafted saves, the outdated-builder and stale
  409s, built-in steps switched off, any step moved) and
  `kyc-correct-and-reverify.spec.ts` (both actions, through to the money gate and the inbox). Never
  delete a step a spec did not create — see the warning at the top of `kyc-builder.spec.ts`.

## The sidebar: main items with sub-items (25 Sep 2026)

The owner asked for his old CRM's shape: a short list of MAIN items that each open onto their
pages. Dashboard sits alone on top; then **Clients · Introducing brokers · Finance · Trading ·
System · Security**. Three files in `components/layout/`, and the layout only places them:

| file                | owns                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation.ts`     | the tree (`NAV`) and the pure rules over it: `activeNavHref` (longest match, over the WHOLE tree), `visibleNav(admin)` (the one permission filter — the command palette reads it too), `groupBadgeTotal` |
| `sidebar-nav.tsx`   | drawing it: groups that open, the collapsed rail's per-group menus                                                                                                                                       |
| `use-nav-badges.ts` | the four queue counts, keyed by the href that opens each queue                                                                                                                                           |

Rules the code relies on:

- **One group open at a time, and it follows the page.** The open group is DERIVED — the group
  holding the page the menu shows, unless the operator opened another — never synced in an
  effect, so any arrival (link, Ctrl-K, notification, back button) paints it right first time.
  Opening another is a choice about THIS page: any navigation clears it (a choice remembered
  against a path came back two pages later — reported).
- **The menu shows where a click is GOING** (`MenuPosition` in `sidebar-nav.tsx`). `pathname`
  changes only when the page lands; waiting for it, the menu fell back to the page being LEFT
  for the whole load — the group you clicked in folded and reopened, the old item flashed
  (reported: "not solid"). Recorded from `next/link`'s `onNavigate`, never `onClick`, so a
  new-tab click changes nothing; a page from a click the next one overtook doesn't flick it
  back. Unit tests mock `next/link` with `src/test/next-link.tsx` — the real one only calls
  `onNavigate` inside a mounted router. jsdom cannot see a flicker at all: it was proven gone
  live, with a MutationObserver logging every state of `aside nav` while `rsc: 1` requests
  were held 1.5 s (one state per navigation, reached before the old page left).
- **A main item is two controls** (the owner's call, 25 Sep 2026): its NAME links to the
  section's main page — its first page this admin can open, so `NAV` order matters (Finance
  starts with All transactions, Security with the Audit log, both on his pick) — and the
  ARROW (a button, `aria-expanded`, named "<Group> pages") only opens or closes the list —
  and a closed group's waiting count rides on the arrow, the control that shows WHERE the
  work is ("Finance pages, 5 waiting"), never on the name.
  One click to each section's front door, without the detour a navigate-only header would
  force on the daily queues that sit second (KYC review, Withdrawals). Only the page's link
  carries `aria-current` (`console-pages.spec.ts` counts exactly one inside the nav).
- **ONE selected row** (`data-selected`), in ONE look (`bg-primary/10`, semibold, brand icon):
  the main item opened on this page, else the one holding the page, else Dashboard. It used
  to follow the page alone — opening System left Dashboard filled ("the old item keeps
  showing as active") — and Dashboard was a SOLID fill unlike every other selection (both
  reported). The current sub-page is MARKED (brand text), not filled; hover is neutral
  (`bg-muted`), because a brand-tinted hover read as a second selection. The page keeps
  `aria-current` whatever is selected. The portal shares the rule (`useNavSelection`).
- **Closed panels are `inert` AND `invisible`.** Playwright's role engine ignores `inert`, so
  without `visibility: hidden` a folded link still answers `getByRole` and wins `.first()`.
  E2E that clicks a sidebar page goes through `openNavItem(page, group, link)` in
  `e2e/helpers.ts`.
- **"Approvals" is gone as a section**: each queue lives with its subject (KYC under Clients,
  applications under Introducing brokers, both desks under Finance), and a CLOSED group shows
  the sum of its visible children's counts so waiting work is still visible at a glance.
- **Exactly one `<nav>` on the page** — specs count it; no breadcrumb `<nav>`.
- `navigation.test.ts` derives every console page from the file system and fails on a leaf
  with no `page.tsx`, a leaf a full-permission admin cannot open, or a page with no way in
  from the sidebar (`OFF_NAV` holds the one deliberate exception, `/profile`).
- **The brand row is the logo's.** Wordmark `h-10` (40px — the owner's pick, matching the
  portal's KYC header) in the 64px header, its rule aligned with the page header's; the
  collapse control is the round button on the sidebar's EDGE in both states. The portal's
  sidebar has the same brand area — keep the two identical. (Tried and rejected by the owner:
  a 200px full-width logo, too big; 48px, bigger than he wanted.)
- **The phone drawer is a modal**: named open/close buttons (`nav.openMenu`/`nav.closeMenu`),
  `role="dialog"` while open, `useFocusTrap` (focus in, Tab cycles, Escape closes, focus
  returns). Shut, it is `max-lg:invisible` — translated away its links were still tabbable.
- ⚠️ **Tailwind v4 moves elements with the `translate` PROPERTY**, not `transform`: a
  transition list naming `transform` animates nothing (the drawer used to snap). And
  `visibility` is transitioned on the way OUT only — transitioned both ways, the drawer is
  still hidden on the frame it opens and the trap's first `focus()` is refused.
- **The rail is a per-browser preference** (localStorage `oxshare-admin-sidebar`, every access
  guarded) and never applies inside the drawer (`rail = collapsed && !mobileOpen`).
- **RTL mirrors the shell**: logical sides (`start-0`, `border-e`, `ps-*`, `-end-3`), and the
  rail's Radix menus take `dir` + `side` from the document — Radix defaults to `ltr`.
- `e2e/sidebar-navigation.spec.ts` drives all of the above in a real browser; jsdom applies no
  CSS, so the unit tests cannot see visibility, the tab order or the mirrored layout.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
