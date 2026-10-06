import { expect, test } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import {
  acceptAdminInvite,
  adminApiSession,
  API_NODE_BASE,
  browserStateFrom,
  mintClientWithPendingKyc,
  type MintedClient,
} from './helpers';

/**
 * THE REVIEW QUEUE AS A DESK SHARES IT — a claim you can see and hand back,
 * and counts that stay inside the reader's territory.
 *
 * Two things were reported from the running console and both are pinned here.
 *
 *  1. A reviewer scoped to two tags, with no intake grant, saw a sidebar badge
 *     of 15 and tabs reading 12 / 3 / 89 / 111 above a queue with nothing in
 *     it. The rows were scoped; the counts were not.
 *  2. A claim was a one-way door: no release, and nothing named the holder —
 *     so a reviewer who could not finish left work that looked taken, by
 *     nobody in particular.
 *
 * The counts case is the one worth stating carefully: it is asserted as an
 * IDENTITY between what the tabs claim and what the table shows, because that
 * is the property a reader relies on. A count that is merely smaller would
 * satisfy a weaker assertion and still be wrong.
 */

const kycNav = (page: Page) => page.getByRole('link', { name: /kyc review/i });
const dock = (page: Page) => page.getByRole('button', { name: /approve kyc submission/i });
const claimBtn = (page: Page) => page.getByRole('button', { name: /claim for review/i });
const releaseBtn = (page: Page) => page.getByRole('button', { name: /hand this submission back/i });

/**
 * Data rows only.
 *
 * An empty table still renders a single full-width `<tr>` carrying the "no
 * submissions" message, so a bare `tbody tr` count reads 1 for a queue with
 * nothing in it — which made "the counts match the rows" fail on a scoped
 * reviewer whose territory is legitimately empty.
 */
async function dataRowCount(page: Page): Promise<number> {
  if (
    await page
      .getByText(/no submissions match/i)
      .isVisible()
      .catch(() => false)
  )
    return 0;
  return page.locator('tbody tr').count();
}

/**
 * The tab chips above the queue, as { label: count }.
 *
 * Inside `main` only: the sidebar's closed main items carry counts too
 * ("Finance 3"), and a chip collector that reads the whole page would file
 * them as tabs.
 */
async function tabCounts(page: Page): Promise<Record<string, number>> {
  const chips = await page.getByRole('main').getByRole('button').all();
  const out: Record<string, number> = {};
  for (const chip of chips) {
    const text = ((await chip.textContent()) ?? '').trim();
    const m = /^([A-Za-z ]+?)\s*(\d+)$/.exec(text);
    if (m) out[m[1]!.trim()] = Number.parseInt(m[2]!, 10);
  }
  return out;
}

test.describe('a claim is visible, and reversible', () => {
  let master: Awaited<ReturnType<typeof adminApiSession>>;
  let client: MintedClient;

  test.beforeAll(async () => {
    // Past one login-cap window: `adminApiSession` waits out the five-a-minute
    // cap, and that wait cannot fit a default 60s hook.
    test.setTimeout(300_000);
    master = await adminApiSession();
    client = await mintClientWithPendingKyc(master, 'claim');
  });

  test.afterAll(async () => {
    await client?.dispose();
    await master?.dispose();
  });

  test('claim names the holder and offers the way out; hand back undoes both', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(`/kyc/${client.id}`);
    await expect(dock(page)).toBeVisible({ timeout: 30_000 });

    // Unclaimed: Claim offered, nothing to hand back.
    await expect(claimBtn(page)).toBeVisible();
    await expect(releaseBtn(page)).toBeHidden();

    await claimBtn(page).click();

    /*
     * Claimed: the holder is NAMED. This is the half that did not exist — the
     * dock hid Claim from everyone and said only "In review", so a colleague
     * could not tell whether to wait or take the work.
     */
    await expect(page.getByText(/being reviewed by/i)).toBeVisible({ timeout: 20_000 });
    await expect(releaseBtn(page)).toBeVisible();
    await expect(claimBtn(page), 'a claimed submission offers Claim again').toBeHidden();

    await releaseBtn(page).click();

    // Back in the queue, with nobody's name on it.
    await expect(claimBtn(page)).toBeVisible({ timeout: 20_000 });
    await expect(releaseBtn(page)).toBeHidden();
    await expect(page.getByText(/being reviewed by/i)).toBeHidden();
  });

  test('the QUEUE names the holder, so nobody has to open the row to ask', async ({ page }) => {
    test.setTimeout(180_000);
    expect((await master.patch(`/admin/kyc/${client.id}/claim`)).ok()).toBe(true);
    /*
     * The acting admin's own name, read from the session rather than
     * hardcoded. `adminApiSession` signs in as the suite's e2e admin, not the
     * master — asserting "Master Admin" here failed against a Reviewer column
     * that was working perfectly and saying "E2E Admin".
     */
    const me = (await (await master.get('/admin/auth/me')).json()) as { name?: string };
    expect(me.name, 'the session has no name to match against').toBeTruthy();
    try {
      await page.goto('/kyc?status=under_review');
      await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

      const row = page.locator('tbody tr').filter({ hasText: client.email });
      await expect(row).toBeVisible({ timeout: 20_000 });
      // The Reviewer column — the question a claim exists to answer.
      await expect(row, 'the queue does not say who holds it').toContainText(me.name!);
    } finally {
      await master.patch(`/admin/kyc/${client.id}/release`);
    }
  });

  test("a colleague can hand back another reviewer's claim", async ({ page, browser }) => {
    /*
     * The rule: you may release what you could decide. `approve` and `reject`
     * already accept an `under_review` row from any reviewer who can see it,
     * so refusing the LESSER action would make a colleague's absence the one
     * thing nobody can resolve.
     */
    test.setTimeout(300_000);
    const peer = await invitedReviewer(browser, master, 'peer');
    try {
      expect((await peer.api.patch(`/admin/kyc/${client.id}/claim`)).ok()).toBe(true);

      // The MASTER, a different person, sees whose it is and hands it back.
      await page.goto(`/kyc/${client.id}`);
      await expect(page.getByText(/being reviewed by e2e claim peer/i)).toBeVisible({
        timeout: 30_000,
      });
      await releaseBtn(page).click();
      await expect(claimBtn(page)).toBeVisible({ timeout: 20_000 });
    } finally {
      await master.patch(`/admin/kyc/${client.id}/release`).catch(() => null);
      await peer.dispose();
    }
  });

  test('a DECIDED submission offers neither control', async ({ page }) => {
    /*
     * The line release must not cross. Reopening a verification is `reject`'s
     * job, with a reason attached — not a silent slide back into the queue.
     */
    test.setTimeout(300_000);
    const decided = await mintClientWithPendingKyc(master, 'decided');
    try {
      expect((await master.patch(`/admin/kyc/${decided.id}/approve`)).ok()).toBe(true);
      await page.goto(`/kyc/${decided.id}`);
      await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(claimBtn(page)).toBeHidden();
      await expect(
        releaseBtn(page),
        'a decided submission can be slid back into the queue',
      ).toBeHidden();
    } finally {
      await decided.dispose();
    }
  });
});

test.describe('the numbers a reviewer is shown are their own', () => {
  test("a SCOPED reviewer's tabs agree with the rows they can see", async ({ browser }) => {
    /*
     * ⚠️ THE REPORTED BUG. The status-count query carried no predicate, so the
     * tabs and the sidebar badge counted the whole platform while the table
     * below them was filtered to the reader's territory.
     *
     * Asserted as an identity, and non-vacuously: the master must be able to
     * see MORE than this reviewer, or "the counts match the rows" would be
     * satisfied by a console showing nobody anything.
     */
    test.setTimeout(300_000);
    const master = await adminApiSession();
    const reviewer = await invitedReviewer(browser, master, 'scoped', { scoped: true });
    try {
      const page = reviewer.page;
      await page.goto('/kyc?status=all');
      await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');

      const counts = await tabCounts(page);
      const rows = await dataRowCount(page);
      const all = counts['All'] ?? -1;
      expect(all, "the All tab reaches past the reviewer's territory").toBe(rows);

      // Non-vacuous: there IS more on the platform than this reviewer sees.
      const platform = (await (await master.get('/admin/kyc?limit=1')).json()) as {
        counts: Record<string, number>;
      };
      expect(
        platform.counts['all'],
        'the fixture has nothing outside the territory to leak',
      ).toBeGreaterThan(all);
    } finally {
      await reviewer.dispose();
      await master.dispose();
    }
  });

  test('the OPEN tab is the sum of awaiting-review and in-review, not zero', async ({ page }) => {
    /*
     * "Needs review" read `counts['needs_review']`, a key the API never
     * returned, so it displayed 0 for ever — on the one tab that means "work
     * waiting for a human", above a list that was not empty. The API computes
     * the set now, so this is the number the sidebar badge shows too.
     */
    test.setTimeout(120_000);
    await page.goto('/kyc?status=all');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const counts = await tabCounts(page);
    const open = counts['Open'];
    const awaiting = counts['Awaiting review'] ?? 0;
    const inReview = counts['In review'] ?? 0;
    expect(open, 'the Open tab is missing').toBeDefined();
    expect(open).toBe(awaiting + inReview);
    // The badge counts the same set, so they must agree on screen.
    const badge = ((await kycNav(page).textContent()) ?? '').replace(/[^0-9]/g, '');
    if (badge) expect(Number.parseInt(badge, 10), 'the badge and the Open tab disagree').toBe(open);
  });

  test('the tabs and the status pill use the SAME words', async ({ page }) => {
    /*
     * The tabs were a fourth copy of this vocabulary, after two others were
     * deleted for drifting. They said "Pending" and "Under Review" while the
     * pill on the row beside them said something else.
     */
    test.setTimeout(120_000);
    await page.goto('/kyc?status=submitted');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

    const counts = await tabCounts(page);
    expect(Object.keys(counts), 'the retired labels are back').not.toContain('Pending');
    expect(Object.keys(counts)).not.toContain('Under Review');
    expect(Object.keys(counts)).toContain('Awaiting review');

    const rows = await page.locator('tbody tr').count();
    if (rows > 0) {
      await expect(page.locator('tbody tr').first()).toContainText(/awaiting review/i);
    }
  });
});

/** A reviewer with their own login, optionally boxed into one tag's territory. */
async function invitedReviewer(
  browser: Browser,
  master: Awaited<ReturnType<typeof adminApiSession>>,
  label: string,
  opts: { scoped?: boolean } = {},
) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const roleName = `E2E Claim ${label}`;
  const list = (await (await master.get('/admin/roles')).json()) as
    { id: string; name: string }[] | { roles?: { id: string; name: string }[] };
  const existing = (Array.isArray(list) ? list : (list.roles ?? [])).find(
    (r) => r.name === roleName,
  );
  const body = {
    name: roleName,
    description: 'Reused by kyc-claim-and-territory.spec.ts',
    permissions: ['clients.view', 'kyc.view', 'kyc.review'],
  };
  // Reused, never created per run: a role cannot be deleted while an admin
  // references it, and an admin cannot be deleted at all — so a per-run role
  // accumulates until it pushes somebody else's fixture off page one.
  const saved = existing
    ? await master.put(`/admin/roles/${existing.id}`, body)
    : await master.post('/admin/roles', body);
  expect(saved.ok(), `saving the role answered ${saved.status()}`).toBe(true);
  const roleId = existing ? existing.id : ((await saved.json()) as { id: string }).id;

  const invited = await master.post('/admin/invite', {
    email: `e2e-claim-${label}-${stamp}@oxshare-e2e.test`,
    name: `E2E Claim ${label}`,
    roleId,
  });
  expect(invited.ok(), `the invite answered ${invited.status()}`).toBe(true);
  const token = new URL(
    ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
  ).searchParams.get('token')!;
  const admin = await acceptAdminInvite(token, `Claim-${stamp}-123!`);

  if (opts.scoped) {
    /*
     * Boxed into a tag no client carries, with no intake grant — so their
     * queue is empty while the platform's is not. That gap is exactly what the
     * unscoped counts were leaking.
     */
    const tag = await master.post('/admin/tags', { label: `E2E Claim Scope ${stamp}` });
    expect(tag.ok()).toBe(true);
    const tagId = ((await tag.json()) as { id: string }).id;
    expect(
      (
        await master.patch(`/admin/users/${admin.id}`, {
          scopedTagIds: [tagId],
        })
      ).ok(),
    ).toBe(true);
  }

  const context = await browser.newContext({ storageState: await browserStateFrom(admin.ctx) });
  return {
    api: {
      patch: (path: string, data?: unknown) =>
        admin.ctx.patch(`${API_NODE_BASE}${path}`, { headers: admin.headers, data }),
    },
    page: await context.newPage(),
    async dispose() {
      await context.close();
      await master.patch(`/admin/users/${admin.id}/status`, { status: 'suspended' });
      await admin.ctx.dispose();
    },
  };
}
