import { expect, test } from './fixtures';
import {
  acceptAdminInvite,
  adminApiSession,
  API_NODE_BASE,
  APP_ORIGIN,
  deleteCookie,
  routeHit,
} from './helpers';

/**
 * Slice 5/5b — the console under session STRESS, plus the two families the
 * coverage map flagged thin on this surface: admin refresh-reuse detection
 * (only the portal had it), the IP allowlist in its ENFORCING state (every
 * existing test runs with zero rules), and the session-hint desync.
 */

// A representative spread — one page per data shape, not all 24 (the healthy
// per-route pass lives in console-pages.spec.ts; this is the STRESS pass).
const PAGES = ['/dashboard', '/clients', '/roles', '/audit-log', '/transactions'] as const;

test.describe('every page renders after a silent renewal, never a flash', () => {
  for (const path of PAGES) {
    test(`${path} recovers from a lapsed access token with one refresh`, async ({ page }) => {
      // Lapse only the access cookie; the 30-day refresh cookie stays. This is
      // the ordinary state of an operator returning after 15 minutes.
      await deleteCookie(page.context(), /_at$/);
      const refresh = await routeHit(page, '/admin/auth/refresh', (route) => route.continue());

      await page.goto(path);
      // Landed on the page, not bounced to /login, and the refresh fired.
      expect(new URL(page.url()).pathname, `${path} bounced to sign-in`).toBe(path);
      await expect
        .poll(() => refresh.hits(), { timeout: 15_000, message: 'no silent refresh fired' })
        .toBeGreaterThan(0);
      // Exactly one renewal, not a storm.
      expect(refresh.hits(), 'more than one refresh for one lapse').toBeLessThanOrEqual(2);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
  }
});

test('a hard refresh WHILE a renewal is in flight does not double-refresh or evict', async ({
  page,
}) => {
  await page.goto('/clients');
  // Slow the refresh so a second navigation lands mid-flight.
  const refresh = await routeHit(page, '/admin/auth/refresh', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await deleteCookie(page.context(), /_at$/);
  // Navigate, and while its data calls are refreshing, reload the SAME page —
  // two loads contending for one rotating token. (Sequential awaits, not a
  // Promise.all: two concurrent goto/reload abort each other's navigation,
  // which is a Playwright artifact, not a product signal.)
  await page.goto('/clients');
  await page.reload();
  expect(new URL(page.url()).pathname, 'a mid-flight refresh evicted the operator').toBe(
    '/clients',
  );
  // One lapse, and the single-flight lock holds under the contention.
  expect(refresh.hits(), 'a mid-flight reload triggered a refresh storm').toBeLessThanOrEqual(3);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a deleted session-hint on a LIVE session never shows a sign-in form', async ({ page }) => {
  /*
   * The D-69 desync: the marker is what the edge proxy reads to decide which
   * screen to paint. Delete it by hand on a live session — the 401-on-public-
   * path branch must NOT conclude "signed out" and strand the operator on the
   * sign-in form; /admin/auth/me re-establishes the truth.
   */
  await page.goto('/dashboard');
  await deleteCookie(page.context(), /session_hint/);
  await page.goto('/clients');
  expect(new URL(page.url()).pathname, 'a live session met the sign-in form').toBe('/clients');
});

test('admin refresh-reuse detection signs every tab out', async ({ browser }) => {
  /*
   * The portal has this e2e; the admin surface did not. A rotated refresh
   * token replayed (an attacker's stolen copy, or a captured cookie) burns the
   * whole family — so the live console session dies on its next request.
   */
  /*
   * A DEDICATED admin, never the shared jar: reuse detection revokes the whole
   * family, and burning e2e/.auth/admin.json signs every later spec in the run
   * out — the portal's reuse test carries its own identity for the same reason.
   */
  const master = await adminApiSession();
  const invited = await master.post('/admin/invite', {
    email: `e2e-reuseburn-${Date.now()}@oxshare-e2e.test`,
    name: 'E2E Reuse Burn',
    permissions: ['clients.view'],
  });
  expect(invited.ok()).toBe(true);
  const token = new URL(
    ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
  ).searchParams.get('token')!;
  const burn = await acceptAdminInvite(token, `Reuseburn-${Date.now()}-123!`);
  const ctx = await browser.newContext({ storageState: await burn.ctx.storageState() });
  const page = await ctx.newPage();
  try {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /clients/i }).first()).toBeVisible();

    // Capture the CURRENT refresh cookie, rotate it once (a legitimate
    // refresh), then replay the captured value — reuse.
    const rt = (await ctx.cookies()).find((c) => /_rt$/.test(c.name))!;
    const first = await ctx.request.post(`${API_NODE_BASE}/admin/auth/refresh`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect(first.ok(), 'the legitimate rotation failed').toBe(true);
    /*
     * CONSUME the successor before replaying — the 30s retry grace forgives a
     * replay whose successor sits unused (a lost response, not a theft). One
     * more legitimate rotation moves the chain on; NOW the captured token is
     * two generations back with a consumed child, which is theft-shaped.
     */
    const second = await ctx.request.post(`${API_NODE_BASE}/admin/auth/refresh`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect(second.ok(), 'the second rotation failed').toBe(true);

    // Put the STALE token back and present it — a replay of a rotated token.
    await ctx.addCookies([{ ...rt }]);
    const replay = await ctx.request.post(`${API_NODE_BASE}/admin/auth/refresh`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect(replay.status(), 'replaying a rotated token was not refused').toBe(401);

    // The console session is now dead: the next navigation lands on sign-in.
    await page.goto('/clients').catch(() => null);
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  } finally {
    await ctx.close();
    await master.patch(`/admin/users/${burn.id}/status`, { status: 'suspended' });
    await burn.ctx.dispose();
    await master.dispose();
  }
});

/*
 * ⚠️ WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *
 * It was called "a covering rule keeps you in, a FOREIGN ONE LOCKS OUT" and it
 * never asserted the second half — nothing in it ever made a request from an
 * address outside the list. The title claimed the refusal direction; the body
 * only ever exercised admission.
 *
 * It cannot honestly claim it either: this runs from ONE address, and the
 * feature's own lockout guards refuse a first rule that excludes the author and
 * refuse to strand them by deletion. Proving refusal from here would mean
 * defeating the guards that exist to stop exactly that.
 *
 * The refusal direction is proven where it can be, in the backend:
 *   test/ip-allowlist.spec.ts       'refuses an address outside every rule'
 *                                   'refuses an UNKNOWN address once configured'
 *   test/ip-allowlist-safety.spec.ts 'denies an address outside every range'
 *                                    'DENIES an unknown address rather than failing open'
 *
 * What THIS test is for is the half only a real browser against a real API can
 * show: that turning enforcement on does not lock out the person turning it on,
 * and that the sanctioned way back out works.
 */
test('the IP allowlist admits a covering caller, and the way back out works', async () => {
  test.setTimeout(120_000);
  const admin = await adminApiSession();
  const listRules = async (): Promise<{ id: string }[]> => {
    const res = await admin.get('/admin/ip-allowlist');
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { rules?: { id: string }[]; yourIp?: string };
    return body.rules ?? [];
  };
  // Start from a clean list — a rule left by a crashed earlier run would make
  // every add below a 409 and the whole test a false red.
  for (const r of await listRules()) await admin.del(`/admin/ip-allowlist/${r.id}`);
  const added: string[] = [];
  try {
    const me = await admin.get('/admin/ip-allowlist');
    expect(me.ok()).toBe(true);
    const yourIp = ((await me.json()) as { yourIp?: string }).yourIp;
    test.skip(!yourIp, 'the server could not determine the caller IP');

    // Lockout guard: a FIRST rule that excludes the author is refused.
    const selfExcluding = await admin.post('/admin/ip-allowlist', {
      cidr: '10.0.0.0/32',
      label: 'e2e self-excluding — must be refused',
    });
    expect(
      selfExcluding.status(),
      'a self-excluding first rule was accepted — lockout guard missing',
    ).toBeGreaterThanOrEqual(400);

    // A covering rule turns enforcement ON and keeps the author in.
    const covering = await admin.post('/admin/ip-allowlist', {
      cidr: `${yourIp}/32`,
      label: 'e2e covering rule',
    });
    expect(covering.ok(), `covering rule answered ${covering.status()}`).toBe(true);
    // The add answers a message, not the row — the id comes from the list.
    const afterAdd = await listRules();
    expect(afterAdd.length).toBe(1);
    added.push(afterAdd[0]!.id);

    // Still in: an ordinary read works with enforcement active.
    expect((await admin.get('/admin/clients?limit=1')).status()).toBe(200);

    // The last covering rule cannot be removed while it is the only thing
    // keeping the author in — but removing it turns enforcement OFF, which is
    // the sanctioned way back. The service's own contract: the LAST rule
    // deletes (enforcement off), a rule that would strand the author does not.
    const del = await admin.del(`/admin/ip-allowlist/${added[0]}`);
    expect(del.ok(), 'removing the last rule (enforcement off) was refused').toBe(true);
    added.pop();

    // Back to the found state: no rules, enforcement off, console open.
    expect((await admin.get('/admin/clients?limit=1')).status()).toBe(200);
  } finally {
    // Leave the list as we found it — empty — whatever failed above.
    for (const r of await listRules()) await admin.del(`/admin/ip-allowlist/${r.id}`);
    await admin.dispose();
  }
});
