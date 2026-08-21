import { expect, test } from './fixtures';
import { adminApi, E2E_DOMAIN } from './helpers';

/**
 * RBAC-02 / RBAC-07 — a role is created, edited and deleted through the console,
 * and every step is confirmed from the API, not from the screen.
 */
const roleName = () => `E2E Role ${Date.now()}`;

test('creates a role with one permission, sees it on the wire, and deletes it', async ({
  page,
  context,
}) => {
  const api = await adminApi(context);
  const name = roleName();

  await page.goto('/roles/new');
  await page.locator('#role-name').fill(name);
  // The permission matrix labels each checkbox by `perm-<key>`.
  await page.locator('[id="perm-clients.view"]').check();
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/admin/roles') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /create role/i }).click(),
  ]);
  expect(created.status(), 'the role was not created').toBe(201);
  const role = (await created.json()) as { id: string; permissions: string[] };
  expect(role.permissions).toEqual(['clients.view']);

  // The list knows it — from the server.
  const listed = (await (await api.get('/admin/roles')).json()) as { id: string; name: string }[];
  expect(listed.some((r) => r.id === role.id && r.name === name)).toBe(true);

  // And it can be deleted, because nobody holds it.
  const deleted = await api.del(`/admin/roles/${role.id}`);
  expect(deleted.ok(), `delete answered ${deleted.status()}`).toBe(true);
  const after = (await (await api.get('/admin/roles')).json()) as { id: string }[];
  expect(after.some((r) => r.id === role.id)).toBe(false);
});

test('refuses to delete a role that is assigned', async ({ context }) => {
  // The seeded restricted admin holds "E2E Restricted".
  const api = await adminApi(context);
  const roles = (await (await api.get('/admin/roles')).json()) as { id: string; name: string }[];
  const held = roles.find((r) => r.name === 'E2E Restricted');
  expect(held, 'the E2E Restricted role is not seeded').toBeTruthy();
  const refused = await api.del(`/admin/roles/${held!.id}`);
  expect(refused.status()).toBe(409);
});

test('refuses to untick the last roles.edit from the only role carrying it', async ({
  context,
}) => {
  /*
   * The invariant that replaced the master tier: nobody may leave the system
   * unmanageable. It used to run only when SUSPENDING the last holder; editing
   * the role walked straight past it. Asserted here only when this database
   * has exactly one role carrying `roles.edit` with an active holder — on a
   * shared dev DB that is usually the Administrator role.
   */
  const api = await adminApi(context);
  const roles = (await (await api.get('/admin/roles')).json()) as {
    id: string;
    name: string;
    permissions: string[];
    isSystem?: boolean;
  }[];
  const admins = (await (await api.get('/admin/users')).json()) as
    | { items: { roleId?: string; status: string; permissions: string[] }[] }
    | { roleId?: string; status: string; permissions: string[] }[];
  const rows = Array.isArray(admins) ? admins : admins.items;
  const holdersOfRolesEdit = rows.filter(
    (a) =>
      a.status === 'active' &&
      (roles.find((r) => r.id === a.roleId)?.permissions ?? a.permissions).includes('roles.edit'),
  );
  const viaRoles = new Set(holdersOfRolesEdit.map((a) => a.roleId).filter(Boolean));
  test.skip(
    viaRoles.size !== 1 || holdersOfRolesEdit.some((a) => !a.roleId),
    `not decidable here: roles.edit is held through ${viaRoles.size} role(s)`,
  );
  const [onlyRoleId] = [...viaRoles];
  const role = roles.find((r) => r.id === onlyRoleId)!;
  test.skip(Boolean(role.isSystem), 'the only manager role is a system role');
  // Nobody may edit their OWN role at all (a flat 403, before any other check),
  // so the case is only decidable from an actor who is not on that role.
  const me = (await (await api.get('/admin/auth/me')).json()) as { roleId?: string };
  test.skip(me.roleId === onlyRoleId, 'the only manager role is the one this actor holds');

  const stripped = role.permissions.filter((p) => p !== 'roles.edit');
  const refused = await api.put(`/admin/roles/${role.id}`, { permissions: stripped });
  expect(refused.status()).toBe(400);
  expect(JSON.stringify(await refused.json())).toMatch(/roles\.edit/);
});

// Keep the domain helper referenced for invitee-style fixtures in sibling specs.
void E2E_DOMAIN;
