import { expect, test } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import {
  acceptAdminInvite,
  adminApiSession,
  API_NODE_BASE,
  browserStateFrom,
  CONSOLE_PAGES,
  E2E_CLIENTS,
} from './helpers';

/**
 * RBAC-03, ADVERSARIALLY: can a masked operator reach the value ANYWHERE?
 *
 * Every other masking test names a surface and checks it. That is exactly the
 * shape that failed ten times — the surfaces somebody thought to check were the
 * surfaces somebody had already masked, and each exposure lived on one nobody
 * had enumerated. A test built the same way finds the same nothing.
 *
 * So this one names no surface. It drives the console as the WORST reader the
 * system can express — every permission the catalogue defines, and a mask over
 * every field that can be masked — and asserts the hidden values appear in NO
 * response body, on any request the app makes, anywhere. What it covers is
 * therefore whatever the app actually does, including screens written after
 * this was, which is the only version of the question worth asking.
 *
 * ## Why every permission, and not a realistic role
 *
 * A masked reader with narrow permissions cannot REACH most of the system, so a
 * sweep under one proves very little — and that is precisely why the wallet and
 * trading-account exposures survived: the seeded restricted admin holds
 * `clients.view` and could not open either screen. Maximum reach with minimum
 * field visibility is the combination that finds holes, and it is a
 * configuration an operator can genuinely create.
 *
 * ## The control matters as much as the assertion
 *
 * "The address is absent" is trivially true of an empty screen, a 403, or a
 * console that failed to load. Every sweep below therefore also requires that
 * the same run SAW the client — by id, which is never masked — and the last
 * test drives the identical walk as an unmasked master and requires the values
 * to be present. Without that pair the whole file could pass while proving that
 * the app is broken.
 */

/** The values that must not appear. Seeded, and stable across runs. */
const SECRETS = [
  E2E_CLIENTS.alpha.email,
  E2E_CLIENTS.bravo.email,
  E2E_CLIENTS.delta.email,
  'client@oxshare.com',
] as const;

/** Everything the catalogue lets a role hide. Read from the API, never listed here. */
async function everyMaskableField(
  master: Awaited<ReturnType<typeof adminApiSession>>,
): Promise<string[]> {
  const res = await master.get('/admin/client-fields');
  expect(res.ok(), `the field catalogue answered ${res.status()}`).toBe(true);
  /*
   * The catalogue answers a DICT of groups keyed by name — `{ identity: {...},
   * contact: {...} }` — not an array and not `{ groups: [...] }`. Reading it as
   * either yields an empty list, and an empty mask makes every assertion in this
   * file pass while hiding nothing at all.
   */
  const body = (await res.json()) as Record<
    string,
    { fields?: { key: string; maskable?: boolean }[] }
  >;
  const keys = Object.values(body)
    .flatMap((group) => group?.fields ?? [])
    .filter((f) => f.maskable !== false);
  expect(keys.length, 'the catalogue offered nothing maskable').toBeGreaterThan(5);
  return keys.map((f) => f.key);
}

/** Every permission the catalogue defines — asked of the server, not hardcoded. */
async function everyPermission(
  master: Awaited<ReturnType<typeof adminApiSession>>,
): Promise<string[]> {
  const res = await master.get('/admin/permissions');
  expect(res.ok(), `the permission catalogue answered ${res.status()}`).toBe(true);
  const body = (await res.json()) as unknown;

  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'key' && typeof v === 'string') keys.add(v);
        else walk(v);
      }
    }
  };
  walk(body);
  expect(keys.size, 'the permission catalogue was empty').toBeGreaterThan(20);
  return [...keys];
}

/**
 * An operator holding EVERYTHING and permitted to see nothing about a person.
 *
 * The role is reused by name across runs, deliberately: a role cannot be deleted
 * while an admin references it and an admin cannot be deleted at all, so a
 * per-run role accumulates for ever and eventually pushes a neighbour's fixture
 * off the first page of `/roles`. That has broken an unrelated spec before.
 */
async function maskedSuperReader(
  browser: Browser,
  master: Awaited<ReturnType<typeof adminApiSession>>,
) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const roleName = 'E2E Mask Everything';
  const [permissions, maskedFields] = await Promise.all([
    everyPermission(master),
    everyMaskableField(master),
  ]);

  const list = (await (await master.get('/admin/roles')).json()) as
    { id: string; name: string }[] | { roles?: { id: string; name: string }[] };
  const existing = (Array.isArray(list) ? list : (list.roles ?? [])).find(
    (r) => r.name === roleName,
  );

  const body = {
    name: roleName,
    description: 'Every permission, every maskable field hidden — masking-adversarial.spec.ts',
    permissions,
    maskedFields,
  };
  const saved = existing
    ? await master.put(`/admin/roles/${existing.id}`, body)
    : await master.post('/admin/roles', body);
  expect(saved.ok(), `saving the role answered ${saved.status()}`).toBe(true);
  const roleId = existing ? existing.id : ((await saved.json()) as { id: string }).id;

  const invited = await master.post('/admin/invite', {
    email: `e2e-mask-all-${stamp}@oxshare-e2e.test`,
    name: 'E2E Mask Everything',
    roleId,
  });
  expect(invited.ok(), `the invite answered ${invited.status()}`).toBe(true);
  const token = new URL(
    ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
  ).searchParams.get('token')!;

  const admin = await acceptAdminInvite(token, `MaskAll-${stamp}-123!`);
  const context = await browser.newContext({ storageState: await browserStateFrom(admin.ctx) });
  return {
    ctx: admin.ctx,
    page: await context.newPage(),
    maskedFields,
    async dispose() {
      await context.close();
      await master.patch(`/admin/users/${admin.id}/status`, { status: 'suspended' });
      await admin.ctx.dispose();
    },
  };
}

/**
 * Walk the console, capturing every API response the app receives.
 *
 * Responses are read from the network rather than from the DOM on purpose. A
 * value can be present in a payload and never rendered — held in a cache, used
 * for a tooltip, or simply carried by a field the screen ignores — and it has
 * still left the server. "It is not on screen" is a weaker claim than "it did
 * not reach the browser", and only the second is what a field mask promises.
 */
async function sweep(page: Page, pages: readonly string[]): Promise<string[]> {
  /*
   * The bodies are AWAITED, not collected in a fire-and-forget handler.
   *
   * `response.text()` is a promise, so pushing from inside `.then()` returns an
   * array that is still empty when the caller reads it — and every "the value
   * is absent" assertion then passes by examining nothing. The control test
   * caught it: an UNMASKED master appeared to see no addresses either, which is
   * the only reason this was noticed rather than shipped as a green suite.
   */
  const pending: Promise<string>[] = [];

  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/v1/')) return;
    pending.push(
      response
        .text()
        .then((text) => `${url}\n${text}`)
        .catch(() => ''),
    );
  });

  for (const path of pages) {
    await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  }
  return (await Promise.all(pending)).filter(Boolean);
}

/** Which secrets appear in a captured body, with the URL that returned them. */
function leaks(bodies: readonly string[]): string[] {
  const found: string[] = [];
  for (const body of bodies) {
    const [url] = body.split('\n', 1);
    for (const secret of SECRETS) {
      if (body.includes(secret)) found.push(`${secret}  ←  ${url}`);
    }
  }
  return [...new Set(found)];
}

/**
 * The id of a client whose address is one of the SECRETS.
 *
 * Searching the fixture DOMAIN returns whichever rows match first, and the
 * suite's own minted clients long ago outnumbered the seeded ones — so a sweep
 * built that way opens a client whose email is not on the watch list, finds
 * nothing, and reports it as a mask working. That is exactly how the control
 * failed the first time this file ran.
 */
async function clientCarryingASecret(
  master: Awaited<ReturnType<typeof adminApiSession>>,
  email: string,
): Promise<string> {
  const res = await master.get(`/admin/clients?q=${encodeURIComponent(email)}&limit=5`);
  expect(res.ok(), `looking up ${email} answered ${res.status()}`).toBe(true);
  const found = ((await res.json()) as { items: { id: string; email?: string }[] }).items.find(
    (c) => c.email === email,
  );
  expect(found, `${email} is not in the database — the seed did not run`).toBeDefined();
  return found!.id;
}

test.describe('a fully-masked operator cannot reach a client value anywhere', () => {
  let master: Awaited<ReturnType<typeof adminApiSession>>;

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    master = await adminApiSession();
  });

  test.afterAll(async () => {
    await master?.dispose();
  });

  test('no response on ANY console page carries a masked value', async ({ browser }) => {
    test.setTimeout(300_000);
    const reader = await maskedSuperReader(browser, master);
    try {
      const bodies = await sweep(reader.page, CONSOLE_PAGES);

      // The control. Without it, a console that failed to load passes.
      expect(bodies.length, 'the sweep captured no API responses at all').toBeGreaterThan(5);
      const sawAClient = bodies.some((b) => b.includes('Aardvark') || b.includes('/admin/clients'));
      expect(sawAClient, 'the sweep never reached a client screen').toBe(true);

      const found = leaks(bodies);
      expect(
        found,
        `A masked operator received these values. Each line is the value and the ` +
          `response that carried it:\n${found.map((f) => `  ${f}`).join('\n')}`,
      ).toEqual([]);
    } finally {
      await reader.dispose();
    }
  });

  test('no response on a CLIENT or KYC detail carries a masked value', async ({ browser }) => {
    /*
     * The list pages above are the shallow half. Detail screens fan out to the
     * routes that have actually leaked — the profile, the KYC submission, its
     * history, the documents panel — and three of the ten exposures were on a
     * detail or a decision rather than on a list.
     */
    test.setTimeout(300_000);
    const reader = await maskedSuperReader(browser, master);
    try {
      const alpha = await clientCarryingASecret(master, E2E_CLIENTS.alpha.email);
      const bravo = await clientCarryingASecret(master, E2E_CLIENTS.bravo.email);
      const deep = [alpha, bravo].flatMap((id) => [`/clients/${id}`, `/kyc/${id}`]);
      const bodies = await sweep(reader.page, deep);

      expect(bodies.length, 'the sweep captured nothing').toBeGreaterThan(0);
      const leaked = leaks(bodies);
      expect(leaked, `Leaked on a detail screen:\n${leaked.join('\n')}`).toEqual([]);
    } finally {
      await reader.dispose();
    }
  });

  test('no CSV a masked operator can download carries a masked value', async ({ browser }) => {
    /*
     * A file leaves the building carrying every row in it, which is why the
     * export half of this feature has leaked twice — once for seventeen days
     * after its own list was fixed. Fetched through the READER's session, so
     * this is the file that operator would actually receive.
     */
    test.setTimeout(300_000);
    const reader = await maskedSuperReader(browser, master);
    try {
      const exports = [
        '/admin/clients/export',
        '/admin/kyc/export',
        '/admin/withdrawals/export',
        '/admin/transactions/export',
        '/admin/wallets/export',
        '/admin/trading-accounts/export',
        '/admin/audit-log/export',
      ];

      const leaked: string[] = [];
      let downloaded = 0;
      for (const path of exports) {
        /*
         * An export STREAMS, and a slow one aborts under the default request
         * timeout — which reads as a failure of this test rather than of the
         * export. Each is given its own budget and its own catch: one endpoint
         * that will not answer must not decide the verdict for the six that
         * did, and `downloaded` below is what stops that becoming vacuous.
         */
        let csv: string;
        try {
          const res = await reader.ctx.get(`${API_NODE_BASE}${path}`, { timeout: 60_000 });
          if (!res.ok()) continue; // a permission this reader lacks is not the subject
          csv = await res.text();
        } catch {
          continue;
        }
        downloaded++;
        for (const secret of SECRETS) if (csv.includes(secret)) leaked.push(`${secret} ← ${path}`);
      }

      expect(downloaded, 'no export answered — nothing was actually checked').toBeGreaterThan(0);
      expect(leaked, `A masked operator downloaded these:\n${leaked.join('\n')}`).toEqual([]);
    } finally {
      await reader.dispose();
    }
  });

  test('the MASTER sees the same values on the same walk — the control', async ({ browser }) => {
    /*
     * The assertion that makes the three above mean something. Everything they
     * check is "the value is absent", which is equally true of a broken
     * console, an empty database or a permission denial. This runs the same
     * sweep as an unmasked reader and requires the values to BE there — so a
     * pass above is a mask working rather than a screen failing.
     */
    test.setTimeout(300_000);
    const context = await browser.newContext({
      storageState: await browserStateFrom(master.request),
    });
    const page = await context.newPage();
    try {
      /*
       * A SPECIFIC client, not page one of the list. Every run mints clients
       * that are never deleted, so the seeded fixtures long ago fell off the
       * first page — and a control that navigates to `/clients` proves nothing
       * about a row it never loaded.
       */
      const alpha = await clientCarryingASecret(master, E2E_CLIENTS.alpha.email);
      const bodies = await sweep(page, [`/clients/${alpha}`]);
      const seen = leaks(bodies);
      expect(
        seen.length,
        'an UNMASKED master saw no client address either — the fixtures or the ' +
          'console are broken, and the masked sweeps prove nothing',
      ).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
