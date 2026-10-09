import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { devDbReachable, psql } from './authenticator';
import { E2E_ADMIN, requirePrecondition } from './helpers';
import {
  api,
  inviteAdmin,
  shot,
  signInAdmin,
  signUpOnPortal,
  tagsOf,
  type Tag,
} from './tagging-support';

/**
 * THE TAGGING MATRIX, LIVE — every combination, not a sample.
 *
 * A tag is an owner's book: it decides which administrators see a client.
 * So this checks the rule exhaustively, in a real browser against the real
 * stack, where each cell is a promise to a broker:
 *
 *   VISIBILITY — 5 kinds of administrator × 4 kinds of client = 20 cells. For
 *   each: the clients list shows or hides the client, the client page opens or
 *   says "not available", and the API answers 200 or 404 (never 403, which
 *   would confirm the client exists).
 *
 *   SIGN-UP LINKS — a real portal sign-up through each kind of administrator's
 *   link (one book, two books, sees everyone, sees nobody, suspended, a link
 *   word renamed away), with and without a partner: exactly which tags the
 *   client lands with, who is recorded as having brought them, and that the
 *   bringer then sees them.
 *
 * LOCAL ONLY, like tagging-live: it enrols its administrators' authenticators
 * through the dev database. Run the API with RELAX_RATE_LIMITS=1 — it makes
 * seven sign-ups, and sign-up is otherwise capped at ten an hour per address.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const run = Date.now() % 1_000_000;
const dbReachable = devDbReachable();

type Who = 'all' | 'of' | 'tn' | 'both' | 'none';
type Kind = 'untagged' | 'of' | 'tn' | 'both';
const ADMINS: readonly Who[] = ['all', 'of', 'tn', 'both', 'none'];
const KINDS: readonly Kind[] = ['untagged', 'of', 'tn', 'both'];

/** THE RULE, stated once: who sees which kind of client. */
const SEES: Record<Who, readonly Kind[]> = {
  all: ['untagged', 'of', 'tn', 'both'],
  of: ['of', 'both'],
  tn: ['tn', 'both'],
  both: ['of', 'tn', 'both'],
  none: [],
};

let master: BrowserContext;
let of: Tag;
let tn: Tag;
const admins = {} as Record<Who, BrowserContext>;
const adminEmail = (who: Who) => `matrix-${who}-${run}@oxshare-e2e.test`;
const clientEmail = (kind: Kind) => `matrix-client-${kind}-${run}@oxshare-e2e.test`;
const clientIds = {} as Record<Kind, number>;

test.beforeAll(async ({ browser }) => {
  requirePrecondition(
    !dbReachable,
    'the dev database is not reachable — this spec enrols authenticators through it',
  );
  master = await browser.newContext();
  await signInAdmin(master, E2E_ADMIN);
  const a = await api(master);
  of = (await (await a.post('/admin/tags', { label: `OF ${run}` })).json()) as Tag;
  tn = (await (await a.post('/admin/tags', { label: `TN ${run}` })).json()) as Tag;

  // The five kinds of administrator, through the real invite + authenticator flow.
  const territory: Record<Who, { scopedTagIds?: string[]; seesAllClients?: boolean }> = {
    all: { seesAllClients: true },
    of: { scopedTagIds: [of.id] },
    tn: { scopedTagIds: [tn.id] },
    both: { scopedTagIds: [of.id, tn.id] },
    none: { seesAllClients: false },
  };
  for (const who of ADMINS) {
    admins[who] = await inviteAdmin(browser, master, {
      email: adminEmail(who),
      name: `Matrix ${who} ${run}`,
      roleName: `Matrix ${who} ${run}`,
      permissions: ['clients.view', 'tags.view'],
      ...territory[who],
    });
  }

  // The four kinds of client. Inserted directly (identity is not what is under
  // test here); their tags are given through the real API, as a desk would.
  for (const kind of KINDS) {
    clientIds[kind] = Number(
      psql(
        `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ('${clientEmail(kind)}', 'x', 'Matrix', '${kind}') RETURNING id`,
      ).split('\n')[0],
    );
    const tags = kind === 'of' ? [of] : kind === 'tn' ? [tn] : kind === 'both' ? [of, tn] : [];
    for (const tag of tags) {
      const res = await a.post(`/admin/clients/${clientIds[kind]}/tags/${tag.id}`);
      expect(res.ok(), `tag ${kind}: ${res.status()}`).toBeTruthy();
    }
  }
});

test.afterAll(async () => {
  for (const who of ADMINS) await admins[who]?.close();
  await master?.close();
});

/**
 * The clients list in the browser shows exactly `expected` of the matrix
 * clients. Waits for the list's own request to answer first, so an absence is
 * an answer, never a list that has not loaded yet.
 */
async function expectListed(page: Page, expected: readonly Kind[]): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/admin/clients?') && r.request().method() === 'GET' && r.ok(),
    ),
    page.goto(`/clients?q=${encodeURIComponent('matrix-client-')}`),
  ]);
  for (const kind of expected) {
    await expect(page.getByText(clientEmail(kind), { exact: true })).toBeVisible();
  }
  for (const kind of KINDS.filter((k) => !expected.includes(k))) {
    await expect(page.getByText(clientEmail(kind), { exact: true })).toHaveCount(0);
  }
}

for (const who of ADMINS) {
  test(`visibility: the "${who}" administrator sees exactly ${SEES[who].length ? SEES[who].join(', ') : 'nobody'}`, async () => {
    const context = admins[who];
    const a = await api(context);

    // 1. The API, cell by cell: 200 for theirs, 404 for anyone else's.
    for (const kind of KINDS) {
      const res = await a.raw(`/admin/clients/${clientIds[kind]}`);
      const expected = SEES[who].includes(kind) ? 200 : 404;
      expect(res.status(), `${who} → ${kind} client`).toBe(expected);
    }

    // 2. The clients list in the browser.
    const page = await context.newPage();
    await expectListed(page, SEES[who]);
    await shot(page, `matrix-list-${who}`);

    // 3. The client page by URL: opens for theirs, "not available" otherwise.
    for (const kind of KINDS) {
      await page.goto(`/clients/${clientIds[kind]}`);
      if (SEES[who].includes(kind)) {
        await expect(page.getByText(clientEmail(kind)).first()).toBeVisible();
      } else {
        await expect(page.getByText('This client is not available')).toBeVisible();
        await expect(page.getByText(clientEmail(kind))).toHaveCount(0);
      }
    }
    await page.close();
  });
}

test('filters: one tag, the other, and either — exactly the right clients', async () => {
  const a = await api(master);
  const kindsFor = async (tag: string) => {
    const res = (await a.get(
      `/admin/clients?q=${encodeURIComponent('matrix-client-')}&tag=${encodeURIComponent(tag)}&limit=100`,
    )) as { items: { email: string }[] };
    return KINDS.filter((kind) => res.items.some((c) => c.email === clientEmail(kind))).sort();
  };
  expect(await kindsFor(of.slug)).toEqual(['both', 'of']);
  expect(await kindsFor(tn.slug)).toEqual(['both', 'tn']);
  expect(await kindsFor(`${of.slug},${tn.slug}`)).toEqual(['both', 'of', 'tn']);

  // And the same filter, picked in the browser.
  const page = await master.newPage();
  await page.goto(`/clients?q=${encodeURIComponent('matrix-client-')}&tag=${of.slug}`);
  await expect(page.getByText(clientEmail('of'), { exact: true })).toBeVisible();
  await expect(page.getByText(clientEmail('both'), { exact: true })).toBeVisible();
  await expect(page.getByText(clientEmail('tn'), { exact: true })).toHaveCount(0);
  await expect(page.getByText(clientEmail('untagged'), { exact: true })).toHaveCount(0);
  await page.close();
});

/* ── Sign-up links ───────────────────────────────────────────────────────── */

const slugs = {} as Record<Who, string>;
const signupEmail = (label: string) => `matrix-signup-${label}-${run}@oxshare-e2e.test`;

async function signUpThrough(
  browser: import('@playwright/test').Browser,
  entry: string,
  label: string,
): Promise<string> {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  const email = signupEmail(label);
  await signUpOnPortal(page, entry, email, 'Lebanon', 'Lebanese');
  await visitor.close();
  return email;
}

/** Who the database records as having brought this client (an admin email), or ''. */
function broughtBy(email: string): string {
  return psql(
    `SELECT coalesce(a.email, '') FROM users u LEFT JOIN admins a ON a.id = u.signed_up_via_admin_id WHERE u.email = '${email}'`,
  );
}

test('sign-up links: every kind of administrator’s link gives exactly their book', async ({
  browser,
}) => {
  for (const who of ADMINS) {
    slugs[who] = (
      (await (await api(admins[who])).get('/admin/signup-links/me')) as { slug: string }
    ).slug;
  }
  const cases: { who: Who; tags: string[] }[] = [
    { who: 'of', tags: [of.label] },
    { who: 'both', tags: [of.label, tn.label].sort() },
    // Sees everyone, holds no book: recorded as theirs, given no tag.
    { who: 'all', tags: [] },
    // Sees nobody, holds no book: the same.
    { who: 'none', tags: [] },
  ];
  for (const { who, tags } of cases) {
    const email = await signUpThrough(browser, `/join/${slugs[who]}`, who);
    expect(await tagsOf(master, email), `tags via ${who}'s link`).toEqual(tags);
    expect(broughtBy(email), `bringer via ${who}'s link`).toBe(adminEmail(who));
  }

  // The bringer then sees the client they brought — the point of the link.
  const ofPage = await admins.of.newPage();
  await ofPage.goto(`/clients?q=${encodeURIComponent(signupEmail('of'))}`);
  await expect(ofPage.getByText(signupEmail('of'), { exact: true })).toBeVisible();
  await shot(ofPage, 'matrix-bringer-sees-client');
  await ofPage.close();
  // …and a desk that holds a different book does not.
  const tnRes = await (
    await api(admins.tn)
  ).get(`/admin/clients?q=${encodeURIComponent(signupEmail('of'))}`);
  expect((tnRes as { items: unknown[] }).items).toHaveLength(0);
});

test('sign-up links: a suspended administrator’s link tags and records nobody — and never blocks', async ({
  browser,
}) => {
  psql(`UPDATE admins SET status = 'suspended' WHERE email = '${adminEmail('tn')}'`);
  try {
    const email = await signUpThrough(browser, `/join/${slugs.tn}`, 'suspended');
    expect(await tagsOf(master, email)).toEqual([]);
    expect(broughtBy(email)).toBe('');
  } finally {
    psql(`UPDATE admins SET status = 'active' WHERE email = '${adminEmail('tn')}'`);
  }
});

test('sign-up links: a link word renamed away brings nobody; the new word works at once', async ({
  browser,
}) => {
  const oldSlug = slugs.of;
  const renamed = await (
    await api(admins.of)
  ).post(
    `/admin/signup-links/${psql(`SELECT id FROM admins WHERE email='${adminEmail('of')}'`)}/random`,
  );
  expect(renamed.ok(), `random word: ${renamed.status()}`).toBeTruthy();
  const newSlug = ((await renamed.json()) as { slug: string }).slug;

  const viaOld = await signUpThrough(browser, `/join/${oldSlug}`, 'old-word');
  expect(await tagsOf(master, viaOld)).toEqual([]);
  expect(broughtBy(viaOld)).toBe('');

  const viaNew = await signUpThrough(browser, `/join/${newSlug}`, 'new-word');
  expect(await tagsOf(master, viaNew)).toEqual([of.label]);
  expect(broughtBy(viaNew)).toBe(adminEmail('of'));
});

test('sign-up links: an administrator’s link AND a partner’s ref — both books, recorded once', async ({
  browser,
}) => {
  // Give the e2e partner TN; a client under them inherits it, beside the link's OF.
  const partnerId = psql(`SELECT user_id FROM ib_accounts WHERE referral_code='E2EPARTL1'`);
  requirePrecondition(!partnerId, 'the e2e partner fixture (SEED_E2E_FIXTURES=true) is missing');
  await (await api(master)).post(`/admin/clients/${partnerId}/tags/${tn.id}`);
  const slug = ((await (await api(admins.of)).get('/admin/signup-links/me')) as { slug: string })
    .slug;

  const email = await signUpThrough(browser, `/join/${slug}?ref=E2EPARTL1`, 'link-and-partner');
  const tags = await tagsOf(master, email);
  expect(tags).toContain(of.label);
  expect(tags).toContain(tn.label);
  expect(broughtBy(email)).toBe(adminEmail('of'));
  expect(
    psql(
      `SELECT count(*) FROM audit_log WHERE action = 'client.acquired' AND subject_id = (SELECT id::text FROM users WHERE email = '${email}')`,
    ),
  ).toBe('1');
});
