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

/*
 * ── THE LAST-MANAGER CASE MOVED, AND THE REASON IT NEVER RAN WAS NOT THE DATABASE ──
 *
 * A case here used to assert that unticking `roles.edit` on the only role
 * carrying it is refused. It never ran in any environment, and its guards were
 * blamed on database state: a fresh CI database seeds three roles carrying the
 * key, and a shared dev database accumulates manager roles forever (54 had
 * built up), so "exactly one holder" was never true.
 *
 * Shaping the database would not have fixed it. On `roles.edit` the refusal is
 * UNREACHABLE THROUGH THIS DOOR by construction: for the write to be refused
 * nobody may hold the key afterwards, but editing a role at all requires
 * holding `roles.edit`, and editing your OWN role is refused earlier and
 * flatly. The actor is therefore always a surviving holder. No fixture makes
 * that false.
 *
 * The reachable key is `admins.edit` — editing a role does not require holding
 * it — and that is now proven in the backend suite, which owns a real Postgres
 * per run via Testcontainers and does not run the seeds:
 *
 *   oxshare-crm-backend/test/last-manager-role-edit.spec.ts
 *
 * Three cases: the refusal, an ALLOWED control where a second role still
 * carries the key (so the guard is not simply rejecting every edit), and that
 * only ACTIVE holders count. The case was pure HTTP and was only ever in the
 * browser suite by proximity to the roles screen.
 */

// Keep the domain helper referenced for invitee-style fixtures in sibling specs.
void E2E_DOMAIN;
