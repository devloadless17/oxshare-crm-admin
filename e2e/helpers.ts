import { test, type BrowserContext, type Page, type Response } from '@playwright/test';

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
  '/partners',
  '/approvals/ib',
  '/ib-levels',
  '/commissions',
  '/reconciliation',
  '/api-keys',
  '/profile',
] as const;

/** Where each signed-in session is cached between specs. See `auth.setup.ts`. */
/** The login limiter's window, plus a few seconds of slack. */
const RATE_LIMIT_WINDOW_MS = 65_000;

export const STORAGE_STATE = 'e2e/.auth/admin.json';
export const RESTRICTED_STATE = 'e2e/.auth/restricted.json';

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
  if (!new URL(page.url(), 'http://localhost:3002').pathname.startsWith('/login')) {
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
      (res) => res.url().includes('/api/admin/auth/login') && res.request().method() === 'POST',
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
  await context.storageState({ path: STORAGE_STATE });
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
    if (!url.includes('/api/')) return;
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
  const box = clientSearchBox(page);
  // Idempotent: filling the box with the text it already holds produces no
  // write, no fetch, and therefore no response to wait for.
  if ((await box.inputValue()) !== E2E_DOMAIN) {
    const settled = page.waitForResponse(
      (res) => res.url().includes('/api/admin/clients') && res.url().includes(`q=${E2E_DOMAIN}`),
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
