import { expect, test } from './fixtures';
import { adminApi, E2E_DOMAIN } from './helpers';
import { completeAuthenticator } from './authenticator';

/**
 * RBAC-07 — an administrator is invited with a role, accepts in a clean
 * browser, is signed in with EXACTLY that role's permissions, and can be
 * suspended out of their live session.
 *
 * The invitee is a permanent row (there is no DELETE /admin/users), named
 * under the suite's domain so a human can tell it apart; one per run.
 */
test('invite → accept → the invitee holds the role and nothing more → suspension ends the session', async ({
  context,
  browser,
}) => {
  const api = await adminApi(context);
  const roles = (await (await api.get('/admin/roles')).json()) as { id: string; name: string }[];
  const restrictedRole = roles.find((r) => r.name === 'E2E Restricted');
  expect(restrictedRole, 'the E2E Restricted role is not seeded').toBeTruthy();

  const email = `e2e-invitee-${Date.now()}@${E2E_DOMAIN}`;
  const created = await api.post('/admin/invite', {
    email,
    name: 'E2E Invitee',
    roleId: restrictedRole!.id,
  });
  expect(created.ok(), `invite answered ${created.status()}`).toBe(true);
  const { inviteUrl } = (await created.json()) as { inviteUrl?: string };
  expect(inviteUrl, 'the invite link is echoed outside production only').toBeTruthy();
  const token = new URL(inviteUrl!).searchParams.get('token')!;

  // A second invite for the same address is refused while the first is live.
  const dup = await api.post('/admin/invite', { email, name: 'Again', roleId: restrictedRole!.id });
  expect(dup.status()).toBe(409);

  // Accept in a CLEAN browser, as the invitee would.
  /*
   * TRULY clean, stated explicitly: in @playwright/test, `browser.newContext()`
   * inherits the project's storageState — the shared MASTER jar. Accepting an
   * invite while presenting a session now DISPLACES that session (the
   * signed-in-elsewhere fix), so a bare newContext here revoked the master
   * family and 401'd every later spec in the run.
   */
  const invitee = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await invitee.newPage();
  const logins: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/admin/auth/login')) logins.push(r.url());
  });
  await page.goto(`/invite/accept?token=${encodeURIComponent(token)}`);
  await page.locator('#new-password').fill('Invitee-pass-123!');
  await page.locator('#confirm-password').fill('Invitee-pass-123!');
  const [accepted] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/admin/invite/accept') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /activate/i }).click(),
  ]);
  expect(accepted.status(), 'accepting the invite failed').toBe(200);
  // Accepting ends in the authenticator step (0191), like every sign-in.
  await completeAuthenticator(page, email);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  // Accepting IS signing in: no separate login call happened.
  expect(logins).toEqual([]);

  // Exactly the role's permissions, from the server.
  const inviteeApi = await adminApi(invitee);
  const me = await inviteeApi.get('/admin/auth/me');
  expect(me.ok()).toBe(true);
  const profile = (await me.json()) as { id: string; permissions: string[] };
  // `kyc.view` too: approving or rejecting KYC requires the page it happens on
  // (the catalog's `requires`, applied on every save since backend 0204).
  expect([...profile.permissions].sort()).toEqual([
    'clients.view',
    'kyc.review',
    'kyc.view',
    'tags.view',
  ]);

  // A section outside the role: closed door, and the API refuses too.
  await page.goto('/roles');
  await expect(page.getByText(/access denied/i)).toBeVisible();
  expect((await inviteeApi.get('/admin/roles')).status()).toBe(403);

  // Suspension reaches the live session on its next navigation.
  const suspended = await api.patch(`/admin/users/${profile.id}/status`, { status: 'suspended' });
  expect(suspended.ok(), `suspend answered ${suspended.status()}`).toBe(true);
  // The eviction is a hard navigation that can interrupt this very load —
  // ERR_ABORTED on the goto IS the suspension working; the URL is the test.
  await page.goto('/clients').catch(() => null);
  await expect(page, 'a suspended administrator kept their session').toHaveURL(/\/login/, {
    timeout: 20_000,
  });
  await invitee.close();
});
