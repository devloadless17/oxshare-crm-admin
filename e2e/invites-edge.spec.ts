import { request } from '@playwright/test';
import { expect, test } from './fixtures';
import { adminApiSession, API_NODE_BASE, APP_ORIGIN } from './helpers';

/**
 * The invite lifecycle's REFUSALS — the half the happy path in
 * admin-users-lifecycle.spec.ts cannot show. An invite token is a bearer
 * credential that mints an administrator account, so what matters most is
 * every way it must STOP working: revocation, spending, and re-inviting an
 * address that already holds an account.
 */

const run = Date.now();

test('a revoked token is dead everywhere, a spent token is dead forever', async () => {
  test.setTimeout(120_000);
  const master = await adminApiSession();
  const anonymous = await request.newContext();
  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;

  try {
    // ── Revocation ───────────────────────────────────────────────────────
    const revokeeEmail = `e2e-invedge-revoked-${run}@oxshare-e2e.test`;
    const created = await master.post('/admin/invite', {
      email: revokeeEmail,
      name: 'E2E Revoked Invite',
      permissions: ['clients.view'],
    });
    expect(created.ok(), `invite answered ${created.status()}`).toBe(true);
    const revokedToken = tokenOf(
      ((await created.json()) as { inviteUrl?: string }).inviteUrl ?? '',
    );

    // The token IS valid until somebody revokes it.
    expect(
      (
        await anonymous.get(
          `${API_NODE_BASE}/admin/invite/validate?token=${encodeURIComponent(revokedToken)}`,
        )
      ).ok(),
    ).toBe(true);

    // The console lists it as outstanding; revoking needs its id.
    const listed = await master.get('/admin/invites');
    expect(listed.ok()).toBe(true);
    const rows = (await listed.json()) as unknown;
    const flat = (Array.isArray(rows) ? rows : (rows as { items: unknown[] }).items) as {
      id: string;
      email: string;
    }[];
    const inviteId = flat.find((r) => r.email === revokeeEmail)?.id;
    expect(inviteId, 'the outstanding invite is not listed').toBeTruthy();

    expect((await master.del(`/admin/invites/${inviteId}`)).ok()).toBe(true);

    // Dead at the validation oracle AND at the door itself.
    expect(
      (
        await anonymous.get(
          `${API_NODE_BASE}/admin/invite/validate?token=${encodeURIComponent(revokedToken)}`,
        )
      ).status(),
      'a revoked token still validates',
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await anonymous.post(`${API_NODE_BASE}/admin/invite/accept`, {
          headers: { Origin: APP_ORIGIN },
          data: { token: revokedToken, password: 'Should-never-work-123!' },
        })
      ).status(),
      'a revoked token still mints an account',
    ).toBeGreaterThanOrEqual(400);

    // ── Spending ─────────────────────────────────────────────────────────
    const spendeeEmail = `e2e-invedge-spent-${run}@oxshare-e2e.test`;
    const second = await master.post('/admin/invite', {
      email: spendeeEmail,
      name: 'E2E Spent Invite',
      permissions: ['clients.view'],
    });
    expect(second.ok()).toBe(true);
    const spentToken = tokenOf(((await second.json()) as { inviteUrl?: string }).inviteUrl ?? '');

    const invitee = await request.newContext();
    try {
      const accepted = await invitee.post(`${API_NODE_BASE}/admin/invite/accept`, {
        headers: { Origin: APP_ORIGIN },
        data: { token: spentToken, password: `Invedge-${run}-123!` },
      });
      expect(accepted.ok(), `accept answered ${accepted.status()}`).toBe(true);
      const me = (await (await invitee.get(`${API_NODE_BASE}/admin/auth/me`)).json()) as {
        id: string;
      };

      // The SAME token again — from a clean context, as a replayed link would be.
      expect(
        (
          await anonymous.post(`${API_NODE_BASE}/admin/invite/accept`, {
            headers: { Origin: APP_ORIGIN },
            data: { token: spentToken, password: 'Second-account-please-123!' },
          })
        ).status(),
        'a spent invite minted a second session',
      ).toBeGreaterThanOrEqual(400);

      // ── An address that already holds an account cannot be re-invited ──
      expect(
        (
          await master.post('/admin/invite', {
            email: spendeeEmail,
            name: 'E2E Spent Invite Again',
            permissions: ['clients.view'],
          })
        ).status(),
        're-invited an existing administrator',
      ).toBeGreaterThanOrEqual(400);

      await master.patch(`/admin/users/${me.id}/status`, { status: 'suspended' });
    } finally {
      await invitee.dispose();
    }
  } finally {
    await anonymous.dispose();
    await master.dispose();
  }
});
