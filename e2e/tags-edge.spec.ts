import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { acceptAdminInvite, adminApiSession, API_NODE_BASE, E2E_CLIENTS } from './helpers';

/**
 * ADM-14 / D-60 — the tag DELETIONS that must refuse, because each one would
 * quietly rewrite who sees whom:
 *
 * - A tag that anchors somebody's TERRITORY cannot go: an empty scope means
 *   UNRESTRICTED, so cascading it would promote every admin scoped to it
 *   from "these clients" to "every client in the system".
 * - The system `new-client` tag cannot go: registration attaches it, and
 *   deleting it would turn intake into a pool only unrestricted admins see.
 * - An ordinary assigned tag CAN go — and takes its assignments with it,
 *   with the count on the audit row.
 */

const run = Date.now();

test('territory and system tags refuse deletion; an ordinary tag cascades cleanly', async () => {
  test.setTimeout(360_000);
  const master = await adminApiSession();
  let scoped: { ctx: APIRequestContext; id: string } | null = null;

  try {
    // ── A tag that is somebody's territory ────────────────────────────────
    const anchor = (await (
      await master.post('/admin/tags', { label: `E2E Anchor ${run}` })
    ).json()) as { id: string };

    const invited = await master.post('/admin/invite', {
      email: `e2e-tagsedge-${run}@oxshare-e2e.test`,
      name: 'E2E Tags Edge',
      permissions: ['clients.view'],
      scopedTagIds: [anchor.id],
    });
    expect(invited.ok(), `invite answered ${invited.status()}`).toBe(true);
    const token = new URL(
      ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
    ).searchParams.get('token')!;
    const accepted = await acceptAdminInvite(token, `Tagsedge-${run}-123!`);
    scoped = { ctx: accepted.ctx, id: accepted.id };

    const refusal = await master.del(`/admin/tags/${anchor.id}`);
    expect(refusal.status(), 'deleted a tag that anchors a territory').toBe(409);
    const sentence = ((await refusal.json()) as { message: string }).message;
    expect(sentence, 'the refusal does not name the consequence').toMatch(/every client|scope/i);

    // The scoped admin's world is unchanged: a FOREIGN-TAGGED client is still
    // invisible. (Untagged clients like bravo are legitimately visible — the
    // intake pool is granted by default, D-60 — so alpha, who carries the
    // e2e-alpha tag, is the honest probe.)
    const theirList = await scoped.ctx.get(`${API_NODE_BASE}/admin/clients?limit=200`);
    expect(theirList.ok()).toBe(true);
    const emails = ((await theirList.json()) as { items: { email?: string }[] }).items.map(
      (c) => c.email,
    );
    expect(emails, 'the refused delete still widened a territory').not.toContain(
      E2E_CLIENTS.alpha.email,
    );

    /*
     * NOTE — no system-tag deletion test, deliberately: admin-tags.service.ts
     * guards `isSystem` tags (the D-60 "new-client" intake tag), but nothing
     * in the current build ever CREATES one — registration implements intake
     * as "clients with no tags", not as a tag. The guard is latent design,
     * reported as a doc-drift finding rather than asserted against.
     */
    // ── An ordinary assigned tag: allowed, cascades, and counted ──────────
    const alphaId = (
      (await (
        await master.get(`/admin/clients?q=${encodeURIComponent(E2E_CLIENTS.alpha.email)}&limit=5`)
      ).json()) as { items: { id: string; email: string }[] }
    ).items.find((c) => c.email === E2E_CLIENTS.alpha.email)?.id;
    expect(alphaId, 'the alpha fixture is missing').toBeTruthy();

    const plain = (await (
      await master.post('/admin/tags', { label: `E2E Plain ${run}` })
    ).json()) as { id: string };
    expect((await master.post(`/admin/clients/${alphaId}/tags/${plain.id}`)).ok()).toBe(true);

    const before = (await (
      await master.get(`/admin/clients/${alphaId}/tags`)
    ).json()) as unknown as { id: string }[] | { items: { id: string }[] };
    const beforeIds = (Array.isArray(before) ? before : before.items).map((t) => t.id);
    expect(beforeIds).toContain(plain.id);

    expect((await master.del(`/admin/tags/${plain.id}`)).ok()).toBe(true);

    const after = (await (await master.get(`/admin/clients/${alphaId}/tags`)).json()) as unknown as
      { id: string }[] | { items: { id: string }[] };
    const afterIds = (Array.isArray(after) ? after : after.items).map((t) => t.id);
    expect(afterIds, 'the deleted tag is still on the client').not.toContain(plain.id);

    const audit = await master.get('/admin/audit-log?action=client_tag.delete&limit=10');
    const auditText = JSON.stringify(await audit.json());
    expect(auditText, 'the cascade count is not on the audit row').toMatch(
      /assignmentsRemoved\\?":\s*1/,
    );

    // ── Cleanup: free the anchor and take it out properly ─────────────────
    expect((await master.patch(`/admin/users/${scoped.id}`, { scopedTagIds: [] })).ok()).toBe(true);
    expect(
      (await master.del(`/admin/tags/${anchor.id}`)).ok(),
      'the anchor cannot be deleted even after the scope moved off it',
    ).toBe(true);
  } finally {
    if (scoped) {
      await master.patch(`/admin/users/${scoped.id}/status`, { status: 'suspended' });
      await scoped.ctx.dispose();
    }
    await master.dispose();
  }
});
