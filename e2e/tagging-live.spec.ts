import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { API_NODE_BASE, APP_ORIGIN, E2E_ADMIN, requirePrecondition } from './helpers';

/**
 * THE TAGGING SYSTEM, LIVE — every journey a person takes through it, in a real
 * browser against the real stack (backend 0193/0196/0198, 6 Oct 2026).
 *
 *   1. Country tags: the Countries tab, a country tag is named by its country
 *      and cannot be deleted, a client carries their own country.
 *   2. ONE sign-up link per administrator (0198): `/join/<their word>`, found
 *      on Profile, in the account menu and on Admin users. A client arriving
 *      through it gets the administrator's tags AS THEY ARE THEN — change the
 *      territory and the next sign-up follows it — never a country. Renaming
 *      the word retires the old link; an unknown word never blocks a sign-up.
 *   3. Partner inheritance: a client signing up under a partner gets the
 *      partner's chosen tags — never the partner's country.
 *   4. The clients list: several tags at once; bulk add, replace and remove;
 *      "select all matching"; export selected; a desk handing clients over is
 *      ASKED first.
 *
 * LOCAL ONLY. Since 0191 every administrator signs in with an authenticator, so
 * this spec enrols its admins itself: it clears their authenticator in the DEV
 * database (E2E_DB_EXEC, default `docker exec oxshare-postgres psql …`) and
 * enrols through the real API. No network route can reset an authenticator —
 * on purpose. Skipped where that database is not reachable.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const PORTAL = (process.env.E2E_PORTAL_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '');
/**
 * `E2E_TAGGING_RESUME=<run>` reuses an earlier run's clients and tags and skips
 * the three sign-ups — sign-up is capped at ten an hour per IP, so iterating on
 * the later journeys must not spend that budget. A full run sets nothing.
 */
const RESUME = process.env.E2E_TAGGING_RESUME;
const run = RESUME ? Number(RESUME) : Date.now() % 1_000_000;
const DESK = {
  email: `tag-desk-${run}@oxshare-e2e.test`,
  password: 'Desk-password-123',
};

function psql(sql: string): string {
  const cmd = (
    process.env.E2E_DB_EXEC ?? 'docker exec -i oxshare-postgres psql -U oxshare -d oxshare -tA'
  ).split(' ');
  const [bin = 'docker', ...args] = cmd;
  return execFileSync(bin, [...args, '-c', sql], { encoding: 'utf8' }).trim();
}
let dbReachable = true;
try {
  psql('select 1');
} catch {
  dbReachable = false;
}

/** RFC 6238, SHA-1, 6 digits, 30-second steps — what the API checks. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Finish an authenticator challenge in `request` (a browser context's), enrolling afresh. */
async function enrol(request: APIRequestContext, challengeToken: string): Promise<void> {
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

/** Sign an administrator into a BROWSER context (cookies land in it). */
async function signInAdmin(context: BrowserContext, who: { email: string; password: string }) {
  psql(
    `UPDATE admins SET totp_secret=NULL, totp_pending_secret=NULL, totp_enabled_at=NULL, totp_last_step=NULL WHERE email='${who.email}'`,
  );
  const login = await context.request.post(`${API_NODE_BASE}/admin/auth/login`, {
    headers: { Origin: APP_ORIGIN },
    data: who,
  });
  expect(login.ok(), `sign-in: ${login.status()}`).toBeTruthy();
  await enrol(context.request, ((await login.json()) as { challengeToken: string }).challengeToken);
}

/** The API, as the administrator signed into `context`. */
async function api(context: BrowserContext) {
  const csrf = (await context.cookies()).find((c) => c.name.includes('admin_csrf'))?.value ?? '';
  const headers = { Origin: APP_ORIGIN, 'X-OxShare-CSRF': csrf };
  const r = context.request;
  return {
    get: async (p: string): Promise<unknown> =>
      (await r.get(`${API_NODE_BASE}${p}`, { headers })).json() as Promise<unknown>,
    post: (p: string, data?: unknown, extra: Record<string, string> = {}) =>
      r.post(`${API_NODE_BASE}${p}`, { headers: { ...headers, ...extra }, data }),
    patch: (p: string, data?: unknown) => r.patch(`${API_NODE_BASE}${p}`, { headers, data }),
  };
}

type Tag = { id: string; slug: string; label: string; countryCode?: string };

/** A screenshot for reviewing the experience by eye (test-results/, not committed). */
async function shot(page: Page, name: string, focus?: Locator): Promise<void> {
  await focus?.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/tagging-shots/${name}.png`, fullPage: false });
}

/** Pick a client's row on the clients list (the row toggle is a pressed button). */
async function selectRow(page: Page, email: string): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: email });
  const toggle = row.getByRole('button', { name: /select this row|deselect this row/i });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

async function tagsOf(context: BrowserContext, email: string): Promise<string[]> {
  const a = await api(context);
  const page = (await a.get(`/admin/clients?q=${encodeURIComponent(email)}`)) as {
    items: { email: string; tags: Tag[] }[];
  };
  const row = page.items.find((c) => c.email === email);
  return (row?.tags ?? []).map((t) => t.label).sort();
}

/** The portal's two-step sign-up, through the real form. */
async function signUpOnPortal(
  page: Page,
  entry: string,
  email: string,
  country: string,
  nationality: string,
) {
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
  // A valid national number for the chosen country (the dial code is set by it).
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

let master: BrowserContext;
let masterPage: Page;
/** The desk administrator: territory = the owner tag; their link is what visitors follow. */
let desk: BrowserContext;
let deskPage: Page;
let deskSlug = '';
let ownerTag: Tag;
let otherTag: Tag;
let extraTag: Tag;
const viaLink = `tag-link-${run}@oxshare-e2e.test`;
const viaDead = `tag-dead-${run}@oxshare-e2e.test`;
const viaPartner = `tag-partner-${run}@oxshare-e2e.test`;
const viaMoved = `tag-moved-${run}@oxshare-e2e.test`;
const viaRetired = `tag-retired-${run}@oxshare-e2e.test`;

/** The "My sign-up link" panel on the signed-in administrator's Profile. */
function signupPanel(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'My sign-up link' }) });
}

test.beforeAll(async ({ browser }) => {
  requirePrecondition(
    !dbReachable,
    'the dev database is not reachable — this spec enrols authenticators through it',
  );
  master = await browser.newContext({ baseURL: APP_ORIGIN });
  await signInAdmin(master, E2E_ADMIN);
  masterPage = await master.newPage();
  const a = await api(master);
  const tagNamed = async (label: string): Promise<Tag> => {
    if (RESUME) {
      const all = (await a.get('/admin/tags')) as Tag[];
      const found = all.find((t) => t.label === label);
      if (!found) throw new Error(`E2E_TAGGING_RESUME=${run}: no tag "${label}"`);
      return found;
    }
    return (await (await a.post('/admin/tags', { label })).json()) as Tag;
  };
  ownerTag = await tagNamed(`OF ${run}`);
  otherTag = await tagNamed(`TN ${run}`);
  extraTag = await tagNamed(`VIP ${run}`);

  // Clipboard access: the desk copies its own link.
  desk = await browser.newContext({
    baseURL: APP_ORIGIN,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  if (RESUME) {
    // Put the earlier run's desk and clients back where a full run starts them.
    const deskId = `(SELECT id FROM admins WHERE email='${DESK.email}')`;
    psql(`UPDATE admins SET signup_slug='tag-desk-${run}' WHERE email='${DESK.email}'`);
    psql(`DELETE FROM admin_client_tag_scopes WHERE admin_id=${deskId}`);
    psql(
      `INSERT INTO admin_client_tag_scopes(admin_id, tag_id, created_by) SELECT id, '${ownerTag.id}', id FROM admins WHERE email='${DESK.email}'`,
    );
    psql(
      `DELETE FROM client_tag_assignments WHERE user_id IN (SELECT id FROM users WHERE email IN ('${viaLink}','${viaPartner}','${viaDead}'))`,
    );
    psql(
      `INSERT INTO client_tag_assignments(user_id, tag_id) SELECT id, '${ownerTag.id}' FROM users WHERE email='${viaLink}'`,
    );
    psql(
      `INSERT INTO client_tag_assignments(user_id, tag_id) SELECT id, '${extraTag.id}' FROM users WHERE email='${viaPartner}'`,
    );
    await signInAdmin(desk, DESK);
  } else {
    const role = (await (
      await a.post('/admin/roles', {
        name: `Tag desk ${run}`,
        permissions: ['clients.view', 'clients.tag', 'clients.bulk', 'tags.view'],
      })
    ).json()) as { id: string };
    const invite = (await (
      await a.post('/admin/invite', {
        email: DESK.email,
        name: `Tag Desk ${run}`,
        roleId: role.id,
        scopedTagIds: [ownerTag.id],
      })
    ).json()) as { inviteUrl?: string };
    const token = new URL(invite.inviteUrl!).searchParams.get('token')!;
    const accepted = await desk.request.post(`${API_NODE_BASE}/admin/invite/accept`, {
      headers: { Origin: APP_ORIGIN },
      data: { token, password: DESK.password },
    });
    expect(accepted.ok(), `accept invite: ${accepted.status()}`).toBeTruthy();
    await enrol(
      desk.request,
      ((await accepted.json()) as { challengeToken: string }).challengeToken,
    );
  }
  deskPage = await desk.newPage();
  deskSlug = ((await (await api(desk)).get('/admin/signup-links/me')) as { slug: string }).slug;
});

test.afterAll(async () => {
  await desk?.close();
  await master?.close();
});

test('1. country tags: their own tab, named by the country, never deleted', async () => {
  const page = masterPage;
  await page.goto('/tags');
  await page.getByRole('tab', { name: 'Countries' }).click();
  const lebanon = page.getByRole('row').filter({ hasText: 'Lebanon' }).first();
  await expect(lebanon).toBeVisible();
  await lebanon.getByRole('button', { name: /actions/i }).click();
  await expect(page.getByRole('menuitem', { name: /delete/i })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /edit/i }).click();
  await expect(page.locator('#tag-label')).toHaveAttribute('readonly', '');
  await expect(page.getByText(/named by its country/i)).toBeVisible();
  await shot(page, '01-country-tag-edit');
  await page.keyboard.press('Escape');
  // The business's own tags are on the other tab — and no country is.
  await page.getByRole('tab', { name: 'Tags' }).click();
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: /^Lebanon/ })).toHaveCount(0);
  await expect(page.getByText('country-lb')).toHaveCount(0);
});

test('2. every administrator HAS a link: the desk finds it on Profile, with the book it gives', async () => {
  // Made from the name when the account was — nobody had to create it.
  expect(deskSlug).toBe(`tag-desk-${run}`);
  const page = deskPage;
  await page.goto('/profile');
  const panel = signupPanel(page);
  const url = (await panel.locator('code').textContent())!.trim();
  expect(url).toMatch(new RegExp(`^${PORTAL}/join/${deskSlug}$`));
  // What the next sign-up gets: the desk's book — and nothing else.
  await expect(panel.getByText('Clients who sign up get:')).toBeVisible();
  await expect(panel.getByText(ownerTag.label, { exact: true })).toBeVisible();
  await expect(panel.getByRole('note')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Sign-up link copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await shot(page, '02-my-signup-link', panel);
});

test('3. a visitor through the desk’s link lands in the desk’s book, with their own country', async ({
  browser,
}) => {
  requirePrecondition(Boolean(RESUME), 'resuming an earlier run: no new sign-ups');
  // Typed back in capitals, as people retype a link they were told.
  const visitor = await browser.newContext();
  const vpage = await visitor.newPage();
  await signUpOnPortal(vpage, `/join/${deskSlug.toUpperCase()}`, viaLink, 'Lebanon', 'Lebanese');
  await visitor.close();
  expect(await tagsOf(master, viaLink)).toEqual(['Lebanon', ownerTag.label].sort());
  // Who brought them is recorded…
  expect(
    psql(
      `SELECT a.email FROM users u JOIN admins a ON a.id = u.signed_up_via_admin_id WHERE u.email='${viaLink}'`,
    ),
  ).toBe(DESK.email);
  // …and the desk's own panel counted it.
  await deskPage.goto('/profile');
  await expect(
    signupPanel(deskPage).getByText(/^1 signed up · 0 verified · 0 funded$/),
  ).toBeVisible();
});

test('4. an unknown link word never blocks a sign-up — the client gets their country only', async ({
  browser,
}) => {
  requirePrecondition(Boolean(RESUME), 'resuming an earlier run: no new sign-ups');
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await signUpOnPortal(page, '/join/nobody-has-this-word', viaDead, 'Egypt', 'Egyptian');
  await visitor.close();
  expect(await tagsOf(master, viaDead)).toEqual(['Egypt']);
});

test('5. under a partner: the partner’s chosen tags come along, never the partner’s country', async ({
  browser,
}) => {
  requirePrecondition(Boolean(RESUME), 'resuming an earlier run: no new sign-ups');
  const a = await api(master);
  const partnerId = psql(`SELECT user_id FROM ib_accounts WHERE referral_code='E2EPARTL1'`);
  await a.post(`/admin/clients/${partnerId}/tags/${extraTag.id}`);
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await signUpOnPortal(page, '/auth/register?ref=E2EPARTL1', viaPartner, 'Egypt', 'Egyptian');
  await visitor.close();
  const tags = await tagsOf(master, viaPartner);
  expect(tags).toContain(extraTag.label);
  expect(tags).toContain('Egypt');
});

test('6. the clients list filters by several tags at once — ANY of them', async () => {
  const page = masterPage;
  await page.goto('/clients');
  const picker = page.getByRole('combobox', { name: /all tags/i });
  await picker.fill(ownerTag.label);
  await page.getByRole('option', { name: new RegExp(ownerTag.label) }).click();
  // No wait for the URL between picks: two quick picks must both stay.
  await expect(
    page.getByRole('button', { name: new RegExp(`Remove ${ownerTag.label}`) }),
  ).toBeVisible();
  await picker.fill(extraTag.label);
  await page.getByRole('option', { name: new RegExp(extraTag.label) }).click();
  await expect(page).toHaveURL(
    new RegExp(`tag=${ownerTag.slug}%2C${extraTag.slug}|tag=${ownerTag.slug},${extraTag.slug}`),
  );
  await expect(page.getByText(viaLink)).toBeVisible();
  await expect(page.getByText(viaPartner)).toBeVisible();
  await expect(page.getByText(viaDead)).toHaveCount(0);
  await shot(page, '06-multi-tag-filter');
});

test('7. bulk: add a tag to the picked rows, then replace one tag with another', async () => {
  const page = masterPage;
  // Still filtered to the two clients from test 6.
  for (const email of [viaLink, viaPartner]) {
    await selectRow(page, email);
  }
  await expect(page.getByText(/2 rows selected/i)).toBeVisible();
  await page.getByRole('button', { name: 'Add tags' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/add tags to 2 clients/i)).toBeVisible();
  await shot(page, '07-bulk-add-dialog');
  await dialog.getByRole('combobox', { name: 'Tags' }).fill(otherTag.label);
  await page.getByRole('option', { name: otherTag.label }).click();
  await dialog.getByRole('button', { name: /apply to 2 clients/i }).click();
  await expect(page.getByText(/2 of 2 clients changed/i)).toBeVisible();
  expect(await tagsOf(master, viaLink)).toContain(otherTag.label);
  expect(await tagsOf(master, viaPartner)).toContain(otherTag.label);

  // Replace VIP with OF on the same two.
  for (const email of [viaLink, viaPartner]) await selectRow(page, email);
  await page.getByRole('button', { name: 'Replace tag' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Tags' }).fill(extraTag.label);
  await page.getByRole('option', { name: extraTag.label }).click();
  await dialog.getByRole('combobox', { name: 'Put on instead' }).fill(ownerTag.label);
  await page.getByRole('option', { name: ownerTag.label }).click();
  await dialog.getByRole('button', { name: /apply to 2 clients/i }).click();
  await expect(page.getByText(/clients changed/i).last()).toBeVisible();
  const partnerTags = await tagsOf(master, viaPartner);
  expect(partnerTags).toContain(ownerTag.label);
  expect(partnerTags).not.toContain(extraTag.label);
});

test('8. "select all matching" reaches the whole filter, and says how many', async () => {
  const page = masterPage;
  await page.goto('/clients?tag=country-lb');
  await page.getByRole('row').nth(1).waitFor();
  await page.getByRole('button', { name: /^select all$/i }).click();
  const all = page.getByRole('button', { name: /select all \d+ matching/i });
  await expect(all).toBeVisible();
  const total = Number((await all.textContent())!.match(/\d+/)![0]);
  await all.click();
  await expect(
    page.getByText(new RegExp(`all ${total} matching clients selected`, 'i')),
  ).toBeVisible();
  await shot(page, '08-all-matching-selected');
  await page.getByRole('button', { name: 'Add tags' }).click();
  await expect(
    page.getByRole('dialog').getByText(new RegExp(`add tags to ${total} clients`, 'i')),
  ).toBeVisible();
  // Look, don't touch: the dev database's real clients stay as they are.
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

test('9. export selected downloads exactly the picked clients', async () => {
  const page = masterPage;
  await page.goto(`/clients?tag=${ownerTag.slug}`);
  await selectRow(page, viaLink);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export selected' }).click(),
  ]);
  const csv = readFileSync(await download.path(), 'utf8')
    .trim()
    .split('\n');
  expect(csv).toHaveLength(2);
  expect(csv[1]).toContain(viaLink);
});

test('10. the client page offers no country in "Manage tags" — it follows the client', async () => {
  const page = masterPage;
  const id = psql(`SELECT id FROM users WHERE email='${viaLink}'`);
  await page.goto(`/clients/${id}`);
  await page
    .getByRole('button', { name: /actions/i })
    .first()
    .click();
  await page.getByRole('menuitem', { name: /manage tags/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(ownerTag.label).first()).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /^Lebanon/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Lebanon/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('11. a desk handing its clients to another desk is ASKED first, with how many', async () => {
  const page = deskPage;
  await page.goto('/clients');
  await expect(page.getByText(viaLink)).toBeVisible();
  await expect(page.getByText(viaDead)).toHaveCount(0); // not in this desk's territory
  await selectRow(page, viaLink);
  await page.getByRole('button', { name: 'Replace tag' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Tags' }).fill(ownerTag.label);
  await page.getByRole('option', { name: ownerTag.label }).click();
  await dialog.getByRole('combobox', { name: 'Put on instead' }).fill(extraTag.label);
  await page.getByRole('option', { name: extraTag.label }).click();
  await dialog.getByRole('button', { name: /apply to 1 client/i }).click();
  await expect(dialog.getByText(/1 of these clients will leave your territory/i)).toBeVisible();
  await shot(page, '11-leaves-territory-question');
  // Nothing moved yet.
  expect(await tagsOf(master, viaLink)).toContain(ownerTag.label);
  await dialog.getByRole('button', { name: /hand over 1 client/i }).click();
  await expect(page.getByText(/1 of 1 clients changed/i)).toBeVisible();
  await expect(page.getByText(viaLink)).toHaveCount(0);
  expect(await tagsOf(master, viaLink)).toContain(extraTag.label);
});

/**
 * The desk's row on Admin users. The directory pages in the browser, and the dev
 * database holds hundreds of administrators earlier e2e runs left behind, so
 * the desk may be on any page: walk them.
 */
async function deskRow(page: Page) {
  await page.goto('/admin-users');
  const row = page.getByRole('row').filter({ hasText: DESK.email });
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await page.getByRole('row').nth(1).waitFor();
  while ((await row.count()) === 0 && (await next.isEnabled())) await next.click();
  await expect(row).toBeVisible();
  return row;
}

/** Open the desk's Edit dialog on Admin users, as the master admin. */
async function editDesk(page: Page) {
  const row = await deskRow(page);
  await row.getByRole('button', { name: /actions/i }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  return page.getByRole('dialog');
}

test('12. a COUNTRY desk: put Lebanon in a territory, and every Lebanese client is theirs', async () => {
  const page = masterPage;
  const dialog = await editDesk(page);
  const picker = dialog.getByRole('combobox', { name: 'Add a tag…' });
  await picker.fill('Leban');
  // Countries are offered as territory, found by name, marked as countries.
  await page.getByRole('option', { name: 'Lebanon (country)' }).click();
  await expect(dialog.getByRole('button', { name: /remove lebanon \(country\)/i })).toBeVisible();
  await dialog.getByRole('button', { name: /save changes/i }).click();
  await expect(dialog).toBeHidden();

  // The desk now sees the Lebanese client it handed away — through the country —
  // and still not the Egyptian one, who is in neither its book nor its country.
  await deskPage.goto('/clients');
  await expect(deskPage.getByText(viaLink)).toBeVisible();
  await expect(deskPage.getByText(viaDead)).toHaveCount(0);
});

test('13. the link follows the territory LIVE: a tag given on Admin users is on the very next sign-up', async ({
  browser,
}) => {
  const page = masterPage;
  const dialog = await editDesk(page);
  await dialog.getByRole('combobox', { name: 'Add a tag…' }).fill(extraTag.label);
  await page.getByRole('option', { name: new RegExp(`^${extraTag.label}`) }).click();
  await dialog.getByRole('button', { name: /save changes/i }).click();
  await expect(dialog).toBeHidden();

  // The desk's panel says what the next sign-up gets: both books — and never
  // the Lebanon country now in its territory (a client has their own).
  await deskPage.goto('/profile');
  const panel = signupPanel(deskPage);
  await expect(panel.getByText(ownerTag.label, { exact: true })).toBeVisible();
  await expect(panel.getByText(extraTag.label, { exact: true })).toBeVisible();
  await expect(panel.getByText('Lebanon')).toHaveCount(0);
  await shot(deskPage, '13-link-follows-territory', panel);

  requirePrecondition(Boolean(RESUME), 'resuming an earlier run: no new sign-ups');
  const visitor = await browser.newContext();
  const vpage = await visitor.newPage();
  await signUpOnPortal(vpage, `/join/${deskSlug}`, viaMoved, 'Egypt', 'Egyptian');
  await visitor.close();
  expect(await tagsOf(master, viaMoved)).toEqual(['Egypt', ownerTag.label, extraTag.label].sort());
});

test('14. a desk renames its link word: a taken one is refused under the field, the old one brings nobody', async ({
  browser,
}) => {
  const masterSlug = ((await (await api(master)).get('/admin/signup-links/me')) as { slug: string })
    .slug;
  const oldSlug = deskSlug;
  const newSlug = `of-${run}`;
  const page = deskPage;
  await page.goto('/profile');
  const panel = signupPanel(page);
  await panel.getByRole('button', { name: 'Change link word' }).click();
  const dialog = page.getByRole('dialog');
  const field = dialog.getByLabel('Link word');
  await expect(field).toHaveValue(oldSlug);
  // Somebody else's word: refused, under the field, the dialog still open.
  await field.fill(masterSlug);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/already uses/i);
  await shot(page, '14-rename-taken');
  // Typed in capitals, saved in lower case.
  await field.fill(newSlug.toUpperCase());
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Sign-up link changed.')).toBeVisible();
  await expect(panel.locator('code')).toHaveText(`${PORTAL}/join/${newSlug}`);
  deskSlug = newSlug;

  // The account menu copies the NEW link, from any page.
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy my sign-up link' }).click();
  await expect(page.getByText('Sign-up link copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${PORTAL}/join/${newSlug}`,
  );

  // The master admin sees it on Admin users, beside what it has brought.
  const newLink = (await deskRow(masterPage)).getByText(`/join/${newSlug}`);
  await expect(newLink).toBeVisible();
  await shot(masterPage, '14-admin-users-link', newLink);

  // "Use a random word": the SERVER makes it and saves it at once.
  await page.goto('/profile');
  await signupPanel(page).getByRole('button', { name: 'Change link word' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use a random word' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(signupPanel(page).locator('code')).toHaveText(
    new RegExp(`^${PORTAL}/join/[a-km-np-z2-9]{8}$`),
  );
  await shot(page, '14-random-word', signupPanel(page));

  requirePrecondition(Boolean(RESUME), 'resuming an earlier run: no new sign-ups');
  // The old word is retired: it never refuses a visitor, and puts them in no book.
  const visitor = await browser.newContext();
  const vpage = await visitor.newPage();
  await signUpOnPortal(vpage, `/join/${oldSlug}`, viaRetired, 'Egypt', 'Egyptian');
  await visitor.close();
  expect(await tagsOf(master, viaRetired)).toEqual(['Egypt']);
  expect(psql(`SELECT signed_up_via_admin_id FROM users WHERE email='${viaRetired}'`)).toBe('');
  // Counted: the two who came through the desk's link, not the retired one.
  await expect(
    (await deskRow(masterPage)).getByText(/^2 signed up · 0 verified · 0 funded$/),
  ).toBeVisible();
  await shot(masterPage, '14-admin-users-signups');
});

test('15. an administrator who sees every client is TOLD their link puts clients in no book', async () => {
  const page = masterPage;
  await page.goto('/profile');
  const panel = signupPanel(page);
  await expect(panel.getByRole('note')).toContainText(/your link adds no tag/i);
  await expect(panel.locator('code')).toHaveText(/\/join\/[a-z0-9_-]+$/);
  await shot(page, '15-adds-no-tag', panel);
});

test('16. a reader whose role hides the country sees no country chip and is offered no country filter', async ({
  browser,
}) => {
  const a = await api(master);
  // A fresh reader per attempt: a resumed run would re-invite an address that exists.
  const stamp = `${run}-${Date.now() % 100_000}`;
  const role = (await (
    await a.post('/admin/roles', {
      name: `No country ${stamp}`,
      permissions: ['clients.view', 'tags.view'],
      maskedFields: ['client.country'],
    })
  ).json()) as { id: string };
  const email = `tag-masked-${stamp}@oxshare-e2e.test`;
  const invite = (await (
    await a.post('/admin/invite', {
      email,
      name: 'Masked Reader',
      roleId: role.id,
      seesAllClients: true,
    })
  ).json()) as { inviteUrl?: string };
  const token = new URL(invite.inviteUrl!).searchParams.get('token')!;
  const reader = await browser.newContext({ baseURL: APP_ORIGIN });
  try {
    const accepted = await reader.request.post(`${API_NODE_BASE}/admin/invite/accept`, {
      headers: { Origin: APP_ORIGIN },
      data: { token, password: 'Masked-password-123' },
    });
    expect(accepted.ok(), `accept invite: ${accepted.status()}`).toBeTruthy();
    await enrol(
      reader.request,
      ((await accepted.json()) as { challengeToken: string }).challengeToken,
    );

    const page = await reader.newPage();
    await page.goto(`/clients?q=${encodeURIComponent(viaLink)}`);
    const row = page.getByRole('row').filter({ hasText: viaLink });
    await expect(row).toBeVisible();
    // Their chosen tags show; the country — a hidden field — does not, as a chip either.
    await expect(row.getByText('Lebanon')).toHaveCount(0);
    // The tag filter offers no country to them.
    await page.getByRole('combobox', { name: /all tags/i }).fill('Leban');
    await expect(page.getByRole('option', { name: /lebanon/i })).toHaveCount(0);
    // And the API refuses a country filter typed into the URL.
    const refused = await reader.request.get(`${API_NODE_BASE}/admin/clients?tag=country-lb`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect(refused.status()).toBe(400);
  } finally {
    await reader.close();
  }
});
