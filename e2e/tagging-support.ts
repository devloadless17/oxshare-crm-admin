import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { resetAuthenticator, totp } from './authenticator';
import { API_NODE_BASE, APP_ORIGIN } from './helpers';

/**
 * What the live tagging specs share (`tagging-live`, `tagging-matrix`): signing
 * administrators in through the real authenticator flow, the API as one of
 * them, the portal's real sign-up form, and reading a client's tags.
 */

export const PORTAL = (process.env.E2E_PORTAL_ORIGIN ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

export type Tag = { id: string; slug: string; label: string };

/** Finish an authenticator challenge in `request` (a browser context's), enrolling afresh. */
export async function enrol(request: APIRequestContext, challengeToken: string): Promise<void> {
  const headers = { Origin: APP_ORIGIN };
  const setup = await request.post(`${API_NODE_BASE}/admin/auth/totp/setup`, {
    headers,
    data: { challengeToken },
  });
  expect(setup.ok(), `authenticator setup: ${setup.status()} ${await setup.text()}`).toBeTruthy();
  const { secret } = (await setup.json()) as { secret: string };
  const into = (Date.now() / 1000) % 30;
  if (into > 26) await new Promise((r) => setTimeout(r, (31 - into) * 1000));
  const verify = await request.post(`${API_NODE_BASE}/admin/auth/totp/verify`, {
    headers,
    data: { challengeToken, code: totp(secret) },
  });
  expect(verify.ok(), `authenticator code: ${verify.status()} ${await verify.text()}`).toBeTruthy();
}

/** Sign an existing administrator into a BROWSER context (cookies land in it). */
export async function signInAdmin(
  context: BrowserContext,
  who: { email: string; password: string },
): Promise<void> {
  resetAuthenticator(who.email);
  const login = await context.request.post(`${API_NODE_BASE}/admin/auth/login`, {
    headers: { Origin: APP_ORIGIN },
    data: who,
  });
  expect(login.ok(), `sign-in: ${login.status()}`).toBeTruthy();
  await enrol(context.request, ((await login.json()) as { challengeToken: string }).challengeToken);
}

/** The API, as the administrator signed into `context`. */
export async function api(context: BrowserContext) {
  const csrf = (await context.cookies()).find((c) => c.name.includes('admin_csrf'))?.value ?? '';
  const headers = { Origin: APP_ORIGIN, 'X-OxShare-CSRF': csrf };
  const r = context.request;
  return {
    get: async (p: string): Promise<unknown> =>
      (await r.get(`${API_NODE_BASE}${p}`, { headers })).json() as Promise<unknown>,
    raw: (p: string) => r.get(`${API_NODE_BASE}${p}`, { headers }),
    post: (p: string, data?: unknown, extra: Record<string, string> = {}) =>
      r.post(`${API_NODE_BASE}${p}`, { headers: { ...headers, ...extra }, data }),
    patch: (p: string, data?: unknown) => r.patch(`${API_NODE_BASE}${p}`, { headers, data }),
  };
}

/**
 * A NEW administrator, invited by `master` with exactly this territory and
 * enrolled through the real invite + authenticator flow, signed into a fresh
 * browser context.
 */
export async function inviteAdmin(
  browser: Browser,
  master: BrowserContext,
  who: {
    email: string;
    name: string;
    roleName: string;
    permissions: string[];
    scopedTagIds?: string[];
    seesAllClients?: boolean;
  },
): Promise<BrowserContext> {
  const a = await api(master);
  const role = (await (
    await a.post('/admin/roles', { name: who.roleName, permissions: who.permissions })
  ).json()) as { id: string };
  const inviteRes = await a.post('/admin/invite', {
    email: who.email,
    name: who.name,
    roleId: role.id,
    ...(who.scopedTagIds ? { scopedTagIds: who.scopedTagIds } : {}),
    ...(who.seesAllClients !== undefined ? { seesAllClients: who.seesAllClients } : {}),
  });
  expect(
    inviteRes.ok(),
    `invite ${who.email}: ${inviteRes.status()} ${await inviteRes.text()}`,
  ).toBeTruthy();
  const invite = (await inviteRes.json()) as { inviteUrl?: string };
  const token = new URL(invite.inviteUrl!).searchParams.get('token')!;
  const context = await browser.newContext({ baseURL: APP_ORIGIN });
  const accepted = await context.request.post(`${API_NODE_BASE}/admin/invite/accept`, {
    headers: { Origin: APP_ORIGIN },
    data: { token, password: 'Matrix-password-123' },
  });
  expect(accepted.ok(), `accept invite: ${accepted.status()}`).toBeTruthy();
  await enrol(
    context.request,
    ((await accepted.json()) as { challengeToken: string }).challengeToken,
  );
  return context;
}

/** A screenshot for reviewing the experience by eye (test-results/, not committed). */
export async function shot(page: Page, name: string, focus?: Locator): Promise<void> {
  await focus?.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/tagging-shots/${name}.png`, fullPage: false });
}

/** Pick a client's row on the clients list (the row toggle is a pressed button). */
export async function selectRow(page: Page, email: string): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: email });
  const toggle = row.getByRole('button', { name: /select this row|deselect this row/i });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

/** A client's tag labels, sorted, as an administrator who sees them reads them. */
export async function tagsOf(context: BrowserContext, email: string): Promise<string[]> {
  const a = await api(context);
  const page = (await a.get(`/admin/clients?q=${encodeURIComponent(email)}`)) as {
    items: { email: string; tags: Tag[] }[];
  };
  const row = page.items.find((c) => c.email === email);
  return (row?.tags ?? []).map((t) => t.label).sort();
}

/** The portal's two-step sign-up, through the real form. */
export async function signUpOnPortal(
  page: Page,
  entry: string,
  email: string,
  country: string,
  nationality: string,
): Promise<void> {
  await page.goto(`${PORTAL}${entry}`);
  await expect(page).toHaveURL(/\/auth\/register/);
  await page.getByPlaceholder('John').fill('Tagging');
  await page.getByPlaceholder('Doe').fill('Live');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.locator('input[type="password"]').first().fill('Client-password-123');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByLabel(/date of birth/i).fill('1990-04-12');
  await page.getByRole('combobox', { name: /nationality/i }).click();
  await page.getByRole('option', { name: nationality, exact: true }).click();
  await page.getByRole('combobox', { name: /country of residence/i }).click();
  await page.getByRole('option', { name: country, exact: true }).click();
  // A valid, unique national number for the chosen country (the dial code is set by it).
  const tail = String(Date.now()).slice(-7);
  await page
    .getByLabel('Phone number')
    .fill(country === 'Egypt' ? `101${tail}` : `71${tail.slice(-6)}`);
  await page.getByLabel(/^city/i).fill('Beirut');
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/register') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /complete registration|create account/i }).click(),
  ]);
  expect(res.status(), `sign-up: ${await res.text()}`).toBe(201);
}
