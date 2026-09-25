// Topology FIRST: it sets the E2E_* / NEXT_PUBLIC_* defaults the constants
// below read at import time. See topology.ts.
import './topology';
import {
  expect,
  request as apiRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Response,
  type Route,
} from '@playwright/test';

/**
 * ── Where things are ────────────────────────────────────────────────────────
 *
 * The browser calls the API DIRECTLY at `NEXT_PUBLIC_API_BASE_URL` (+ `/v1`);
 * the same-origin `/api/*` rewrite is history for browser traffic. Every spec
 * that intercepts or awaits API traffic must therefore match on the versioned
 * PATH and never on a host or an `/api/` prefix — three `page.route('**​/api/…')`
 * calls in this suite matched nothing for weeks, so the 500 and 401 they were
 * injecting never happened and the tests passed for the wrong reason.
 *
 * Two origins are kept apart on purpose:
 *  - `API_ORIGIN` is what the BROWSER dials. In cross-host mode this is
 *    `http://api.crm.localhost:3001`, a name only Chromium resolves.
 *  - `API_NODE_BASE` is what NODE dials (`context.request`, setup probes).
 *    Node does not resolve `*.localhost`, so it keeps `localhost`.
 */
export const APP_ORIGIN = (process.env.E2E_BASE_URL ?? 'http://localhost:3002').replace(/\/+$/, '');
export const API_ORIGIN = (
  process.env.E2E_API_ORIGIN ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:3001'
).replace(/\/+$/, '');
/** What the browser dials. */
export const API_BASE = `${API_ORIGIN}/v1`;
/** The PORTAL's origin, for specs that open the other app beside this one. */
export const TOPOLOGY_PORTAL_ORIGIN = (
  process.env.E2E_PORTAL_ORIGIN ?? 'http://localhost:3000'
).replace(/\/+$/, '');
/** What Node dials. */
export const API_NODE_BASE = `${(process.env.E2E_API_NODE_ORIGIN ?? 'http://localhost:3001').replace(/\/+$/, '')}/v1`;

/**
 * A `page.route` / `waitForResponse` matcher for one API path.
 *
 * A PREDICATE on the URL's pathname rather than a glob, so it is blind to the
 * host (localhost vs. `api.crm.localhost`) and to the query string. `path` is
 * the un-versioned route (`/admin/auth/me`); a RegExp is matched against the
 * pathname as-is.
 */
export function apiRoute(path: string | RegExp): (url: URL) => boolean {
  return (url) =>
    typeof path === 'string' ? url.pathname === `/v1${path}` : path.test(url.pathname);
}

/** Is this response the API answering `path` (optionally with `method`)? */
export function isApi(res: Response, path: string | RegExp, method?: string): boolean {
  if (!apiRoute(path)(new URL(res.url()))) return false;
  return method === undefined || res.request().method() === method.toUpperCase();
}

/**
 * `page.route` that COUNTS.
 *
 * Every test that injects a failure must assert `hits() > 0` afterwards. A
 * handler that never fires leaves the app talking to the real API, and the
 * assertion that follows then passes against a healthy response — which is
 * precisely how three tests in this suite went vacuous.
 */
export async function routeHit(
  page: Page,
  path: string | RegExp,
  handler: (route: Route) => Promise<void> | void,
): Promise<{ hits: () => number }> {
  let count = 0;
  await page.route(apiRoute(path), async (route) => {
    count += 1;
    await handler(route);
  });
  return { hits: () => count };
}

/**
 * The anti-forgery token of a signed-in context.
 *
 * Read through Playwright's jar, which sees every host's cookies, and NOT
 * through `document.cookie` — the CSRF cookie is set by the API's host and is
 * invisible to the app's own origin wherever the two differ.
 */
export async function csrfOf(context: BrowserContext): Promise<string> {
  const csrf = (await context.cookies()).find((c) => c.name.includes('admin_csrf'))?.value;
  expect(csrf, 'no CSRF cookie in the saved session — is it signed in?').toBeTruthy();
  return csrf!;
}

/** Remove every cookie whose name matches, keeping the rest of the jar. */
export async function deleteCookie(context: BrowserContext, name: RegExp): Promise<void> {
  /*
   * Playwright's own per-name filter, NOT read-all / clear-all / re-add.
   *
   * The round-trip version dropped the whole jar and rebuilt it from what
   * `cookies()` returned, so every surviving cookie — including the refresh
   * token and each app's session-hint — had to survive a serialise-and-restore
   * it does not otherwise go through. `clearCookies({ name })` removes exactly
   * the match and leaves the rest untouched in the browser.
   *
   * ⚠️ This is a tidier primitive, NOT a fix for anything. It was changed while
   * chasing the ~50% failure rate of `session-matrix.spec.ts`'s reuse-detection
   * case, on the theory that the rebuild was losing the session-hint. MEASURED
   * AFTERWARDS: 2 of 4 repeats still failed, exactly as before. The theory was
   * wrong and the flake is elsewhere — do not read this comment as evidence
   * that the cookie handling was the cause.
   */
  await context.clearCookies({ name });
}

/**
 * An API session for a browser context — the headers a page would send, by hand.
 *
 * `context.request` carries the cookie jar but not the `Origin` the API checks on
 * every state change, nor the `X-OxShare-CSRF` echo. Without both a write is a
 * 403 that reads like a permissions problem.
 */
export async function adminApi(context: BrowserContext): Promise<{
  get: (path: string) => ReturnType<APIRequestContext['get']>;
  post: (path: string, data?: unknown) => ReturnType<APIRequestContext['post']>;
  patch: (path: string, data?: unknown) => ReturnType<APIRequestContext['patch']>;
  put: (path: string, data?: unknown) => ReturnType<APIRequestContext['put']>;
  del: (path: string) => ReturnType<APIRequestContext['delete']>;
}> {
  const csrf = await csrfOf(context);
  /*
   * The jar's cookies, attached BY HAND. Node dials the API as `localhost`
   * while the browser's cookies are scoped to the API's hostname — on
   * localhost the two coincide, but in the cross-host topology
   * (`api.crm.localhost`) `context.request` would send NOTHING and every call
   * here would be a 401 that reads as a broken permission. Sending the jar
   * explicitly makes this helper topology-blind.
   */
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const headers = { Origin: APP_ORIGIN, 'X-OxShare-CSRF': csrf, Cookie: cookie };
  const r = context.request;
  return {
    get: (path) => r.get(`${API_NODE_BASE}${path}`, { headers }),
    post: (path, data) => r.post(`${API_NODE_BASE}${path}`, { headers, data }),
    patch: (path, data) => r.patch(`${API_NODE_BASE}${path}`, { headers, data }),
    put: (path, data) => r.put(`${API_NODE_BASE}${path}`, { headers, data }),
    del: (path) => r.delete(`${API_NODE_BASE}${path}`, { headers }),
  };
}

/**
 * A standalone admin API session, signed in over the wire as `E2E_ADMIN`.
 *
 * For specs that need an admin to ACT (credit a wallet, approve a KYC) without
 * driving the console. Waits out the login cap instead of failing on it, for
 * the reason `signIn` records at length.
 */
export async function adminApiSession(
  credentials: { email: string; password: string } = E2E_ADMIN,
): Promise<{
  request: APIRequestContext;
  csrf: string;
  get: (path: string) => ReturnType<APIRequestContext['get']>;
  post: (
    path: string,
    data?: unknown,
    extra?: Record<string, string>,
  ) => ReturnType<APIRequestContext['post']>;
  patch: (
    path: string,
    data?: unknown,
    extra?: Record<string, string>,
  ) => ReturnType<APIRequestContext['patch']>;
  put: (
    path: string,
    data?: unknown,
    extra?: Record<string, string>,
  ) => ReturnType<APIRequestContext['put']>;
  del: (path: string) => ReturnType<APIRequestContext['delete']>;
  dispose: () => Promise<void>;
}> {
  /*
   * EXPLICITLY cookie-free. Inside the test runner, `newContext()` inherits
   * the project's `use.storageState` — so a "fresh" API context silently
   * carries the shared master jar. That went unnoticed until invite-accept
   * started displacing the presenting session (24 Aug): every accept from such
   * a context revoked the SHARED master session and took the suite down.
   */
  const request = await apiRequest.newContext({ storageState: { cookies: [], origins: [] } });
  for (;;) {
    const login = await request.post(`${API_NODE_BASE}/admin/auth/login`, {
      headers: { Origin: APP_ORIGIN },
      data: credentials,
    });
    if (login.status() === 429) {
      // eslint-disable-next-line no-console
      console.log(`↻ admin API login rate limited; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WINDOW_MS));
      continue;
    }
    if (!login.ok()) {
      throw new Error(`admin API sign-in as ${credentials.email} answered ${login.status()}`);
    }
    break;
  }
  const csrf =
    (await request.storageState()).cookies.find((c) => c.name.includes('admin_csrf'))?.value ?? '';
  if (!csrf) throw new Error('the admin API session carried no CSRF cookie');
  const headers = { Origin: APP_ORIGIN, 'X-OxShare-CSRF': csrf };
  return {
    request,
    csrf,
    get: (path) => request.get(`${API_NODE_BASE}${path}`, { headers }),
    post: (path, data, extra) =>
      request.post(`${API_NODE_BASE}${path}`, { headers: { ...headers, ...extra }, data }),
    patch: (path, data, extra) =>
      request.patch(`${API_NODE_BASE}${path}`, { headers: { ...headers, ...extra }, data }),
    // The console's full-replace verb — role edits and settings saves use it.
    put: (path, data, extra) =>
      request.put(`${API_NODE_BASE}${path}`, { headers: { ...headers, ...extra }, data }),
    del: (path) => request.delete(`${API_NODE_BASE}${path}`, { headers }),
    dispose: () => request.dispose(),
  };
}

/**
 * The admin the E2E SUITE owns — seeded with every key in the permission
 * catalog (there is no `"*"` wildcard any more; full access IS the full list).
 *
 * Deliberately NOT `admin@oxshare.com`. That is the account a developer is
 * signed into while working, and the portal suite learned what sharing costs
 * within a single run: repeated test logins exhausted the per-minute cap and
 * answered a human's own sign-in with 429, and two parties rotating refresh
 * tokens for one identity is exactly what reuse detection exists to punish.
 *
 * Master-level on purpose. This suite walks the whole console, and a fixture
 * that 403s halfway would be testing the fixture. Permission SPLITS are asserted
 * against purpose-made roles, not by crippling the fixture.
 */
export const E2E_ADMIN = {
  email: 'e2e-admin@oxshare.com',
  password: 'admin123',
} as const;

/**
 * The RESTRICTED admin — the identity that makes FR-RBAC-03 assertable.
 *
 * Gating cannot be proved from the master's session: a spec that tried would
 * pass while demonstrating nothing. Seeded rather than invited, because there
 * is no `DELETE /admin/users` — an accepted invite is a permanent row, and a
 * suite that accepted one per run would fill the directory it is testing.
 *
 * Holds `clients.view`, `kyc.review` and `tags.view`; its role masks
 * `client.email`; and it is scoped to the `e2e-alpha` tag. One identity, both
 * RBAC-03 dimensions, every gating branch.
 */
export const E2E_RESTRICTED = {
  email: 'e2e-restricted@oxshare.com',
  password: 'admin123',
} as const;

/**
 * Every BUILT console page a master-level admin can open.
 *
 * Shared by `console-pages.spec.ts` (render / refresh / stay signed in / no
 * 401-403) and `ux-sweep.spec.ts` (no sideways scroll, every control named),
 * so a new page costs one line here and is covered by both — and a route
 * nobody adds a line for is a route nobody checked. Keep in step with
 * `ROUTE_REQUIREMENTS` in `src/lib/permissions.ts`.
 */
export const CONSOLE_PAGES = [
  '/dashboard',
  '/clients',
  '/kyc',
  '/kyc/builder',
  '/roles',
  '/admin-users',
  '/audit-log',
  '/settings',
  '/tags',
  '/currencies',
  '/transactions',
  '/wallets',
  '/trading-accounts',
  '/payment-methods',
  '/products',
  '/agencies',
  // The partner directory — back since 25 Sep 2026, with its route requirement.
  '/partners',
  '/approvals/ib',
  '/commissions',
  '/reconciliation',
  // ADM-13. The ledger sits beside reconciliation: the report says whether the
  // books balance, this is the evidence you read when the answer is no.
  '/ledger',
  '/api-keys',
  '/profile',
  // The bell's full page (backend 0140): every task names its client by
  // Portal ID, and must never print or link a uuid.
  '/notifications',
] as const;

/** Where each signed-in session is cached between specs. See `auth.setup.ts`. */
/** The login limiter's window, plus a few seconds of slack. */
const RATE_LIMIT_WINDOW_MS = 65_000;

export const STORAGE_STATE = 'e2e/.auth/admin.json';
export const RESTRICTED_STATE = 'e2e/.auth/restricted.json';
export const KYC_VIEWER_STATE = 'e2e/.auth/kyc-viewer.json';

/**
 * A READ-ONLY compliance reviewer: `kyc.view` and `clients.view`, no
 * `kyc.review`. The identity that proves the review screen draws no decision
 * control for somebody who may not decide — and that the API refuses them.
 */
export const E2E_KYC_VIEWER = {
  email: 'e2e-kyc-viewer@oxshare.com',
  password: 'admin123',
} as const;

/**
 * Sign in through the real form.
 *
 * Used ONCE per run by `auth.setup.ts`, not per test. Nothing here plants a
 * cookie: the session is httpOnly and the login response carries no token, so
 * there is nothing to plant — driving the form is the only way in.
 */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string } = E2E_ADMIN,
  /*
   * Where the sign-in is expected to land.
   *
   * Defaults to the dashboard, which is where an operator with no particular
   * destination belongs. It is a PARAMETER because `?next=` exists: a sign-in
   * that correctly returns someone to /clients would otherwise time out here
   * waiting for /dashboard, and the failure would read as "login is broken"
   * when login had just done exactly the right thing.
   */
  landsOn: RegExp = /\/dashboard/,
): Promise<void> {
  /*
   * Only navigate if we are not already on the sign-in screen.
   *
   * An unconditional `goto('/login')` discards the query string — including the
   * `?next=` that `proxy.ts` had just written — so a spec that checked "am I
   * returned to where I was going" destroyed the thing it was testing and then
   * failed, which read as the product losing the destination.
   *
   * It is also the more faithful journey: a bounced operator is already looking
   * at this page.
   */
  if (!new URL(page.url(), APP_ORIGIN).pathname.startsWith('/login')) {
    await page.goto('/login');
  }
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);

  /*
   * Watch the login RESPONSE, not just the URL.
   *
   * Admin login is rate limited, and a suite that signs in more than once will
   * meet that — especially while somebody is iterating on a spec. Waiting only
   * on the URL turns it into a bare timeout that reads as "login is broken" and
   * sends whoever sees it looking in the wrong place. The portal suite paid for
   * that lesson twice; this one starts with it.
   */
  const [response] = await Promise.all([
    page.waitForResponse(
      /*
       * Matched on the PATH SUFFIX, not on `/api/`.
       *
       * The console used to reach the API through a same-origin `/api/*`
       * rewrite and now calls it directly at `NEXT_PUBLIC_API_BASE_URL`, so
       * every request is `http://localhost:3001/v1/admin/...`. This predicate
       * still named the old prefix, matched nothing, and the whole suite failed
       * in `auth.setup` with a 30s timeout that reads as "login is broken" —
       * while login worked perfectly. Matching the suffix survives either shape.
       */
      (res) => res.url().includes('/admin/auth/login') && res.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page
      .getByRole('button', { name: /sign in|log ?in/i })
      .first()
      .click(),
  ]);

  if (response.status() === 429) {
    /*
     * WAIT FOR THE CAP, do not fail on it and do not weaken it.
     *
     * `POST /admin/auth/login` allows 5 per minute per IP. This suite needs
     * five: two `auth.setup.ts` identities plus the three logins
     * `auth-session.spec.ts` deliberately drives through the form. A run
     * therefore sits exactly ON the limit, and anybody re-running inside the
     * same minute tips over — with the failure landing on whichever test
     * happened to log in last, which reads as that test being broken.
     *
     * Three things were tried before this. Relaxing the cap for tests weakens
     * a real control on a money system. Caching `storageState` across runs
     * replays a rotated refresh token and trips reuse detection, which revokes
     * the whole family and signs the run out several specs later. Cutting the
     * form-driven logins would delete the coverage that made them worth having.
     *
     * Waiting out the window costs one minute on an unlucky run and nothing on
     * a lucky one, and it keeps every control exactly as it is in production.
     */
    /*
     * The per-test budget has to grow for the wait, or the wait itself is the
     * failure — the config allows 60s per test and this pause is 65s. That is
     * the shape of the first attempt at this fix: the backoff worked, and every
     * test it rescued then failed on a timeout instead, which looked identical
     * to the problem it was solving.
     *
     * Raised only on the unlucky path, so an ordinary run keeps the tight
     * budget that makes a genuinely slow page visible.
     */
    test.setTimeout(RATE_LIMIT_WINDOW_MS + 60_000);

    // eslint-disable-next-line no-console
    console.log(`↻ login rate limit reached; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s to retry…`);
    await page.waitForTimeout(RATE_LIMIT_WINDOW_MS);
    return signIn(page, credentials, landsOn);
  }
  if (!response.ok()) {
    throw new Error(
      `Could not sign in as ${credentials.email}: admin login answered ${response.status()}. ` +
        'Is the backend seeded? This fixture is created by runSeeds() on boot.',
    );
  }

  await page.waitForURL(landsOn, { timeout: 30_000 });
}

/**
 * Sign out through the UI, as an operator does.
 *
 * Logout is a MENU ITEM inside the account menu (the operator card at the foot
 * of the sidebar) since the /profile work — there is no page-level "Log out"
 * button any more. A locator for one waits sixty seconds at a perfectly healthy
 * dashboard and then reads as "logout is broken".
 */
export async function signOut(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /account menu/i })
    .first()
    .click();
  await page.getByRole('menuitem', { name: /logout/i }).click();
}

/**
 * Reach a page THROUGH the sidebar: open its main item, then click the page.
 *
 * The sidebar is main items with sub-items (25 Sep 2026), one open at a time,
 * and a closed item's pages are hidden (`inert` + `visibility: hidden`) — so a
 * spec that clicks a page's link directly finds nothing unless that page's
 * group happens to hold the current page. `group` is null for a page that sits
 * on its own at the top (Dashboard).
 *
 * A group already open is left alone: its header is a toggle, and clicking it
 * would CLOSE the list the link is in. The header is matched by prefix because
 * a closed group's name carries its waiting-work count ("Finance 3").
 */
export async function openNavItem(
  page: Page,
  group: string | null,
  link: string | RegExp,
): Promise<void> {
  const nav = page.getByRole('navigation').first();
  if (group) {
    const header = nav.getByRole('button', { name: new RegExp(`^${group}`, 'i') });
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  }
  await nav.getByRole('link', { name: link }).first().click();
}

/**
 * Persist a context's CURRENT cookie jar over the shared storage state.
 *
 * The refresh token ROTATES on every renewal, and the server treats a replay of
 * the superseded token as credential theft: reuse detection revokes the whole
 * family. So any test that forces a renewal BURNS the token stored in
 * `e2e/.auth/admin.json` — and the next spec to need a renewal inherits a token
 * the server has already rotated away, failing several specs later in a test
 * that has nothing to do with the cause. (That is exactly how one burned token
 * took 72 of 127 tests down on 13 Aug.) Every test that deletes the access
 * cookie or otherwise triggers a refresh must call this before ending.
 */
export async function persistSharedState(context: BrowserContext): Promise<void> {
  await persistStateIfLive(context, STORAGE_STATE);
}

/**
 * Write a context's jar over a storage-state file — ONLY if it still holds a
 * refresh cookie.
 *
 * A jar without one is a signed-out browser, and saving it signs out every
 * test that follows: that is exactly what happened when a sign-out test's
 * restoring `signIn` failed, its `finally` persisted the post-logout jar, and
 * thirty specs then opened on the login screen. A dead jar is never worth
 * writing; say so instead.
 */
export async function persistStateIfLive(context: BrowserContext, path: string): Promise<void> {
  const cookies = await context.cookies();
  const live = cookies.some((c) => /_rt$/.test(c.name) && c.value.length > 0);
  if (!live) {
    throw new Error(
      `Refusing to persist ${path}: the context holds no refresh cookie, so it is signed out. ` +
        'Saving it would sign out every later test.',
    );
  }
  await context.storageState({ path });
}

/**
 * Every API response the page received that the server refused.
 *
 * The reason to reach for a browser at all: a unit test cannot see that a layout
 * fires a forbidden request on every navigation. This lets a spec assert about
 * the traffic the UI produced without knowing which component produced it.
 *
 * On ADMIN, a 403 is the interesting one. The API enforces per-permission 403s
 * and the nav is gated client-side from the same catalogue, so a 403 means those
 * two disagree — the console offered something the API refuses.
 */
export function collectRejections(page: Page): { list: () => string[] } {
  const rejected: string[] = [];

  page.on('response', (response: Response) => {
    const url = response.url();
    // The direct API origin, whichever host it is on — matched on the
    // versioned path, never on `/api/` (see the header of this file).
    if (!new URL(url).pathname.startsWith('/v1/')) return;
    const status = response.status();
    if (status === 401 || status === 403) {
      rejected.push(`${status} ${new URL(url).pathname}`);
    }
  });

  return { list: () => [...rejected] };
}

/**
 * ── The seeded end-to-end client cohort ─────────────────────────────────────
 *
 * Created by `oxshare-crm-backend/src/database/seed.ts`, and SEEDED rather than
 * minted at runtime because that is forced: `POST /auth/register` is capped at
 * 10 per hour per IP and no admin endpoint creates a client at all, so a suite
 * that made its own fixtures would rate-limit itself on the second run.
 *
 * The SHAPE is chosen so every filter has both a match and a non-match —
 * 3 types x 3 statuses x 2 levels x 3 countries. A filter that silently ignores
 * its parameter (which is exactly what `?country=` did before this work) then
 * produces a count change a spec can catch, rather than a vacuous pass. Names
 * run alpha..zulu so a sort assertion is "first is Alpha, last is Zulu",
 * decidable without knowing the total.
 */
export const E2E_DOMAIN = 'oxshare-e2e.test';

export const E2E_CLIENTS = {
  alpha: { email: `alpha@${E2E_DOMAIN}`, name: 'Alpha Aardvark', country: 'Lebanon' },
  bravo: { email: `bravo@${E2E_DOMAIN}`, name: 'Bravo Baker', country: 'United Arab Emirates' },
  charlie: { email: `charlie@${E2E_DOMAIN}`, name: 'Charlie Croft', country: 'Cyprus' },
  delta: { email: `delta@${E2E_DOMAIN}`, name: 'Delta Dunn', country: 'Lebanon' },
  zulu: { email: `zulu@${E2E_DOMAIN}`, name: 'Zulu Zimmer', country: 'United Arab Emirates' },
  /**
   * The ONLY client any spec writes to.
   *
   * Suspension is destructive and its own spec toggles it, so it must not be a
   * row another assertion reads — a shared mutable fixture is how a suite starts
   * failing in an order that depends on which test ran first.
   */
  suspendTarget: { email: `suspend-target@${E2E_DOMAIN}`, name: 'Sierra Target' },
} as const;

/** Tags the suite owns. `alpha` is on one client; `beta` is on none. */
export const E2E_TAGS = {
  alpha: { slug: 'e2e-alpha', label: 'E2E Alpha' },
  beta: { slug: 'e2e-beta', label: 'E2E Beta' },
} as const;

/**
 * Narrow the client list to the rows this suite owns.
 *
 * THE MECHANISM THAT MAKES A SHARED DEVELOPMENT DATABASE WORKABLE. Every list
 * assertion runs inside this filter, so it is about a set the suite owns
 * entirely and a developer who registers forty clients tomorrow cannot break a
 * single one. It is also why the fixtures share a DOMAIN rather than a prefix:
 * a prefix collides, a domain does not.
 *
 * Nothing is ever deleted to compensate. Half these tables refuse deletion, and
 * a `DELETE ... WHERE email LIKE` against a shared development database is one
 * typo away from destroying somebody's afternoon.
 */
export async function searchOwnClients(page: Page): Promise<void> {
  // The LIST's search box, by its accessible name. The admin layout header
  // carries one too, so a bare `getByRole('searchbox')` is ambiguous and
  // Playwright refuses it — correctly, since which one it typed into would
  // otherwise be whichever the DOM happened to order first.
  //
  // Anchored on the RESPONSE that actually carries the search term, not only
  // on a row becoming visible. Alpha sorts early, so with any prior fetch's
  // rows still on screen the row-wait is satisfied by STALE data — which is
  // how the sort assertion once read the default ordering and reported the
  // server as unsorted.
  /*
   * The LARGEST page, because the cohort is not alone on its domain any more.
   *
   * The portal suite's registration specs mint `e2e-<ts>@oxshare-e2e.test`
   * clients (they used to share this domain), and the list sorts newest first
   * — so on a database that has seen enough runs the seeded rows slid off page
   * one and `Alpha Aardvark` never appeared, which read as a broken search. The
   * cohort is six rows; a hundred-row page keeps it on screen for a long time,
   * and the portal now registers under a domain of its own.
   */
  const current = new URL(page.url());
  if (current.searchParams.get('limit') !== '100') {
    current.searchParams.set('limit', '100');
    await page.goto(current.pathname + current.search);
  }
  const box = clientSearchBox(page);
  // Idempotent: filling the box with the text it already holds produces no
  // write, no fetch, and therefore no response to wait for.
  if ((await box.inputValue()) !== E2E_DOMAIN) {
    const settled = page.waitForResponse(
      (res) => res.url().includes('/admin/clients') && res.url().includes(`q=${E2E_DOMAIN}`),
      { timeout: 20_000 },
    );
    await box.fill(E2E_DOMAIN);
    await settled;
  }
  await page.getByRole('link', { name: E2E_CLIENTS.alpha.name }).waitFor({ timeout: 15_000 });
}

/** The client list's own search box, distinguished from the header's. */
export function clientSearchBox(page: Page) {
  return page.getByRole('searchbox', { name: /search clients/i });
}

/**
 * ── The mailbox ─────────────────────────────────────────────────────────────
 *
 * Every email the API sends in development lands in Mailpit
 * (`docker compose up -d` in oxshare-crm-backend; UI at :8025), pointed at by
 * Settings → Email. Emailed TOKENS are the only way through several journeys —
 * verification, password reset, invites — because they are stored hashed and
 * echoed nowhere (a bearer credential in a log is a leak), so the suite reads
 * the mailbox exactly as the person would.
 */
export const MAILPIT_API = (process.env.E2E_MAILPIT_API ?? 'http://localhost:8025/api/v1').replace(
  /\/+$/,
  '',
);

/** The newest message to `to`, waited for; throws with a fix when Mailpit is absent. */
export async function waitForMail(
  to: string,
  opts: { subject?: RegExp; timeoutMs?: number } = {},
): Promise<{ id: string; subject: string; text: string; html: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let lastErr = '';
  for (;;) {
    try {
      const res = await fetch(
        `${MAILPIT_API}/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=20`,
        { signal: AbortSignal.timeout(4_000) },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          messages?: { ID: string; Subject: string }[];
        };
        const hit = (body.messages ?? []).find(
          (m) => !opts.subject || opts.subject.test(m.Subject),
        );
        if (hit) {
          const full = (await (await fetch(`${MAILPIT_API}/message/${hit.ID}`)).json()) as {
            Text?: string;
            HTML?: string;
          };
          return { id: hit.ID, subject: hit.Subject, text: full.Text ?? '', html: full.HTML ?? '' };
        }
      } else {
        lastErr = `Mailpit answered ${res.status}`;
      }
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No mail for ${to} within ${opts.timeoutMs ?? 15_000}ms` +
          (lastErr ? ` (${lastErr})` : '') +
          '.\nIs Mailpit up (docker compose up -d in oxshare-crm-backend) and Settings → Email ' +
          'pointed at localhost:1025?',
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * The first tokened link in a message, REWRITTEN to this suite's app origin —
 * the email carries whatever PORTAL_URL/ADMIN_URL the backend was started
 * with, and the suite must follow it on the topology it is driving.
 */
export function linkIn(mail: { text: string; html: string }, appOrigin: string): string {
  const haystack = `${mail.text}\n${mail.html.replace(/&amp;/g, '&')}`;
  const match = haystack.match(/https?:\/\/[^\s"'<>]+[?&]token=[A-Za-z0-9._~-]+[^\s"'<>]*/);
  if (!match) throw new Error(`No tokened link found in "${mail.text.slice(0, 200)}…"`);
  const url = new URL(match[0]);
  return `${appOrigin}${url.pathname}${url.search}`;
}

/**
 * Accept an admin invite over the wire, as the invitee's clean browser would,
 * waiting out the 5/min cap on the accept route rather than raising it.
 *
 * Returns a live API session for the freshly minted administrator: the request
 * context holds the cookies, `headers` carries the Origin + CSRF pair every
 * write needs, and `id` is who they are. Dispose the context when done.
 */
export async function acceptAdminInvite(
  token: string,
  password: string,
): Promise<{ ctx: APIRequestContext; headers: Record<string, string>; id: string }> {
  for (let attempt = 0; ; attempt += 1) {
    // Cookie-free for the same reason adminApiSession is — see the note there.
    const ctx = await apiRequest.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await ctx.post(`${API_NODE_BASE}/admin/invite/accept`, {
      headers: { Origin: APP_ORIGIN },
      data: { token, password },
    });
    if (res.status() === 429 && attempt < 3) {
      await ctx.dispose();
      await new Promise((r) => setTimeout(r, 61_000));
      continue;
    }
    if (!res.ok()) {
      await ctx.dispose();
      throw new Error(`Accepting the invite answered ${res.status()}.`);
    }
    const csrf =
      (await ctx.storageState()).cookies.find((c) => c.name.includes('admin_csrf'))?.value ?? '';
    const me = await ctx.get(`${API_NODE_BASE}/admin/auth/me`);
    const { id } = (await me.json()) as { id: string };
    return { ctx, headers: { Origin: APP_ORIGIN, 'X-OxShare-CSRF': csrf }, id };
  }
}

/**
 * A precondition that could not be met — skipped locally, FATAL in CI.
 *
 * ## Why this exists
 *
 * Nineteen `test.skip()` guards across this suite protect against conditions
 * that are ordinary on a shared machine: registration is capped at 10/hour per
 * address, login is capped per minute, and a fixture may be absent. Skipping is
 * the right call when somebody is iterating locally — a red suite for a rate
 * limit teaches people to ignore red.
 *
 * But a skipped Playwright test reports as PASSING in the summary. The whole
 * money journey — register, verify, KYC, approve, credit, withdraw, decide —
 * sits behind two of those guards, so a run that exercised none of it is
 * indistinguishable from one that exercised all of it. That is exactly the
 * shape of evidence this suite exists to stop being fooled by.
 *
 * So the decision is made by the ENVIRONMENT rather than by the spec:
 *
 *   - unset (a laptop): skip, as before.
 *   - `E2E_STRICT=1` (CI, or a run whose result somebody will quote): FAIL,
 *     naming the precondition, so a journey cannot go missing from a green
 *     result.
 *
 * Set `E2E_STRICT=1` on any run that is meant to be evidence.
 */
/**
 * A skip for an OPTIONAL external rail, declared rather than inferred.
 *
 * `requirePrecondition` is wrong for the payout rail. A missing fixture is
 * always a defect in the run; a rail that nobody configured is a legitimate
 * state, and making it strict would turn CI red for a service CI does not
 * have. But the old shape — probe, and skip on false — is worse: "the rail is
 * off" and "the rail is broken" produce the same silent green.
 *
 * So the decision moves to a DECLARATION. `E2E_RAIL=on` says an operator
 * expects the rail to be live here; a rail that then is not live is a failure,
 * named as one. Without the flag the case skips, and the reason says which
 * variable would have made it run — so a reader of a green summary can tell
 * "nobody asked for the rail" from "the rail was asked for and answered".
 */
export function requireRail(live: boolean): void {
  if (live) return;
  if (process.env['E2E_RAIL'] === 'on') {
    throw new Error(
      'E2E_RAIL=on declares the payout rail should be live here, and it is not. ' +
        'Configure Rival (settings > Rival: enabled, API key set, connection test passing) ' +
        'or unset E2E_RAIL to let these cases skip.',
    );
  }
  test.skip(true, 'the payout rail is not configured here — set E2E_RAIL=on to require it');
}

export function requirePrecondition(condition: boolean, reason: string): void {
  if (!condition) return;
  if (process.env['E2E_STRICT'] === '1') {
    throw new Error(
      `PRECONDITION NOT MET (E2E_STRICT): ${reason}. ` +
        'This run was asked to be evidence, so the journey is reported as failed ' +
        'rather than silently skipped. Re-run when the precondition clears, or ' +
        'unset E2E_STRICT for a tolerant local run.',
    );
  }
  test.skip(true, reason);
}

/**
 * Make an API-minted session usable by a BROWSER, in both topologies.
 *
 * Node-side request contexts dial the API at `localhost` (Chromium resolves
 * `*.crm.localhost`; Node does not), so the cookies their logins mint are
 * scoped to `localhost`. In the crosshost topology the browser talks to
 * `api.crm.localhost` instead and would never attach those cookies — a session
 * that works in every Node call silently does not exist for the page. This
 * rewrites the cookie domain to the host the BROWSER dials; on localhost the
 * two are the same string and the rewrite is the identity.
 */
export async function browserStateFrom(ctx: APIRequestContext): Promise<{
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }[];
  origins: [];
}> {
  const apiHost = new URL(API_ORIGIN).hostname;
  const state = await ctx.storageState();
  return {
    cookies: state.cookies.map((c) =>
      c.domain === 'localhost' || c.domain === '.localhost' ? { ...c, domain: apiHost } : c,
    ),
    origins: [],
  };
}

/** A 1×1 PNG — real bytes, because the upload endpoint sniffs the type. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export interface MintedClient {
  portal: APIRequestContext;
  csrf: string;
  email: string;
  id: string;
  dispose: () => Promise<void>;
}

/**
 * A client minted for this run alone, carried by wire all the way to a KYC
 * submission that is WAITING FOR A REVIEWER.
 *
 * Fresh rather than seeded, because both the KYC queue and the money ledger
 * are append-only: a shared fixture accumulates every run's rows into every
 * later assertion. It stops one step short of approval so the caller decides
 * — the withdrawals desk approves immediately, the realtime spec approves in
 * a BROWSER because the approval is the thing under test.
 *
 * Extracted from `withdrawals-desk.spec.ts`, which owned the only copy.
 *
 * @param label distinguishes concurrent runs in the mailbox and the audit log.
 */
/**
 * A client REGISTERED at runtime, carried by wire to a submitted KYC.
 *
 * EXPENSIVE, and to be used only where the ACT of submitting is the subject —
 * a realtime spec asserting that `admin.kyc.submitted` reaches an open console
 * cannot use a pre-seeded submission, because the event fired before the
 * browser existed.
 *
 * Everything else must use `mintClientWithPendingKyc`, which leases from the
 * seeded pool. `POST /auth/register` is capped at 10 an hour per IP and this
 * path also spends `verify-email` (10 per 15 minutes) and three uploads (10 a
 * minute). Eleven call sites used to take this route, which is why eighteen
 * tests silently skipped out of a green run.
 *
 * ONE caller today. If a second appears, check the budget before adding it.
 */
export async function registerClientWithPendingKyc(
  admin: { get: (path: string) => Promise<Response | { json: () => Promise<unknown> }> },
  label: string,
): Promise<MintedClient> {
  const email = `e2e-${label}-${Date.now()}@oxshare-e2e-signup.test`;
  const password = `E2e-${label}-123!`;
  const portal = await apiRequest.newContext({ storageState: { cookies: [], origins: [] } });
  const origin = { Origin: TOPOLOGY_PORTAL_ORIGIN };

  /*
   * LETTERS ONLY in both names, and ONE copy of them. Since the single client
   * profile (backend 0139, 25 Sep 2026) a name is validated as it appears on an
   * ID — letters, marks, spaces, hyphens, apostrophes — and "E2e" carries a
   * digit: registration answered 400 and, once that was fixed, the KYC personal
   * step (which writes the same profile) answered 400 in its place. Both calls
   * read this object now, so they cannot disagree again. The label keeps its
   * letters and hyphens and loses the rest.
   */
  const name = {
    firstName: 'Endtoend',
    lastName: label.replace(/[^\p{L} '-]/gu, '') || 'Client',
  };
  const registered = await portal.post(`${API_NODE_BASE}/auth/register`, {
    headers: origin,
    data: { email, password, ...name },
  });
  requirePrecondition(registered.status() === 429, 'registration is rate limited right now (10/h)');
  expect(registered.ok(), `register answered ${registered.status()}`).toBe(true);

  /*
   * `/verif/i`, not `/verify/i`: since 25 Sep 2026 the sign-up mail's subject is
   * "<code> is your OxShare verification code", and "verification" does not
   * contain "verify" — the old pattern waited out its timeout on a mail that
   * had arrived.
   */
  const mail = await waitForMail(email, { subject: /verif/i });
  const token = new URL(linkIn(mail, TOPOLOGY_PORTAL_ORIGIN)).searchParams.get('token')!;
  expect(
    (
      await portal.post(`${API_NODE_BASE}/auth/verify-email`, { headers: origin, data: { token } })
    ).ok(),
  ).toBe(true);

  const login = await portal.post(`${API_NODE_BASE}/auth/login`, {
    headers: origin,
    data: { email, password },
  });
  requirePrecondition(login.status() === 429, 'portal login is rate limited right now');
  expect(login.ok(), `login answered ${login.status()}`).toBe(true);
  const csrf =
    (await portal.storageState()).cookies.find((c) => c.name.includes('portal_csrf'))?.value ?? '';
  expect(csrf, 'no portal CSRF cookie after login').toBeTruthy();
  const write = { ...origin, 'X-OxShare-CSRF': csrf };

  const step = (stepName: string, data: Record<string, unknown>) =>
    portal.post(`${API_NODE_BASE}/kyc/step`, { headers: write, data: { step: stepName, data } });

  /*
   * Uploads are capped at 10 a minute PER IP, and a KYC submission needs
   * three. Two clients minted close together therefore reach the cap on the
   * second one's last document.
   *
   * WAITED OUT, never weakened — the same choice `adminApiSession` makes about
   * the five-a-minute login cap. Raising a real rate limit so a test suite fits
   * inside it removes the protection from production to make CI green, which
   * is the wrong trade on a system that accepts identity documents.
   */
  /*
   * The DOCUMENT TYPE rides on the upload. Since the 24 Sep KYC overhaul a step
   * stores only its configured string fields, so a `docType` sent with the step
   * is dropped — the choice was never made, and submission answered 400 "Proof
   * of address is required." The portal's own helper (`uploadKycFile`) already
   * sends it this way; this one had been left behind.
   */
  const upload = async (field: string, docType?: string): Promise<void> => {
    const send = () =>
      portal.post(`${API_NODE_BASE}/kyc/upload`, {
        headers: write,
        multipart: {
          file: { name: `${field}.png`, mimeType: 'image/png', buffer: TINY_PNG },
          field,
          ...(docType ? { docType } : {}),
        },
      });
    let res = await send();
    if (res.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, 61_000));
      res = await send();
    }
    expect(res.ok(), `uploading ${field} answered ${res.status()}`).toBe(true);
  };
  expect(
    (
      await step('personal', {
        ...name,
        dateOfBirth: '1988-08-08',
        phone: '+96170000010',
        nationality: 'Lebanese',
        country: 'Lebanon',
      })
    ).ok(),
  ).toBe(true);
  expect((await step('document', {})).ok()).toBe(true);
  await upload('doc_front', 'passport');
  await upload('selfie');
  expect((await step('address', {})).ok()).toBe(true);
  await upload('address_proof', 'utility_bill');
  expect((await portal.post(`${API_NODE_BASE}/kyc/submit`, { headers: write })).ok()).toBe(true);

  const id = await clientIdByEmail(admin, email);
  return { portal, csrf, email, id, dispose: () => portal.dispose() };
}

/**
 * A BRAND-NEW client with a pending KYC submission — for specs that assert MONEY.
 *
 * `mintClientWithPendingKyc` LEASES a pooled fixture, which is right for a spec
 * that only needs something reviewable and wrong for one that asserts a balance.
 * A pooled client is reused, so it carries a wallet, a ledger and claimed
 * idempotency keys from every previous run. `withdrawals-desk` credits 100 under
 * a key derived from the client id — stable for a pooled client — so after the
 * first run that credit is a correctly-deduped REPLAY: nothing is added and the
 * wallet still holds what the last run left. The spec read 90.00000000 where it
 * expected 100.00000000 and the failure looked like a broken credit.
 *
 * This costs NO registration budget: the row is seeded directly through the
 * development-only fixtures route rather than through `POST /auth/register`
 * (10/hour per IP), so freshness and the rate limit are no longer a trade-off.
 *
 * Returns the same shape as the pooled path, so the two are interchangeable
 * apart from the history — which is the whole difference that matters.
 */
export async function mintFreshClientWithPendingKyc(
  admin: { get: (path: string) => Promise<Response | { json: () => Promise<unknown> }> },
  label: string,
): Promise<MintedClient> {
  /*
   * Both are unused and both are kept, so this is a drop-in swap for the pooled
   * helper at a call site. The id comes back from the route rather than being
   * looked up through `admin`, and the LABEL is deliberately not sent: the
   * fixtures route takes no input at all, which is the property that stops it
   * being able to name an existing client. A label would be harmless in itself
   * and would still be the first parameter.
   */
  void admin;
  void label;
  const portal = await apiRequest.newContext({ storageState: { cookies: [], origins: [] } });
  const origin = { Origin: TOPOLOGY_PORTAL_ORIGIN };

  const made = await portal.post(`${API_NODE_BASE}/e2e/fixtures/client`, {
    headers: { Origin: APP_ORIGIN },
  });
  requirePrecondition(
    !made.ok(),
    `the e2e fixtures route answered ${made.status()} — it is development-only, so a ` +
      'non-development API has no way to mint a fresh money fixture',
  );
  const { id, email, password } = (await made.json()) as {
    id: string;
    email: string;
    password: string;
  };

  for (;;) {
    const login = await portal.post(`${API_NODE_BASE}/auth/login`, {
      headers: origin,
      data: { email, password },
    });
    if (login.status() === 429) {
      // Waited out, never weakened — the same choice every other login here makes.
      // eslint-disable-next-line no-console
      console.log(`↻ portal login rate limited; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WINDOW_MS));
      continue;
    }
    expect(login.ok(), `signing in as the fresh client ${email} answered ${login.status()}`).toBe(
      true,
    );
    break;
  }

  const csrf =
    (await portal.storageState()).cookies.find((c) => c.name.includes('portal_csrf'))?.value ?? '';
  expect(csrf, 'no portal CSRF cookie after signing in as the fresh client').toBeTruthy();

  return { portal, csrf, email, id, dispose: () => portal.dispose() };
}

/**
 * The review-pool labels, MIRRORED from the backend's `REVIEW_POOL_LABELS`.
 *
 * Advisory only — it never gates a lease. These are separate repos with no
 * shared package, so a hard check here would fail a perfectly valid label the
 * day the backend adds one, which is a worse failure than the message it would
 * improve. It is used solely to tell two different mistakes apart when a lease
 * has already failed: a fixture a previous run consumed, versus a label that
 * was never seeded.
 */
const KNOWN_POOL_LABELS: readonly string[] = [
  'desk',
  'needs-attention',
  'claim',
  'decided',
  'rt',
  'rt-in',
  'auth',
  'dbl',
  'rej',
  'ui',
  'settle',
];

export async function mintClientWithPendingKyc(
  admin: { get: (path: string) => Promise<Response | { json: () => Promise<unknown> }> },
  label: string,
): Promise<MintedClient> {
  /*
   * LEASED from the seeded pool, not registered.
   *
   * This used to register a client, verify the address, walk four KYC steps and
   * upload three documents — once per spec that needs a reviewable submission.
   * The cohort docblock above already explains why that cannot work:
   * `POST /auth/register` is capped at 10 an hour per IP.
   *
   * There are ELEVEN of these across the suite. So a single full run cannot
   * finish inside the budget, never mind a second — the later calls answer 429,
   * `requirePrecondition` skips, and a skipped Playwright test reports as
   * PASSING. Eighteen tests vanished from one green run that way, the entire
   * payout rail among them, and nothing in the output said so.
   * `verify-email` (10 per 15 minutes) and the upload cap (10 a minute) were
   * being spent the same way.
   *
   * `seed.ts` now creates one pending submission per label and RE-ASSERTS it on
   * every boot, so a run that approves one finds it pending again. This signs in
   * as that client and hands back the same shape as before, so no caller
   * changed.
   *
   * ⚠️ WHAT THIS DOES NOT DO is create a NEW client. A spec that needs a
   * genuinely fresh registration — the registration flow itself — must still
   * register, and should budget for it.
   */
  const email = `e2e-pool-${label}@${E2E_DOMAIN}`;
  const password = 'client123';
  const portal = await apiRequest.newContext({ storageState: { cookies: [], origins: [] } });
  const origin = { Origin: TOPOLOGY_PORTAL_ORIGIN };

  for (;;) {
    const login = await portal.post(`${API_NODE_BASE}/auth/login`, {
      headers: origin,
      data: { email, password },
    });
    if (login.status() === 429) {
      // Waited out, never weakened — the same choice `adminApiSession` makes.
      // eslint-disable-next-line no-console
      console.log(`↻ portal login rate limited; waiting ${RATE_LIMIT_WINDOW_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WINDOW_MS));
      continue;
    }
    expect(
      login.ok(),
      `signing in as the pooled client ${email} answered ${login.status()}.\n` +
        (KNOWN_POOL_LABELS.includes(label)
          ? 'That label IS in the pool, so this is a database or seeding problem: ' +
            'the API seeds the pool at boot, so restart it if this is a fresh database.'
          : `'${label}' is NOT a label this suite knows about. If you have just added a ` +
            'lease site, add the label to REVIEW_POOL_LABELS in ' +
            'oxshare-crm-backend/src/database/seed.ts (and to KNOWN_POOL_LABELS here) ' +
            'and restart the API. This is not a consumed fixture.'),
    ).toBe(true);
    break;
  }

  const csrf =
    (await portal.storageState()).cookies.find((c) => c.name.includes('portal_csrf'))?.value ?? '';
  expect(csrf, 'no portal CSRF cookie after signing in as the pooled client').toBeTruthy();

  const id = await clientIdByEmail(admin, email);

  /*
   * The submission must be PENDING, and this is checked rather than assumed.
   *
   * The seed re-asserts it at boot, so the only way it is decided here is a
   * second run against a backend that has not restarted. That is a real
   * situation with a one-line remedy, and it must not present as the test
   * failing for its own reasons — so it is reported as the precondition it is,
   * naming the fix.
   */
  const submission = (await (await admin.get(`/admin/kyc/${id}`)).json()) as { status?: string };
  requirePrecondition(
    submission.status !== 'submitted' && submission.status !== 'under_review',
    `the pooled submission for '${label}' is '${submission.status}' rather than pending — ` +
      'a previous run decided it and globalSetup did not reset it. The reset is ' +
      'development-only, so check the [e2e] line at the top of this run: if it warned, ' +
      'the API is not in development mode or the route is missing, and restarting the ' +
      'API will re-seed the pool.',
  );

  return { portal, csrf, email, id, dispose: () => portal.dispose() };
}

/**
 * Resolve a client's uuid from their address, through the admin index.
 *
 * The lookup was copy-pasted into four specs, each re-deriving that
 * `?q=<email>` is a SEARCH and can return near-matches — so the exact-email
 * `find` is the part that actually matters and the part most easily dropped.
 */
export async function clientIdByEmail(
  admin: { get: (path: string) => Promise<{ json: () => Promise<unknown> }> },
  email: string,
): Promise<string> {
  const found = await admin.get(`/admin/clients?q=${encodeURIComponent(email)}&limit=5`);
  const id =
    ((await found.json()) as { items: { id: string; email: string }[] }).items.find(
      (c) => c.email === email,
    )?.id ?? '';
  expect(id, `${email} is not on the admin index`).toBeTruthy();
  return id;
}
