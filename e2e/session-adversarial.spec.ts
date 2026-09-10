import { request } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  acceptAdminInvite,
  browserStateFrom,
  adminApiSession,
  API_NODE_BASE,
  APP_ORIGIN,
  deleteCookie,
  linkIn,
  routeHit,
  waitForMail,
} from './helpers';

/**
 * The session state machine under ADVERSE conditions — the four defects the
 * 24 Aug adversarial round fixed, each proven in a real browser because each
 * is about what the OPERATOR experiences, not what the API answers:
 *
 *  1. A refresh the API never answered (5xx, dropped connection) must NOT
 *     sign the operator out — only a real 401 may.
 *  2. Suspension REVOKES the sessions: reactivating the account must not
 *     resurrect a browser that was signed in before the suspension.
 *  3. Accepting an invite on a browser that held another admin's session
 *     ENDS that session everywhere, not merely in this tab's cookie jar.
 *  4. A completed password reset reaches a live browser IMMEDIATELY, not
 *     when the 15-minute access token happens to lapse.
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now();

test('a refresh the API never answered does NOT evict the operator', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();

  // ── A 500 from a restarting API ──────────────────────────────────────────
  const failing = await routeHit(page, '/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 500, message: 'restarting' }),
    }),
  );
  // Lapse the access token by hand; the refresh cookie stays — a returning
  // operator's ordinary state, except the API cannot answer the renewal.
  await deleteCookie(page.context(), /_at$/);
  await page.goto('/audit-log');
  // The refresh fires from the page's ASYNC data calls, after load — wait for
  // the interception rather than racing it. Zero hits = a vacuous test.
  await expect
    .poll(() => failing.hits(), { timeout: 15_000, message: 'the injected 500 never fired' })
    .toBeGreaterThan(0);
  // NOT signed out: still on the console route, no /login, marker intact.
  expect(new URL(page.url()).pathname, 'a 500 on refresh evicted the operator').toBe('/audit-log');
  const hint = (await page.context().cookies()).find((c) => c.name.includes('session_hint'));
  expect(hint?.value, 'the session marker was wiped by an unreachable refresh').toBeTruthy();
  await page.unroute('**/*admin/auth/refresh*').catch(() => null);
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // ── Recovery: the same session renews once the API answers ───────────────
  await page.goto('/clients');
  await expect(
    page.getByRole('heading', { name: 'Clients', exact: true }),
    'the session did not recover once the API was back',
  ).toBeVisible();

  // ── A dropped connection ─────────────────────────────────────────────────
  const dropped = await routeHit(page, '/admin/auth/refresh', (route) => route.abort('failed'));
  await deleteCookie(page.context(), /_at$/);
  await page.goto('/roles');
  await expect
    .poll(() => dropped.hits(), {
      timeout: 15_000,
      message: 'the injected network failure never fired',
    })
    .toBeGreaterThan(0);
  expect(new URL(page.url()).pathname, 'a network blip on refresh evicted the operator').toBe(
    '/roles',
  );
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // ── The contrast case: a REAL 401 is a dead session and must evict ───────
  const refused = await routeHit(page, '/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 401, code: 'SESSION_REVOKED', message: 'revoked' }),
    }),
  );
  await deleteCookie(page.context(), /_at$/);
  // Eviction is a hard navigation; goto can see its own load aborted.
  await page.goto('/clients').catch(() => null);
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  expect(refused.hits(), 'the injected 401 never fired').toBeGreaterThan(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('suspension revokes the session — reactivation does not resurrect it', async ({ browser }) => {
  test.setTimeout(300_000);
  const master = await adminApiSession();
  try {
    // A fresh admin whose session we can kill without touching any fixture.
    const invited = await master.post('/admin/invite', {
      email: `e2e-susprevoke-${run}@oxshare-e2e.test`,
      name: 'E2E Suspend Revoke',
      permissions: ['clients.view'],
    });
    expect(invited.ok()).toBe(true);
    const token = new URL(
      ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
    ).searchParams.get('token')!;
    const accepted = await acceptAdminInvite(token, `Susprevoke-${run}-123!`);

    const ctx = await browser.newContext({ storageState: await browserStateFrom(accepted.ctx) });
    const page = await ctx.newPage();
    try {
      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /clients/i }).first()).toBeVisible();

      // Suspend, then IMMEDIATELY reactivate — the window the fix closes.
      const suspended = await master.patch(`/admin/users/${accepted.id}/status`, {
        status: 'suspended',
      });
      expect(
        suspended.ok(),
        `suspend answered ${suspended.status()}: ${await suspended.text()}`,
      ).toBe(true);
      expect(
        (await master.patch(`/admin/users/${accepted.id}/status`, { status: 'active' })).ok(),
      ).toBe(true);

      // The ACCOUNT is active again; this browser's session must still be dead.
      await page.goto('/clients').catch(() => null);
      await page.waitForURL(/\/login/, { timeout: 20_000 });
    } finally {
      await ctx.close();
      await accepted.ctx.dispose();
      await master.patch(`/admin/users/${accepted.id}/status`, { status: 'suspended' });
    }
  } finally {
    await master.dispose();
  }
});

test('accepting an invite ends the session it displaces — everywhere', async ({ browser }) => {
  test.setTimeout(300_000);
  const master = await adminApiSession();
  try {
    // Admin A: signed in, and a SNAPSHOT of their cookies taken — the second
    // tab / second browser their session used to survive in.
    const invitedA = await master.post('/admin/invite', {
      email: `e2e-displaced-${run}@oxshare-e2e.test`,
      name: 'E2E Displaced',
      permissions: ['clients.view'],
    });
    const tokenA = new URL(
      ((await invitedA.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
    ).searchParams.get('token')!;
    const adminA = await acceptAdminInvite(tokenA, `Displaced-${run}-123!`);
    const snapshotOfA = await browserStateFrom(adminA.ctx);

    // Admin B's invite, accepted IN A BROWSER THAT HOLDS A's SESSION.
    const invitedB = await master.post('/admin/invite', {
      email: `e2e-displacer-${run}@oxshare-e2e.test`,
      name: 'E2E Displacer',
      permissions: ['clients.view'],
    });
    const tokenB = new URL(
      ((await invitedB.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
    ).searchParams.get('token')!;

    const ctx = await browser.newContext({ storageState: snapshotOfA });
    const page = await ctx.newPage();
    let displacerId = '';
    try {
      await page.goto(`/invite/accept?token=${encodeURIComponent(tokenB)}`);
      await page.locator('#new-password').fill(`Displacer-${run}-123!`);
      await page.locator('#confirm-password').fill(`Displacer-${run}-123!`);
      const [acceptedB] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/admin/invite/accept') && r.request().method() === 'POST',
        ),
        page.getByRole('button', { name: /activate/i }).click(),
      ]);
      expect(acceptedB.status(), 'accepting while signed in failed').toBe(200);
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      displacerId = (
        (await (await ctx.request.get(`${API_NODE_BASE}/admin/auth/me`)).json()) as { id: string }
      ).id;

      // The displaced session is dead EVERYWHERE: a context restored from the
      // pre-accept snapshot must meet the sign-in form, not the console.
      const revived = await browser.newContext({ storageState: snapshotOfA });
      const revivedPage = await revived.newPage();
      try {
        await revivedPage.goto('/clients').catch(() => null);
        await revivedPage.waitForURL(/\/login/, { timeout: 20_000 });
      } finally {
        await revived.close();
      }
    } finally {
      await ctx.close();
      await adminA.ctx.dispose();
      await master.patch(`/admin/users/${adminA.id}/status`, { status: 'suspended' });
      if (displacerId) {
        await master.patch(`/admin/users/${displacerId}/status`, { status: 'suspended' });
      }
    }
  } finally {
    await master.dispose();
  }
});

test('a completed password reset reaches a live browser immediately', async ({ browser }) => {
  test.setTimeout(300_000);
  const master = await adminApiSession();
  try {
    const email = `e2e-resetlive-${run}@oxshare-e2e.test`;
    const invited = await master.post('/admin/invite', {
      email,
      name: 'E2E Reset Live',
      permissions: ['clients.view'],
    });
    const token = new URL(
      ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
    ).searchParams.get('token')!;
    const target = await acceptAdminInvite(token, `Resetlive-${run}-123!`);

    const ctx = await browser.newContext({ storageState: await browserStateFrom(target.ctx) });
    const page = await ctx.newPage();
    try {
      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /clients/i }).first()).toBeVisible();

      // The master arms the reset; the recipient completes it via the mail.
      expect((await master.post(`/admin/users/${target.id}/password-reset`)).ok()).toBe(true);
      const mail = await waitForMail(email, { subject: /reset|password/i });
      const link = linkIn(mail, APP_ORIGIN);
      const anonymous = await request.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const resetToken = new URL(link).searchParams.get('token')!;
        const completed = await anonymous.post(`${API_NODE_BASE}/admin/password-reset/complete`, {
          headers: { Origin: APP_ORIGIN },
          data: { token: resetToken, password: `Resetlive-after-${run}-123!` },
        });
        expect(completed.ok(), `completing answered ${completed.status()}`).toBe(true);
      } finally {
        await anonymous.dispose();
      }

      // The very next navigation — minutes inside the access token's life —
      // must land on sign-in. Family revocation plus the passwordChangedAt
      // cutoff both point the same way; this is the operator's view of it.
      await page.goto('/clients').catch(() => null);
      await page.waitForURL(/\/login/, { timeout: 20_000 });
    } finally {
      await ctx.close();
      await target.ctx.dispose();
      await master.patch(`/admin/users/${target.id}/status`, { status: 'suspended' });
    }
  } finally {
    await master.dispose();
  }
});

/*
 * ⚠️ THE TWO RACE TESTS BELOW MINT THEIR OWN ADMIN, and must keep doing so.
 *
 * They deliberately fire concurrent refreshes at ONE rotating cookie. That is
 * exactly the situation the storage-state jar cannot survive: the token
 * rotates two or three times inside the browser while the file on disk still
 * holds an earlier one, so the NEXT spec to load the shared jar presents a
 * token that has already been rotated away — reuse detection destroys the
 * family, and every console page after it renders the sign-in form. It cost a
 * full sweep exactly once, and the symptom (a dozen unrelated pages failing an
 * accessibility check on the login page's password toggle) points nowhere near
 * the cause.
 *
 * A dedicated identity contains the blast radius to the test that lit it.
 */
async function raceAdmin(): Promise<{
  state: Awaited<ReturnType<typeof browserStateFrom>>;
  cleanup: () => Promise<void>;
}> {
  const master = await adminApiSession();
  const invited = await master.post('/admin/invite', {
    email: `e2e-race-${Date.now()}@oxshare-e2e.test`,
    name: 'E2E Refresh Race',
    permissions: ['clients.view'],
  });
  expect(invited.ok(), `invite answered ${invited.status()}`).toBe(true);
  const token = new URL(
    ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
  ).searchParams.get('token')!;
  const racer = await acceptAdminInvite(token, `Race-${Date.now()}-123!`);

  return {
    state: await browserStateFrom(racer.ctx),
    cleanup: async () => {
      await master.patch(`/admin/users/${racer.id}/status`, { status: 'suspended' });
      await racer.ctx.dispose();
      await master.dispose();
    },
  };
}

test('three tabs waking together all stay signed in', async ({ browser }) => {
  test.setTimeout(180_000);
  const racer = await raceAdmin();
  const context = await browser.newContext({ storageState: racer.state });
  const page = await context.newPage();
  /*
   * The fleet race the cross-tab lock + SESSION_SUPERSEDED retry exist for: a
   * laptop wakes with three console tabs, every tab's access token lapsed,
   * and all three refresh the same rotating cookie at once. Exactly one
   * rotation may win; the losers must retry against the winner's cookies and
   * NOBODY may be evicted.
   */
  await page.goto('/dashboard');
  const tab2 = await context.newPage();
  const tab3 = await context.newPage();
  await tab2.goto('/clients');
  await tab3.goto('/roles');

  await deleteCookie(context, /_at$/);

  await Promise.all([page.goto('/audit-log'), tab2.goto('/tags'), tab3.goto('/admin-users')]);

  for (const [tab, path] of [
    [page, '/audit-log'],
    [tab2, '/tags'],
    [tab3, '/admin-users'],
  ] as const) {
    expect(
      new URL(tab.url()).pathname,
      `a tab lost the wake-up race and was evicted (expected ${path})`,
    ).toBe(path);
  }
  await tab2.close();
  await tab3.close();
  await context.close();
  await racer.cleanup();
});

test('two tabs racing WITHOUT Web Locks still both survive', async ({ browser }) => {
  test.setTimeout(180_000);
  /*
   * session-channel degrades to NO lock when navigator.locks is unavailable
   * (older Safari, some embedded webviews). The refresh race then lands raw
   * on the backend, whose 30s retry grace + SESSION_SUPERSEDED retry must
   * absorb it end to end — this is the only place that combination is proven.
   */
  const racer = await raceAdmin();
  const ctx = await browser.newContext({ storageState: racer.state });
  await ctx.addInitScript(() => {
    // Simulate a browser with no Web Locks API, before any app script runs.
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  try {
    await a.goto('/dashboard');
    await b.goto('/clients');
    await deleteCookie(ctx, /_at$/);
    await Promise.all([a.goto('/roles'), b.goto('/tags')]);
    expect(new URL(a.url()).pathname, 'tab A evicted without Web Locks').toBe('/roles');
    expect(new URL(b.url()).pathname, 'tab B evicted without Web Locks').toBe('/tags');
  } finally {
    await ctx.close();
  }
  await ctx.close();
  await racer.cleanup();
});

test('the invite MODAL grants exactly the territory it shows', async ({ page }) => {
  test.setTimeout(150_000);
  /*
   * Slice 3's browser proof: the whole arc through the real screen. The
   * master scopes an invite to one tag from the modal; the invitee accepts in
   * a CLEAN context; their very first reads show exactly that territory —
   * their tag plus the default intake pool, and no foreign-tagged client.
   */
  const email = `e2e-modalscope-${run}@oxshare-e2e.test`;
  const master = await adminApiSession();
  try {
    await page.goto('/admin-users');
    await page.getByRole('button', { name: 'Invite Admin' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'the invite modal did not open').toBeVisible();
    await dialog.locator('#invite-name').fill('E2E Modal Scope');
    await dialog.locator('#invite-email').fill(email);
    // A role is required — without one the form's own validation swallows the
    // submit and no request ever leaves the page.
    await dialog.locator('#invite-role').click();
    await page
      .getByRole('option', { name: /e2e restricted/i })
      .first()
      .click();
    // Territory: pick the e2e-beta tag, and require the CHIP to appear before
    // submitting — the proof the choice registered.
    await dialog.getByRole('combobox', { name: /add a tag/i }).click();
    await page.getByRole('option', { name: /e2e beta/i }).click();
    await expect(dialog.getByText('E2E Beta').first()).toBeVisible();
    const [created] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/admin/invite') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: /send invite/i }).click(),
    ]);
    expect(created.ok(), `the modal invite failed: ${created.status()}`).toBe(true);
    const inviteUrl = ((await created.json()) as { inviteUrl?: string }).inviteUrl;
    expect(inviteUrl, 'no invite link echoed in dev').toBeTruthy();

    const invitee = await acceptAdminInvite(
      new URL(inviteUrl!).searchParams.get('token')!,
      `Modalscope-${run}-123!`,
    );
    try {
      /*
       * Membership by targeted SEARCH, never by scanning a page.
       *
       * This asked for `limit=200` and read the answer as the whole list. The
       * API caps a page at 100 (`Math.min(100, …)`, the convention everywhere),
       * so it silently received a WINDOW — and the e2e-minted clients that every
       * run leaves behind had grown to 99 of those 100 rows, pushing the seeded
       * fixtures off the end.
       *
       * The positive assertion failed, which is how this was found. The dangerous
       * one is the NEGATIVE: `not.toContain('Alpha Aardvark')` also passes when
       * Alpha has merely fallen off the page, so a genuine territory leak would
       * have been reported green. A search names the row it is asking about, and
       * cannot be satisfied by pagination.
       *
       * By NAME, not email: the chosen role masks `client.email`, so the email
       * column is (correctly) absent from every row this admin reads — which is
       * itself part of what this arc proves.
       */
      const visibleToInvitee = async (name: string): Promise<boolean> => {
        const found = await invitee.ctx.get(
          `${API_NODE_BASE}/admin/clients?limit=100&q=${encodeURIComponent(name)}`,
        );
        expect(found.ok(), `searching for ${name} answered ${found.status()}`).toBe(true);
        const items = (
          (await found.json()) as { items: { firstName?: string; lastName?: string }[] }
        ).items;
        return items.some((c) => `${c.firstName} ${c.lastName}` === name);
      };
      expect(
        await visibleToInvitee('Alpha Aardvark'),
        'the modal scope leaked a foreign-tagged client',
      ).toBe(false);
      expect(await visibleToInvitee('Delta Dunn'), 'the default intake grant is missing').toBe(
        true,
      );

      // And the mask reached the wire: no row carries an email for this admin.
      const rows = (
        (await (await invitee.ctx.get(`${API_NODE_BASE}/admin/clients?limit=100`)).json()) as {
          items: { email?: string }[];
        }
      ).items;
      expect(
        rows.every((c) => c.email === undefined),
        'the role mask did not reach the invited admin',
      ).toBe(true);
    } finally {
      await master.patch(`/admin/users/${invitee.id}/status`, { status: 'suspended' });
      await invitee.ctx.dispose();
    }
  } finally {
    await master.dispose();
  }
});
