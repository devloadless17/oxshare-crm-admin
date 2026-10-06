import { request as apiRequest, type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  acceptAdminInvite,
  adminApiSession,
  API_NODE_BASE,
  APP_ORIGIN,
  requirePrecondition,
  signIn,
} from './helpers';

/**
 * ANY TAG, ON ANY CLIENT YOU CAN SEE — driven through the real client page
 * (owner, 28 Sep 2026: "an admin can put any tags on the client that is in his
 * territory even if the tags are not in his territory").
 *
 * The reported bug was a scoped desk unable to put another desk's tag on its
 * own client: the console offered the tag and the API refused it. This walks
 * the whole hand-off as that desk would:
 *
 *   1. add the other desk's tag — accepted, nothing asked (the client keeps ours);
 *   2. remove our own tag — ASKED FIRST ("Hand #… over?"), because afterwards
 *      the client is outside our territory;
 *   3. confirm — the page returns to the client list, and a deep link to the
 *      client now reads like any client this desk cannot see.
 *
 * Everything is the spec's own: a freshly minted client (the development-only
 * fixtures route) and two tags named for this run, so no shared fixture is
 * borrowed. The desk is suspended and the tags deleted in `finally`.
 */

const run = Date.now();

test('a desk hands a client to another desk from the client page — asked first, then gone', async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const master = await adminApiSession();
  let desk: { ctx: APIRequestContext; id: string } | null = null;
  const tagIds: string[] = [];
  let clientId = '';

  try {
    const ownTag = (await (
      await master.post('/admin/tags', { label: `E2E Handoff Desk ${run}` })
    ).json()) as { id: string; label: string };
    const otherTag = (await (
      await master.post('/admin/tags', { label: `E2E Handoff Other ${run}` })
    ).json()) as { id: string; label: string };
    tagIds.push(ownTag.id, otherTag.id);

    // A client of this spec's own, in the desk's territory.
    const minter = await apiRequest.newContext({ storageState: { cookies: [], origins: [] } });
    const made = await minter.post(`${API_NODE_BASE}/e2e/fixtures/client`, {
      headers: { Origin: APP_ORIGIN },
    });
    requirePrecondition(
      !made.ok(),
      `the e2e fixtures route answered ${made.status()} — it is development-only`,
    );
    clientId = ((await made.json()) as { id: string }).id;
    await minter.dispose();
    const { portalId } = (await (await master.get(`/admin/clients/${clientId}`)).json()) as {
      portalId: number;
    };
    expect((await master.post(`/admin/clients/${clientId}/tags/${ownTag.id}`)).ok()).toBe(true);

    // A desk that may tag, scoped to its own tag, WITHOUT the new-clients grant —
    // so an untagged client would not be theirs either.
    const email = `e2e-handoff-${run}@oxshare-e2e.test`;
    const password = `Handoff-${run}-123!`;
    const invited = await master.post('/admin/invite', {
      email,
      name: 'E2E Handoff Desk',
      permissions: ['clients.view', 'clients.tag', 'tags.view'],
      scopedTagIds: [ownTag.id],
    });
    expect(invited.ok(), `invite answered ${invited.status()}`).toBe(true);
    const token = new URL(
      ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
    ).searchParams.get('token')!;
    const accepted = await acceptAdminInvite(token, password);
    desk = { ctx: accepted.ctx, id: accepted.id };

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await signIn(page, { email, password });
      await page.goto(`/clients/${portalId}`);

      await page.getByRole('button', { name: /actions for/i }).click();
      await page.getByRole('menuitem', { name: /manage tags/i }).click();
      const tagsDialog = page.getByRole('dialog');
      const own = tagsDialog.getByRole('button', { name: new RegExp(ownTag.label) });
      const other = tagsDialog.getByRole('button', { name: new RegExp(otherTag.label) });

      // 1. The other desk's tag: offered, and now ACCEPTED — the reported bug.
      await other.click();
      await expect(other).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);

      // 2. Our own tag: removing it hands the client over, so it is asked.
      await own.click();
      const question = page.getByRole('alertdialog');
      await expect(question).toContainText(`Hand #${portalId} over?`);

      // 3. Confirmed: back to the list, and the client is no longer ours.
      await question.getByRole('button', { name: /hand over/i }).click();
      await expect(page).toHaveURL(/\/clients$/);
      await page.goto(`/clients/${portalId}`);
      await expect(page.getByText(/not available/i).first()).toBeVisible();
    } finally {
      await context.close();
    }

    // The client now carries only the other desk's tag.
    const tags = (await (await master.get(`/admin/clients/${clientId}/tags`)).json()) as {
      id: string;
    }[];
    expect(tags.map((t) => t.id)).toEqual([otherTag.id]);
  } finally {
    if (desk) {
      await master.patch(`/admin/users/${desk.id}/status`, { status: 'suspended' });
      // Off the territory tag, so the tag can be deleted below.
      await master.patch(`/admin/users/${desk.id}`, { scopedTagIds: [] });
      await desk.ctx.dispose();
    }
    if (clientId) {
      for (const tagId of tagIds) await master.del(`/admin/clients/${clientId}/tags/${tagId}`);
    }
    for (const tagId of tagIds) await master.del(`/admin/tags/${tagId}`);
    await master.dispose();
  }
});
