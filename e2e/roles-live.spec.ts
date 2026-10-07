import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { acceptAdminInvite, adminApiSession, API_NODE_BASE, APP_ORIGIN, signIn } from './helpers';
import { completeAuthenticator } from './authenticator';

/**
 * ROLES, INVITES AND PERMISSIONS — LIVE, the way the buyer drives them (Oct 2026).
 *
 * He configured staff roles and reported two things the console did wrong (one
 * key opening five Introducing-broker pages; "View trading accounts" showing
 * MT5 groups) and an "invalid token" after editing a role or an invite. Every
 * step here is the real console against the real API:
 *
 *   1. build a Sales role in the editor — the menu preview, auto-ticking a
 *      page with its action, turning a page off taking its actions with it;
 *   2. invite an employee onto it from Admin users, accept in their own
 *      browser, enrol the authenticator, land on exactly the Sales menu;
 *   3. a role edited while the invite is pending applies on acceptance;
 *   4. edit the role and reassign the employee — every change lands on their
 *      NEXT request, and they stay signed in (no "invalid token");
 *   5. a role manager cannot escalate: grant what they lack, touch a role above
 *      them, or edit their own;
 *   6. a role with holders cannot be deleted;
 *   7. accepting an invite on a browser where somebody is signed in ENDS that
 *      person's session — after a warning. That is the designed behaviour, and
 *      the likeliest source of the buyer's "invalid token".
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now() % 1_000_000;
const SALES = `E2E Sales ${run}`;
const SUPPORT = `E2E Support ${run}`;
const employee = {
  email: `e2e-rolelive-sales-${run}@oxshare-e2e.test`,
  password: `Sales-live-${run}-pass!`,
};

let master: Awaited<ReturnType<typeof adminApiSession>>;
let salesRoleId = '';
let inviteUrl = '';
let staff: Page;

const sidebar = (page: Page) => page.locator('aside nav').first();
const pageLinks = async (page: Page): Promise<string[]> => {
  // The sidebar renders once /admin/auth/me answers; wait for it, then read.
  await expect(sidebar(page).locator('a[href="/dashboard"]')).toBeAttached({ timeout: 60_000 });
  return sidebar(page)
    .locator('a[href^="/"]')
    .evaluateAll((as) => as.map((a) => (a.getAttribute('href') ?? '').split('?')[0] ?? ''));
};

/** The row holding `text`, walking the table's pages (paging is client-side). */
async function rowAcrossPages(page: Page, text: string) {
  await expect.poll(() => page.locator('tbody tr').count(), { timeout: 30_000 }).toBeGreaterThan(0);
  const row = page.getByRole('row').filter({ hasText: text });
  for (let hop = 0; hop < 20 && (await row.count()) === 0; hop += 1) {
    const next = page.getByRole('button', { name: /^next$/i });
    if ((await next.count()) === 0 || (await next.isDisabled())) break;
    const before = await page.locator('tbody tr').first().textContent();
    await next.click();
    await expect
      .poll(() => page.locator('tbody tr').first().textContent(), { timeout: 5_000 })
      .not.toBe(before);
  }
  await expect(row, `${text} is not in the table`).toBeVisible();
  return row;
}

async function roleId(name: string): Promise<string> {
  const roles = (await (await master.get('/admin/roles')).json()) as { id: string; name: string }[];
  return roles.find((r) => r.name === name)?.id ?? '';
}

async function freshBrowser(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: APP_ORIGIN,
    storageState: { cookies: [], origins: [] },
  });
  return ctx.newPage();
}

test.beforeAll(async () => {
  master = await adminApiSession();
});

test.afterAll(async () => {
  await master?.dispose();
});

test('1. the role editor builds the Sales role the buyer asked for', async ({ page }) => {
  await page.goto('/roles/new');
  await page.locator('#role-name').fill(SALES);

  const tick = (label: string) => page.locator('label').filter({ hasText: label }).first().click();
  const box = (key: string) => page.locator(`#perm-${key.replace(/\./g, '\\.')}`);

  // Ticking an ACTION brings the page it is taken on.
  await tick('Approve deposits and credit the wallet');
  await expect(box('deposits.view')).toBeChecked();
  // Turning the page off takes the action with it — and says so.
  await tick('See deposit requests');
  await expect(box('deposits.approve')).not.toBeChecked();
  await expect(page.getByRole('status')).toContainText('Approve deposits and credit the wallet');

  for (const label of [
    'See clients and their profiles',
    'See trading accounts',
    'See partners',
    'See partner applications',
    'See referrals',
    'See commission payouts',
  ]) {
    await tick(label);
  }

  // The preview is the real sidebar filter: exactly the buyer's menu.
  const preview = page.locator('aside').filter({ hasText: 'Menu preview' });
  for (const item of ['Trading accounts', 'Partners', 'Partner applications', 'Referrals']) {
    await expect(preview.getByText(item, { exact: true })).toBeVisible();
  }
  for (const item of ['Partner levels', 'Commission types', 'MT5 groups', 'Trading']) {
    await expect(preview.getByText(item, { exact: true })).toHaveCount(0);
  }

  await page
    .getByRole('button', { name: /create role|save/i })
    .last()
    .click();
  await page.waitForURL(/\/roles$/);
  salesRoleId = await roleId(SALES);
  expect(salesRoleId, 'the role was not created').not.toBe('');
  const row = await rowAcrossPages(page, SALES);
  await expect(row).toContainText('0 admins');
});

test('2. invite an employee onto it from Admin users', async ({ page }) => {
  await page.goto('/admin-users');
  await page.getByRole('button', { name: 'Invite Admin' }).click();
  await page.locator('#invite-name').fill('E2E Sales Live');
  await page.locator('#invite-email').fill(employee.email);
  await page.locator('#invite-role').click();
  await page.getByRole('option', { name: SALES }).click();
  // The picker says what the role IS, not just its name.
  await expect(page.getByText(/pages? in their menu/)).toBeVisible();
  await page.getByRole('button', { name: 'Send invite' }).click();
  const link = page.locator('code').filter({ hasText: '/invite/accept?token=' });
  await expect(link).toBeVisible();
  inviteUrl = (await link.textContent())!.trim();
});

test('3. a role edited while the invite is pending applies on acceptance', async () => {
  const roles = (await (await master.get('/admin/roles')).json()) as {
    id: string;
    permissions: string[];
  }[];
  const current = roles.find((r) => r.id === salesRoleId)!.permissions;
  const res = await master.put(`/admin/roles/${salesRoleId}`, {
    permissions: [...current, 'kyc.view'],
  });
  expect(res.status(), await res.text()).toBe(200);
});

test('4. the employee accepts in THEIR browser and gets exactly the Sales menu', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  staff = await freshBrowser(browser);
  await staff.goto(inviteUrl);
  // No one is signed in here, so there is no "you will be signed out" warning.
  await expect(staff.getByRole('alert').filter({ hasText: /signed in/i })).toHaveCount(0);
  await staff.getByLabel('New Password').fill(employee.password);
  await staff.getByLabel('Confirm Password').fill(employee.password);
  await staff.getByRole('button', { name: 'Activate Account' }).click();
  await completeAuthenticator(staff, employee.email);
  await expect(staff).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  const links = await pageLinks(staff);
  for (const href of ['/clients', '/kyc', '/trading-accounts', '/partners', '/approvals/ib']) {
    expect(links, `missing ${href}`).toContain(href);
  }
  for (const href of ['/ib-levels', '/commission-types', '/mt5-groups', '/products', '/roles']) {
    expect(links, `should not offer ${href}`).not.toContain(href);
  }
  await expect(sidebar(staff).getByRole('button', { name: /^trading pages/i })).toHaveCount(0);

  // A typed URL is refused, naming the page; the API refuses too.
  await staff.goto('/ib-levels');
  await expect(
    staff.getByText('Your role does not include Partner levels.', { exact: false }),
  ).toBeVisible();
  await staff.goto('/mt5-groups');
  await expect(staff.getByText(/does not include MT5 groups/)).toBeVisible();
  expect((await staff.request.get(`${API_NODE_BASE}/admin/ib-levels`)).status()).toBe(403);
  expect((await staff.request.get(`${API_NODE_BASE}/admin/mt5-groups`)).status()).toBe(403);
  expect((await staff.request.get(`${API_NODE_BASE}/admin/ib/partners`)).status()).toBe(200);
});

test('5. editing the role lands on the next request, and nobody is signed out', async () => {
  const roles = (await (await master.get('/admin/roles')).json()) as {
    id: string;
    permissions: string[];
  }[];
  const current = roles.find((r) => r.id === salesRoleId)!.permissions;
  const next = [...current.filter((k) => k !== 'kyc.view'), 'ib.levels.view'];
  expect((await master.put(`/admin/roles/${salesRoleId}`, { permissions: next })).status()).toBe(
    200,
  );

  expect((await staff.request.get(`${API_NODE_BASE}/admin/ib-levels`)).status()).toBe(200);
  expect((await staff.request.get(`${API_NODE_BASE}/admin/kyc`)).status()).toBe(403);
  // Still signed in — the edit did not invalidate the session.
  expect((await staff.request.get(`${API_NODE_BASE}/admin/auth/me`)).status()).toBe(200);
  await staff.reload();
  await staff.goto('/dashboard');
  await expect(staff).toHaveURL(/\/dashboard/);
  const links = await pageLinks(staff);
  expect(links).toContain('/ib-levels');
  expect(links).not.toContain('/kyc');
});

test('6. reassigning the employee to another role, from Admin users', async ({ page }) => {
  const created = await master.post('/admin/roles', {
    name: SUPPORT,
    permissions: ['clients.view'],
  });
  expect(created.status(), await created.text()).toBe(201);

  await page.goto('/admin-users');
  const row = await rowAcrossPages(page, employee.email);
  await row.getByRole('button', { name: /actions for/i }).click();
  await page.getByRole('menuitem', { name: /^edit/i }).click();
  await page.locator('#admin-source').click();
  await page.getByRole('option', { name: SUPPORT }).click();
  await page.getByRole('button', { name: /^save/i }).click();
  await expect(row).toContainText(SUPPORT);

  // The employee's next request follows the new role; their session survives.
  expect((await staff.request.get(`${API_NODE_BASE}/admin/auth/me`)).status()).toBe(200);
  expect((await staff.request.get(`${API_NODE_BASE}/admin/ib/partners`)).status()).toBe(403);
  await staff.goto('/dashboard');
  await expect(staff).toHaveURL(/\/dashboard/);
  const links = await pageLinks(staff);
  expect(links).toContain('/clients');
  expect(links).not.toContain('/partners');
});

test('7. a role with holders cannot be deleted; an empty one can', async () => {
  const supportId = await roleId(SUPPORT);
  const refused = await master.del(`/admin/roles/${supportId}`);
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toMatch(/assigned to 1 admin/);
  expect((await master.del(`/admin/roles/${salesRoleId}`)).status()).toBe(200);
});

test('8. a role manager cannot escalate — from a real limited session', async ({ browser }) => {
  test.setTimeout(240_000);
  const managerRole = await master.post('/admin/roles', {
    name: `E2E RoleMgr ${run}`,
    permissions: ['roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'clients.view'],
  });
  expect(managerRole.status()).toBe(201);
  const managerRoleId = ((await managerRole.json()) as { id: string }).id;
  const email = `e2e-rolelive-mgr-${run}@oxshare-e2e.test`;
  const invited = await master.post('/admin/invite', {
    email,
    name: 'E2E Role Manager',
    roleId: managerRoleId,
  });
  const token = new URL(
    ((await invited.json()) as { inviteUrl: string }).inviteUrl,
  ).searchParams.get('token')!;
  const mgr = await acceptAdminInvite(token, `Mgr-live-${run}-pass!`);
  const as = (method: 'post' | 'put' | 'delete', path: string, data?: unknown) =>
    mgr.ctx[method](`${API_NODE_BASE}${path}`, { headers: mgr.headers, data });

  // Grant a key they do not hold — refused, naming it.
  const mint = await as('post', '/admin/roles', {
    name: `E2E Escalate ${run}`,
    permissions: ['clients.view', 'wallets.credit'],
  });
  expect(mint.status()).toBe(403);
  expect(await mint.text()).toMatch(/wallets\.credit/);
  // Their OWN role — refused, even downward.
  expect(
    (await as('put', `/admin/roles/${managerRoleId}`, { permissions: ['roles.view'] })).status(),
  ).toBe(403);
  // A role ABOVE them (Administrator is a system role; use a custom one).
  const above = await master.post('/admin/roles', {
    name: `E2E Above ${run}`,
    permissions: ['clients.view', 'wallets.view'],
  });
  const aboveId = ((await above.json()) as { id: string }).id;
  expect(
    (await as('put', `/admin/roles/${aboveId}`, { permissions: ['clients.view'] })).status(),
  ).toBe(403);
  expect((await as('delete', `/admin/roles/${aboveId}`)).status()).toBe(403);
  // Within their powers — allowed, and the requirement closure is applied.
  const ok = await as('post', '/admin/roles', {
    name: `E2E Within ${run}`,
    permissions: ['roles.edit'],
  });
  expect(ok.status()).toBe(201);
  expect(((await ok.json()) as { permissions: string[] }).permissions.sort()).toEqual([
    'roles.edit',
    'roles.view',
  ]);

  // And the screen says so before the API has to: the stronger role is marked.
  const page = await freshBrowser(browser);
  await signIn(page, { email, password: `Mgr-live-${run}-pass!` });
  await page.goto('/roles');
  const row = page.getByRole('row').filter({ hasText: `E2E Above ${run}` });
  await expect(row).toContainText('Beyond your access');
  await expect(row.getByRole('button', { name: /actions for/i })).toHaveCount(0);
  await page.goto('/roles/new');
  await expect(page.locator('#perm-wallets\\.credit')).toBeDisabled();
  await page.context().close();
  await mgr.ctx.dispose();
});

test('9. accepting an invite where someone is signed in ENDS their session — after a warning', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  /*
   * The DISPLACED admin is a throwaway one. Accepting ends EVERY session of the
   * person it displaces — so displacing the shared e2e admin, even from another
   * browser, signed out the whole suite after this spec (found by a full run).
   */
  const victim = {
    email: `e2e-rolelive-victim-${run}@oxshare-e2e.test`,
    password: `Victim-live-${run}-pass!`,
  };
  const victimInvite = await master.post('/admin/invite', {
    email: victim.email,
    name: 'E2E Victim',
    roleId: await roleId(SUPPORT),
  });
  const victimToken = new URL(
    ((await victimInvite.json()) as { inviteUrl: string }).inviteUrl,
  ).searchParams.get('token')!;
  await (await acceptAdminInvite(victimToken, victim.password)).ctx.dispose();
  const other = await freshBrowser(browser);
  await signIn(other, victim);
  const email = `e2e-rolelive-displace-${run}@oxshare-e2e.test`;
  const invited = await master.post('/admin/invite', {
    email,
    name: 'E2E Displacer',
    roleId: await roleId(SUPPORT),
  });
  const url = ((await invited.json()) as { inviteUrl: string }).inviteUrl;

  await other.goto(url);
  // The warning names who will be signed out.
  await expect(other.getByRole('alert').filter({ hasText: victim.email })).toBeVisible();
  await other.getByLabel('New Password').fill(`Displace-${run}-pass!`);
  await other.getByLabel('Confirm Password').fill(`Displace-${run}-pass!`);
  await other.getByRole('button', { name: 'Activate Account' }).click();
  await completeAuthenticator(other, email);
  await expect(other).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  // The browser is now the NEW admin's: the inviter's session there is gone.
  const me = (await (await other.request.get(`${API_NODE_BASE}/admin/auth/me`)).json()) as {
    email: string;
  };
  expect(me.email).toBe(email);
  await other.context().close();
});
