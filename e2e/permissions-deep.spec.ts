import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { acceptAdminInvite, adminApiSession, API_NODE_BASE, APP_ORIGIN } from './helpers';

/**
 * FR-RBAC deep pass — the two properties that make the permission system
 * trustworthy rather than merely present:
 *
 * 1. LIVE RESOLUTION. Permissions, scope and mask are resolved from the
 *    database on EVERY request (admin.guard.ts), so editing a role reaches
 *    every holder's very next request — revocation and re-grant alike, with
 *    no re-login and no 15-minute token window.
 *
 * 2. THE SUBSET RULE. Nobody can hand out what they do not hold. Every door
 *    is tried from a real limited session: minting a bigger role, inflating
 *    a role they hold, inflating another admin, inflating THEMSELVES,
 *    deleting a bigger role, and inviting above their ceiling.
 *
 * Fresh roles and fresh admins per run — mutating seeded fixtures would
 * poison every later spec.
 */

const run = Date.now();

async function acceptInvite(
  master: Awaited<ReturnType<typeof adminApiSession>>,
  opts: { name: string; roleId?: string; permissions?: string[] },
): Promise<{ ctx: APIRequestContext; headers: Record<string, string>; id: string }> {
  const email = `e2e-permdeep-${opts.name}-${run}@oxshare-e2e.test`;
  const created = await master.post('/admin/invite', {
    email,
    name: `E2E PermDeep ${opts.name}`,
    ...(opts.roleId ? { roleId: opts.roleId } : {}),
    ...(opts.permissions ? { permissions: opts.permissions } : {}),
  });
  expect(created.ok(), `invite answered ${created.status()}`).toBe(true);
  const { inviteUrl } = (await created.json()) as { inviteUrl?: string };
  expect(inviteUrl, 'the invite link is echoed outside production only').toBeTruthy();
  const token = new URL(inviteUrl!).searchParams.get('token')!;

  return acceptAdminInvite(token, `Permdeep-${opts.name}-123!`);
}

test('a role edit lands on the holder’s VERY NEXT request — revoke and re-grant alike', async () => {
  test.setTimeout(360_000);
  const master = await adminApiSession();
  const masterPut = (path: string, data: unknown) =>
    master.request.put(`${API_NODE_BASE}${path}`, {
      headers: { Origin: APP_ORIGIN, 'X-OxShare-CSRF': master.csrf },
      data,
    });
  try {
    // NOTE the probe choice: GET /admin/tags accepts clients.view OR
    // tags.view (the vocabulary is readable from the client screens), so it
    // cannot prove a tags.view revocation. GET /admin/roles is gated on
    // roles.view|admins.view — a family this role touches only via roles.view.
    const created = await master.post('/admin/roles', {
      name: `E2E Live Role ${run}`,
      permissions: ['clients.view', 'roles.view'],
    });
    expect(created.ok(), `role create answered ${created.status()}`).toBe(true);
    const role = (await created.json()) as { id: string };

    const holder = await acceptInvite(master, { name: 'live', roleId: role.id });
    try {
      // The starting truth: both grants work, an ungranted section refuses.
      expect((await holder.ctx.get(`${API_NODE_BASE}/admin/roles`)).status()).toBe(200);
      expect((await holder.ctx.get(`${API_NODE_BASE}/admin/clients?limit=1`)).status()).toBe(200);
      expect((await holder.ctx.get(`${API_NODE_BASE}/admin/users`)).status()).toBe(403);

      // REVOKE: the master unticks roles.view on the ROLE...
      expect(
        (await masterPut(`/admin/roles/${role.id}`, { permissions: ['clients.view'] })).ok(),
      ).toBe(true);
      // ...and the holder's next request — same session, same cookie — refuses.
      expect(
        (await holder.ctx.get(`${API_NODE_BASE}/admin/roles`)).status(),
        'a revoked grant survived into the next request',
      ).toBe(403);
      expect((await holder.ctx.get(`${API_NODE_BASE}/admin/clients?limit=1`)).status()).toBe(200);

      // RE-GRANT: restoring the key restores the door, just as immediately.
      expect(
        (
          await masterPut(`/admin/roles/${role.id}`, {
            permissions: ['clients.view', 'roles.view'],
          })
        ).ok(),
      ).toBe(true);
      expect(
        (await holder.ctx.get(`${API_NODE_BASE}/admin/roles`)).status(),
        'a restored grant did not take effect live',
      ).toBe(200);
    } finally {
      await master.patch(`/admin/users/${holder.id}/status`, { status: 'suspended' });
      await holder.ctx.dispose();
      /*
       * The role is left behind, and it CANNOT be otherwise: its holder is
       * assigned to it, the API refuses to delete an assigned role (rightly),
       * and there is no way to delete an administrator. So this run adds a row
       * to a PAGED list other specs read — twenty-seven had accumulated before
       * a sweep failed on it, because `rbac-gating-and-masking` looked for the
       * seeded fixture on page one and it had drifted off.
       *
       * The durable fix is therefore in the READER: that spec walks the pages.
       * Recorded here so the next person adding a fixture-creating spec knows
       * the cost lands on somebody else's assertion.
       */
    }
  } finally {
    await master.dispose();
  }
});

test('the subset rule holds every escalation door shut, from a REAL limited session', async () => {
  test.setTimeout(360_000);
  const master = await adminApiSession();
  try {
    // The limited manager: may run roles and admins, holds NO money key.
    const limitedRole = (await (
      await master.post('/admin/roles', {
        name: `E2E Limited Manager ${run}`,
        permissions: ['roles.view', 'roles.edit', 'admins.view', 'admins.edit', 'clients.view'],
      })
    ).json()) as { id: string };
    // A role ABOVE their ceiling, and a bystander admin to try to inflate.
    const biggerRole = (await (
      await master.post('/admin/roles', {
        name: `E2E Bigger Role ${run}`,
        permissions: ['wallets.credit'],
      })
    ).json()) as { id: string };
    const bystander = await acceptInvite(master, {
      name: 'bystander',
      permissions: ['clients.view'],
    });
    const manager = await acceptInvite(master, {
      name: 'manager',
      roleId: limitedRole.id,
    });

    const attempt = (method: 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown) =>
      manager.ctx[method === 'delete' ? 'delete' : method](`${API_NODE_BASE}${path}`, {
        headers: manager.headers,
        ...(data === undefined ? {} : { data }),
      });

    try {
      // Sanity: the manager's granted surface does work.
      expect((await manager.ctx.get(`${API_NODE_BASE}/admin/roles`)).status()).toBe(200);

      // Door 1 — MINT a role carrying a key they do not hold.
      expect(
        (
          await attempt('post', '/admin/roles', {
            name: `E2E Escalated ${run}`,
            permissions: ['wallets.credit'],
          })
        ).status(),
        'minted a role above their own ceiling',
      ).toBeGreaterThanOrEqual(400);

      // Door 2 — INFLATE the role they themselves hold.
      expect(
        (
          await attempt('put', `/admin/roles/${limitedRole.id}`, {
            permissions: ['roles.edit', 'admins.edit', 'wallets.credit'],
          })
        ).status(),
        'inflated their own role',
      ).toBeGreaterThanOrEqual(400);

      // Door 3 — hand a bystander a key neither of them holds.
      expect(
        (
          await attempt('patch', `/admin/users/${bystander.id}`, {
            permissions: ['clients.view', 'wallets.credit'],
          })
        ).status(),
        'granted a bystander a key the actor does not hold',
      ).toBeGreaterThanOrEqual(400);

      // Door 4 — hand THEMSELVES the key directly.
      expect(
        (
          await attempt('patch', `/admin/users/${manager.id}`, {
            permissions: ['wallets.credit'],
          })
        ).status(),
        'granted themselves a key they do not hold',
      ).toBeGreaterThanOrEqual(400);

      // Door 5 — assign the bystander onto the BIGGER role.
      expect(
        (
          await attempt('patch', `/admin/users/${bystander.id}`, { roleId: biggerRole.id })
        ).status(),
        'assigned a role above their own ceiling',
      ).toBeGreaterThanOrEqual(400);

      // Door 6 — DELETE the bigger role out from under its keys.
      expect(
        (await attempt('delete', `/admin/roles/${biggerRole.id}`)).status(),
        'deleted a role above their own ceiling',
      ).toBeGreaterThanOrEqual(400);

      // Door 7 — INVITE somebody in above their ceiling.
      expect(
        (
          await attempt('post', '/admin/invite', {
            email: `e2e-permdeep-escalee-${run}@oxshare-e2e.test`,
            name: 'E2E Escalee',
            permissions: ['wallets.credit'],
          })
        ).status(),
        'invited above their own ceiling',
      ).toBeGreaterThanOrEqual(400);

      // After all seven refusals, nothing actually moved: the bystander's
      // grants are exactly what the master issued, and the money key still
      // refuses them.
      const after = await master.get(`/admin/users?limit=100&q=e2e-permdeep`);
      expect(after.ok()).toBe(true);
      const rows =
        (
          (await after.json()) as {
            items?: { id: string; permissions: string[] }[];
          }
        ).items ?? [];
      const bystanderRow = rows.find((r) => r.id === bystander.id);
      expect(bystanderRow?.permissions ?? [], 'a refused grant left residue').not.toContain(
        'wallets.credit',
      );
      expect(
        (
          await bystander.ctx.post(`${API_NODE_BASE}/admin/wallets/credit`, {
            headers: { ...bystander.headers, 'idempotency-key': `permdeep-${run}` },
            data: { userId: bystander.id, amount: '1.00000000', currency: 'USD' },
          })
        ).status(),
        'the bystander can somehow move money',
      ).toBe(403);
    } finally {
      await master.patch(`/admin/users/${manager.id}/status`, { status: 'suspended' });
      await master.patch(`/admin/users/${bystander.id}/status`, { status: 'suspended' });
      await manager.ctx.dispose();
      await bystander.ctx.dispose();
      /*
       * `biggerRole` CAN go — the escalation attempt to put the bystander on
       * it was refused, so nobody holds it. `limitedRole` cannot: the manager
       * is on it, and an assigned role is undeletable by design.
       */
      await master.del(`/admin/roles/${biggerRole.id}`);
    }
  } finally {
    await master.dispose();
  }
});
