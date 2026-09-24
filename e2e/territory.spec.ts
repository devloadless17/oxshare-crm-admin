import { type BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  adminApi,
  adminApiSession,
  E2E_CLIENTS,
  E2E_DOMAIN,
  E2E_TAGS,
  RESTRICTED_STATE,
  searchOwnClients,
} from './helpers';

/**
 * THE TERRITORY CONTRACT, whole — RBAC-03's scoping half, every direction.
 *
 * An administrator handles the clients related to them and nobody else:
 *
 *  - a client carrying one of THEIR tags is theirs — list, profile, queue, export;
 *  - a client carrying their tag AND somebody else's is still theirs (union);
 *  - a client carrying ONLY somebody else's tag does not exist for them — not in
 *    the list, not in the total, not by deep link (404, never 403 — the
 *    difference is an oracle), not in the CSV, not on the KYC queue;
 *  - NEW clients (no tags yet — the intake pool) are visible only to admins
 *    granted `seesUntriaged`, so a fresh registration is not everybody's;
 *  - an admin with NO territory restriction sees all of it — "handles all
 *    clients" is the explicit unrestricted configuration, never a default.
 *
 * Fixtures: the restricted admin is scoped to `e2e-alpha` with
 * `seesUntriaged: false`; `alpha` carries `e2e-alpha` (and a submitted KYC row);
 * `bravo`…`zulu` are untagged; `e2e-beta` is a second tag assigned to nobody.
 * Every tag written here is removed in a `finally`, and the one admin flag this
 * file toggles is restored (the seed also re-asserts it every boot).
 */

let master: Awaited<ReturnType<typeof adminApiSession>>;
const ids: Record<string, string> = {};
/*
 * The same clients by Portal ID — what every export identifies a client by
 * (0133). The uuid is in no file any more, so a `not.toContain(uuid)` would
 * pass whatever the export did.
 */
const portalIds: Record<string, number> = {};
const tags: Record<string, string> = {};
let restrictedAdminId = '';

test.beforeAll(async () => {
  // One API login for the file — and a budget that covers the helper WAITING
  // out the five-a-minute login cap when another spec just spent it.
  test.setTimeout(180_000);
  master = await adminApiSession();

  const list = await master.get(`/admin/clients?q=${encodeURIComponent(E2E_DOMAIN)}&limit=100`);
  expect(list.ok()).toBe(true);
  for (const c of (
    (await list.json()) as { items: { id: string; portalId: number; email: string }[] }
  ).items) {
    ids[c.email] = c.id;
    portalIds[c.email] = c.portalId;
  }
  for (const t of (await (await master.get('/admin/tags')).json()) as {
    id: string;
    slug: string;
  }[]) {
    tags[t.slug] = t.id;
  }
  expect(tags[E2E_TAGS.alpha.slug], 'e2e-alpha tag not seeded').toBeTruthy();
  expect(tags[E2E_TAGS.beta.slug], 'e2e-beta tag not seeded').toBeTruthy();

  const admins = (await (await master.get('/admin/users')).json()) as
    { items: { id: string; email: string }[] } | { id: string; email: string }[];
  const rows = Array.isArray(admins) ? admins : admins.items;
  restrictedAdminId = rows.find((a) => a.email === 'e2e-restricted@oxshare.com')?.id ?? '';
  expect(restrictedAdminId, 'e2e-restricted@oxshare.com not seeded').toBeTruthy();
});

test.afterAll(async () => {
  await master?.dispose();
});

const id = (key: keyof typeof E2E_CLIENTS) => ids[E2E_CLIENTS[key].email];

/** Does the CSV hold a row for this client — their Portal ID as a whole cell? */
const hasClientRow = (csv: string, key: keyof typeof E2E_CLIENTS) =>
  csv
    .split('\r\n')
    .some((line) => line.split(',').includes(String(portalIds[E2E_CLIENTS[key].email])));

/** The restricted admin's view of one seeded client, from the API. */
async function restrictedSees(
  restricted: BrowserContext,
  key: keyof typeof E2E_CLIENTS,
): Promise<boolean> {
  const api = await adminApi(restricted);
  const res = await api.get(`/admin/clients?q=${encodeURIComponent(E2E_DOMAIN)}&limit=100`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { items: { id: string }[] }).items.some((c) => c.id === id(key));
}

test.describe('what the scoped admin SEES', () => {
  test.use({ storageState: RESTRICTED_STATE });

  test('their tagged client is theirs — on the screen and on the wire', async ({ page }) => {
    await page.goto('/clients');
    await searchOwnClients(page);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toBeVisible();

    // …and the profile opens.
    await page.getByRole('link', { name: E2E_CLIENTS.alpha.name }).click();
    await expect(page.getByRole('heading', { name: E2E_CLIENTS.alpha.name })).toBeVisible();
  });

  test('the list is HONEST about its size — the total counts only their territory', async ({
    context,
  }) => {
    /*
     * A scoped page of one row under a badge of six is the leak this closes:
     * the count must be computed under the same WHERE as the rows.
     */
    const api = await adminApi(context);
    const res = await api.get(
      `/admin/clients?q=${encodeURIComponent(E2E_DOMAIN)}&limit=100&withTotal=1`,
    );
    const body = (await res.json()) as { items: unknown[]; total?: number };
    if (body.total !== undefined) expect(body.total).toBe(body.items.length);
  });

  test('a client with ONLY a foreign tag does not exist for them — list, deep link, export', async ({
    context,
    page,
  }) => {
    /*
     * Bravo joins ANOTHER desk's territory (`e2e-beta`, which this admin is not
     * scoped to). Untagged, bravo was merely in the intake pool this admin
     * cannot see; tagged foreign, bravo is positively somebody else's — and
     * must stay invisible in every representation, including the 404 a direct
     * URL gets (never a 403: the difference tells an outsider the id is real).
     */
    await master.post(`/admin/clients/${id('bravo')}/tags/${tags[E2E_TAGS.beta.slug]}`);
    try {
      expect(await restrictedSees(context, 'bravo')).toBe(false);

      const api = await adminApi(context);
      const direct = await api.get(`/admin/clients/${id('bravo')}`);
      expect(direct.status(), 'an out-of-scope deep link must 404, never 403').toBe(404);

      const csv = await api.get('/admin/clients/export?format=csv');
      expect(csv.ok()).toBe(true);
      const text = await csv.text();
      expect(hasClientRow(text, 'bravo'), 'the CSV leaked an out-of-scope client').toBe(false);
      expect(hasClientRow(text, 'alpha'), 'the CSV lost an in-scope client').toBe(true);

      // The screen agrees with the wire.
      await page.goto('/clients');
      await searchOwnClients(page);
      await expect(page.getByRole('link', { name: E2E_CLIENTS.bravo.name })).toHaveCount(0);
    } finally {
      await master.del(`/admin/clients/${id('bravo')}/tags/${tags[E2E_TAGS.beta.slug]}`);
    }
  });

  test('a client carrying their tag AND a foreign tag is still theirs — the union, not the intersection', async ({
    context,
  }) => {
    /*
     * The sharing case: two desks can both handle one client. Charlie gets
     * e2e-alpha (this admin's) AND e2e-beta (another desk's); a scope computed
     * as "only my tags and nothing else" would wrongly hide them.
     */
    await master.post(`/admin/clients/${id('charlie')}/tags/${tags[E2E_TAGS.alpha.slug]}`);
    await master.post(`/admin/clients/${id('charlie')}/tags/${tags[E2E_TAGS.beta.slug]}`);
    try {
      expect(await restrictedSees(context, 'charlie')).toBe(true);
    } finally {
      await master.del(`/admin/clients/${id('charlie')}/tags/${tags[E2E_TAGS.alpha.slug]}`);
      await master.del(`/admin/clients/${id('charlie')}/tags/${tags[E2E_TAGS.beta.slug]}`);
    }
    expect(await restrictedSees(context, 'charlie'), 'cleanup left charlie visible').toBe(false);
  });

  test('NEW clients (the untagged intake pool) appear only when seesUntriaged is granted', async ({
    context,
  }) => {
    /*
     * Delta is seeded untagged — a "new client" nobody has triaged. With the
     * grant OFF (the seeded state) delta does not exist for this admin; with it
     * ON, the whole intake pool appears; OFF again, it vanishes. This is the
     * "also see the new clients, if set" half of the contract, D-60.
     */
    expect(
      await restrictedSees(context, 'delta'),
      'the intake pool leaked with the grant off',
    ).toBe(false);

    const granted = await master.patch(`/admin/users/${restrictedAdminId}`, {
      seesUntriaged: true,
    });
    expect(granted.ok(), `granting seesUntriaged answered ${granted.status()}`).toBe(true);
    try {
      expect(
        await restrictedSees(context, 'delta'),
        'the intake pool did not appear with the grant on',
      ).toBe(true);
      // Their tagged client is still there — the pool is a union, not a replacement.
      expect(await restrictedSees(context, 'alpha')).toBe(true);
    } finally {
      await master.patch(`/admin/users/${restrictedAdminId}`, { seesUntriaged: false });
    }
    expect(await restrictedSees(context, 'delta'), 'revoking the grant did not bite').toBe(false);
  });

  test('the territory follows the client onto the KYC queue', async ({ context }) => {
    /*
     * Alpha (in scope) has a seeded SUBMITTED KYC row; e2e@oxshare.com (out of
     * scope: untagged, and the grant is off) has an APPROVED one. The queue is
     * the same client base under a different lens, so it must answer with the
     * same territory — an out-of-scope identity on the review queue is the same
     * disclosure by another URL.
     */
    const api = await adminApi(context);
    const submitted = await api.get('/admin/kyc?status=submitted&limit=100');
    expect(submitted.ok()).toBe(true);
    const submittedIds = ((await submitted.json()) as { items: { userId: string }[] }).items.map(
      (r) => r.userId,
    );
    expect(submittedIds, "alpha's submission is missing from their own reviewer").toContain(
      id('alpha'),
    );

    const approved = await api.get('/admin/kyc?status=approved&limit=100');
    const approvedText = JSON.stringify(await approved.json());
    // The out-of-scope approved submission (e2e@oxshare.com) must not be there.
    expect(approvedText, 'the KYC queue leaked an out-of-scope client').not.toContain('Endtoend');
  });

  test('they cannot WRITE outside their permissions either — tagging needs its own key', async ({
    context,
  }) => {
    // This admin holds clients.view/kyc.review/tags.view — not clients.tag. The
    // API refuses; the menu never offered it (client-admin-actions covers that).
    const api = await adminApi(context);
    const refused = await api.post(
      `/admin/clients/${id('alpha')}/tags/${tags[E2E_TAGS.beta.slug]}`,
    );
    expect(refused.status()).toBe(403);
  });
});

test.describe('the DEFAULT for a brand-new scoped admin', () => {
  test('sees new clients out of the box, until the box is unticked', async ({ playwright }) => {
    /*
     * The product default, as the invite screen states it: "Sees new clients
     * (not yet tagged) — granted by default". The column is NOT NULL DEFAULT
     * true and the invite path resolves an untouched checkbox to granted
     * whenever the inviter may grant it. (The seeded e2e-restricted@ fixture
     * has it deliberately UNTICKED so the tests above can prove the hidden
     * direction — that is the fixture's configuration, not the default.)
     *
     * One scoped administrator is invited per run — scoped to `e2e-beta`, a
     * territory that holds nobody — and accepted over the API (accepting mints
     * the session, so this costs no login against the five-a-minute cap):
     *
     *   1. fresh scoped admin, checkbox untouched → the untagged intake pool
     *      (delta) IS visible, their foreign-tagged neighbour (alpha) is not;
     *   2. the master unticks the box → the pool vanishes, live.
     */
    const email = `e2e-intake-${Date.now()}@${E2E_DOMAIN}`;
    const created = await master.post('/admin/invite', {
      email,
      name: 'E2E Intake Default',
      permissions: ['clients.view'],
      scopedTagIds: [tags[E2E_TAGS.beta.slug]],
    });
    expect(created.ok(), `invite answered ${created.status()}`).toBe(true);
    const { inviteUrl } = (await created.json()) as { inviteUrl?: string };
    expect(inviteUrl, 'the invite link is echoed outside production only').toBeTruthy();
    const token = new URL(inviteUrl!).searchParams.get('token')!;

    const invitee = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      const accepted = await invitee.post(
        `${process.env.E2E_API_NODE_ORIGIN ?? 'http://localhost:3001'}/v1/admin/invite/accept`,
        {
          headers: { Origin: process.env.E2E_ADMIN_ORIGIN ?? 'http://localhost:3002' },
          data: { token, password: 'Intake-default-123!' },
        },
      );
      expect(accepted.ok(), `accepting the invite answered ${accepted.status()}`).toBe(true);

      const seen = async () => {
        const res = await invitee.get(
          `${process.env.E2E_API_NODE_ORIGIN ?? 'http://localhost:3001'}/v1/admin/clients?q=${encodeURIComponent(E2E_DOMAIN)}&limit=100`,
        );
        expect(res.ok(), `client list answered ${res.status()}`).toBe(true);
        return ((await res.json()) as { items: { id: string }[] }).items.map((c) => c.id);
      };

      const byDefault = await seen();
      expect(byDefault, 'a fresh scoped admin could NOT see the intake pool').toContain(
        id('delta'),
      );
      expect(byDefault, "the default let them see another desk's tagged client").not.toContain(
        id('alpha'),
      );

      // The master unticks the box; the pool vanishes on the very next read.
      const me = (await (
        await invitee.get(
          `${process.env.E2E_API_NODE_ORIGIN ?? 'http://localhost:3001'}/v1/admin/auth/me`,
        )
      ).json()) as { id: string };
      const unticked = await master.patch(`/admin/users/${me.id}`, { seesUntriaged: false });
      expect(unticked.ok(), `unticking answered ${unticked.status()}`).toBe(true);

      const after = await seen();
      expect(after, 'unticking the box did not hide the intake pool').not.toContain(id('delta'));
    } finally {
      await invitee.dispose();
    }
  });
});

test.describe('the UNRESTRICTED admin', () => {
  test('sees the whole client base — tagged, foreign-tagged and untagged alike', async ({
    page,
    context,
  }) => {
    /*
     * "Handles all clients" is the explicit configuration of holding NO
     * territory restriction — the master fixture. Every seeded cohort member is
     * visible at once, whatever their tag state.
     */
    const api = await adminApi(context);
    const res = await api.get(`/admin/clients?q=${encodeURIComponent(E2E_DOMAIN)}&limit=100`);
    const got = ((await res.json()) as { items: { id: string }[] }).items.map((c) => c.id);
    for (const key of ['alpha', 'bravo', 'charlie', 'delta', 'zulu'] as const) {
      expect(got, `${key} missing from the unrestricted view`).toContain(id(key));
    }

    await page.goto('/clients');
    await searchOwnClients(page);
    await expect(page.getByRole('link', { name: E2E_CLIENTS.alpha.name })).toBeVisible();
    await expect(page.getByRole('link', { name: E2E_CLIENTS.delta.name })).toBeVisible();
  });
});
