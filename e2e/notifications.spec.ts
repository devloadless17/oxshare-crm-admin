import { expect, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import {
  acceptAdminInvite,
  adminApiSession,
  API_NODE_BASE,
  E2E_TAGS,
  registerClientWithPendingKyc,
  RESTRICTED_STATE,
  type MintedClient,
} from './helpers';

/**
 * ADMIN NOTIFICATIONS ARE TASKS — the buyer's rules, walked in real browsers
 * against the real stack (backend 0140, D-78).
 *
 * One genuine client submits KYC by wire while three consoles watch:
 *  - the reviewer's bell rings with "Review KYC", naming the client by Portal ID;
 *  - an admin who may not review KYC (e2e-restricted) is never told — and,
 *    the stronger claim, neither is a REVIEWER whose territory is e2e-alpha
 *    without the intake pool: they could act on the task, but the client is
 *    outside their territory, and the server's read-time scope says so;
 *  - OPENING the task in one tab marks it seen in the other, live — and it
 *    STAYS in the inbox: clicking is not handling (the owner's rule, 5 Oct
 *    2026, reversing "if he clicked it, it should disappear");
 *  - History does not hold it while it waits;
 *  - a DIFFERENT admin approves: it leaves the reviewer's inbox and their
 *    History reads "Approved · <them>", without a reload — "when it is handled
 *    it should disappear", and say who handled it.
 *
 * Costs one registration (the portal caps sign-ups at 10/h) and three KYC
 * uploads, like the realtime suite beside it.
 */

const BUDGET_MS = 10_000;

const bell = (page: Page) => page.getByRole('button', { name: /open notifications/i });
const panel = (page: Page) => page.getByRole('dialog', { name: /notifications/i });

async function openBell(page: Page): Promise<Locator> {
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  return panel(page);
}

/** The invite link's token — the part `acceptAdminInvite` takes. */
async function inviteToken(res: { json: () => Promise<unknown> }): Promise<string> {
  const { inviteUrl } = (await res.json()) as { inviteUrl?: string };
  return new URL(inviteUrl ?? 'http://x/').searchParams.get('token') ?? '';
}

/** The task row about this client, by its Portal ID — the only identifier a console prints. */
const taskRow = (scope: Locator, portalId: number) =>
  scope.getByRole('listitem').filter({ hasText: `#${portalId}` });

test.describe('admin notifications are tasks', () => {
  let admin: Awaited<ReturnType<typeof adminApiSession>>;
  let client: MintedClient | undefined;
  let scopedReviewer: Awaited<ReturnType<typeof acceptAdminInvite>> | undefined;

  test.beforeAll(async () => {
    admin = await adminApiSession();
  });

  test.afterAll(async () => {
    await client?.dispose();
    // Suspended, not deleted — the audit trail keeps the admin it names.
    if (scopedReviewer) {
      await admin.patch(`/admin/users/${scopedReviewer.id}/status`, { status: 'suspended' });
      await scopedReviewer.ctx.dispose();
    }
  });

  test('ring the reviewers in territory, keep the task when opened, and resolve when a peer approves', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);

    await page.goto('/dashboard');
    const otherTab = await page.context().newPage();
    await otherTab.goto('/dashboard');
    const restrictedContext = await browser.newContext({ storageState: RESTRICTED_STATE });
    const restricted = await restrictedContext.newPage();
    await restricted.goto('/dashboard');

    /*
     * A reviewer who COULD act on the task, scoped to e2e-alpha WITHOUT the
     * intake pool — so a brand-new (untagged) client is outside their
     * territory. Minted BEFORE the submission: the fan-out picks recipients at
     * the moment the task is written.
     */
    const tags = (await (await admin.get('/admin/tags')).json()) as { id: string; slug: string }[];
    const alphaTagId = tags.find((tag) => tag.slug === E2E_TAGS.alpha.slug)?.id;
    expect(alphaTagId, 'the e2e-alpha tag is not seeded').toBeTruthy();
    const scopedInvite = await admin.post('/admin/invite', {
      email: `e2e-ntf-scoped-${Date.now()}@oxshare-e2e.test`,
      name: `E2E Notif Scoped ${Date.now()}`,
      permissions: ['kyc.view', 'kyc.review'],
      scopedTagIds: [alphaTagId],
    });
    expect(scopedInvite.ok(), `the scoped invite answered ${scopedInvite.status()}`).toBe(true);
    const outsider = await acceptAdminInvite(
      await inviteToken(scopedInvite),
      `Ntfscoped-${Date.now()}-123!`,
    );
    scopedReviewer = outsider;

    client = await registerClientWithPendingKyc(admin, 'ntf-task');
    const detail = (await (await admin.get(`/admin/clients/${client.id}`)).json()) as {
      portalId: number;
    };
    const portalId = detail.portalId;
    expect(portalId, 'the client has no Portal ID').toBeGreaterThanOrEqual(1_000_000);

    try {
      // 1. The reviewer's inbox holds the task, as the action to take.
      const reviewer = await openBell(page);
      const task = taskRow(reviewer, portalId);
      await expect(task).toBeVisible({ timeout: BUDGET_MS });
      await expect(task.getByText('Review KYC')).toBeVisible();

      // 2. An admin who may not review KYC is never told.
      const scoped = await openBell(restricted);
      await expect(scoped.getByRole('tab', { name: /inbox/i })).toBeVisible();
      await restricted.waitForTimeout(1_500);
      await expect(taskRow(scoped, portalId)).toHaveCount(0);

      // 2b. Nor is a reviewer outside the client's territory — asked of the
      // server itself, which applies the scope on every read.
      const scopedInbox = await outsider.ctx.get(
        `${API_NODE_BASE}/admin/notifications?view=inbox`,
        {
          headers: outsider.headers,
        },
      );
      expect(scopedInbox.ok(), `the scoped inbox answered ${scopedInbox.status()}`).toBe(true);
      const scopedItems = (
        (await scopedInbox.json()) as { items: { client: { portalId: number | null } }[] }
      ).items;
      expect(
        scopedItems.some((item) => item.client.portalId === portalId),
        'a reviewer outside the territory was told about this client',
      ).toBe(false);

      // 3. Opening it in ANOTHER tab marks it seen here, live — and it stays.
      await expect(task.getByText(/Unread/)).toHaveCount(1);
      const other = await openBell(otherTab);
      await taskRow(other, portalId).getByRole('link').click();
      await expect(otherTab).toHaveURL(new RegExp(`/kyc/${portalId}$`));
      await expect(task.getByText(/Unread/), 'opened elsewhere, still new here').toHaveCount(0, {
        timeout: BUDGET_MS,
      });
      await expect(task, 'opening it took it out of the inbox').toBeVisible();

      // 4. History does not hold it while it waits on a decision. (History has
      // loaded — a row or its empty state — before the absence counts.)
      await reviewer.getByRole('tab', { name: 'History' }).click();
      await expect(reviewer.getByRole('tab', { name: 'History' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        reviewer.getByRole('listitem').or(reviewer.getByText('Nothing handled yet')).first(),
      ).toBeVisible({ timeout: BUDGET_MS });
      await expect(taskRow(reviewer, portalId), 'a waiting task was filed in History').toHaveCount(
        0,
      );
      await reviewer.getByRole('tab', { name: /inbox/i }).click();
      await expect(task).toBeVisible({ timeout: BUDGET_MS });

      // 5. A different operator approves: it leaves this inbox, and History says
      // who handled it — without a reload.
      const peerName = `E2E Notif Peer ${Date.now()}`;
      const invited = await admin.post('/admin/invite', {
        email: `e2e-ntf-peer-${Date.now()}@oxshare-e2e.test`,
        name: peerName,
        permissions: ['kyc.view', 'kyc.review'],
      });
      expect(invited.ok(), `invite answered ${invited.status()}`).toBe(true);
      const peer = await acceptAdminInvite(
        await inviteToken(invited),
        `Ntfpeer-${Date.now()}-123!`,
      );
      try {
        const approved = await peer.ctx.patch(`${API_NODE_BASE}/admin/kyc/${client.id}/approve`, {
          headers: peer.headers,
        });
        expect(approved.ok(), `the peer's approval answered ${approved.status()}`).toBe(true);
        await expect(task, 'a handled task kept showing').toBeHidden({ timeout: BUDGET_MS });
        await reviewer.getByRole('tab', { name: 'History' }).click();
        await expect(taskRow(reviewer, portalId).getByText(`Approved · ${peerName}`)).toBeVisible({
          timeout: BUDGET_MS,
        });
      } finally {
        await admin.patch(`/admin/users/${peer.id}/status`, { status: 'suspended' });
        await peer.ctx.dispose();
      }
    } finally {
      await restrictedContext.close();
      await otherTab.close();
    }
  });
});
