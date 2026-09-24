import { expect, test } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import { acceptAdminInvite, adminApiSession, browserStateFrom, clientIdByEmail } from './helpers';

/**
 * RBAC-03 field masking on a client's NAME, driven as a real masked operator.
 *
 * Reported from the running console: "when I choose to hide a first name only,
 * both first and last name are hidden."
 *
 * `client.firstName` and `client.lastName` are separate entries in the backend
 * catalog with separate aliases, and the server strips exactly the one that
 * was masked — it was the CONSOLE that collapsed them. The client directory
 * kept its Name column only when BOTH halves were permitted, and the profile
 * heading wrapped the whole assembled name in a `Field` keyed on
 * `client.firstName` alone, so the redaction chip swallowed a surname the
 * viewer was entitled to read.
 *
 * The same screenshot showed the second half of the bug: the banner above the
 * table read
 *
 *   "Some columns are hidden by your permissions: Name,
 *    client.referrer.firstName, client.referredClients.firstName"
 *
 * — two catalog ALIASES, printed raw, naming nothing on that screen.
 */

const SEEDED_CLIENT = 'client@oxshare.com';

/** An operator whose role hides exactly the fields named, and nothing else. */
async function maskedOperator(
  browser: Browser,
  master: Awaited<ReturnType<typeof adminApiSession>>,
  maskedFields: string[],
  label: string,
) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  /*
   * ⚠️ ONE ROLE PER MASK SHAPE, REUSED — not a fresh one per run.
   *
   * A role cannot be deleted while any admin references it, and an admin
   * cannot be deleted at all (suspension is the terminal state), so a
   * per-run role is a role that accumulates for ever. Nine of them had piled
   * up locally, which pushed `E2E Restricted` off the first page of the roles
   * list and failed `rbac-gating-and-masking` — a spec that has nothing to do
   * with masking names. Test litter that breaks a NEIGHBOUR is the worst kind,
   * because the failure names the wrong file.
   *
   * The name is deterministic, so a second run finds the role it made last
   * time. Its mask is re-asserted on every use, so an edited row cannot make a
   * later run assert against terms it did not set.
   */
  const roleName = `E2E Mask ${label}`;
  /*
   * `GET /admin/roles` answers a BARE ARRAY, not `{ roles: [...] }` — reading
   * the property that is not there left `existing` undefined, so this posted a
   * duplicate name and got a 409. Both shapes are accepted here because the
   * admin app's own client tolerates both, and a test that guesses wrong fails
   * as a conflict rather than as a shape mismatch.
   */
  const roleList = (await (await master.get('/admin/roles')).json()) as
    { id: string; name: string }[] | { roles?: { id: string; name: string }[] };
  const existing = (Array.isArray(roleList) ? roleList : (roleList.roles ?? [])).find(
    (r) => r.name === roleName,
  );

  const saved = existing
    ? await master.put(`/admin/roles/${existing.id}`, {
        name: roleName,
        description: 'Reused by masking-names.spec.ts',
        permissions: ['clients.view'],
        maskedFields,
      })
    : await master.post('/admin/roles', {
        name: roleName,
        description: 'Reused by masking-names.spec.ts',
        permissions: ['clients.view'],
        maskedFields,
      });
  expect(saved.ok(), `saving the role answered ${saved.status()}`).toBe(true);
  const roleId = existing ? existing.id : ((await saved.json()) as { id: string }).id;

  const invited = await master.post('/admin/invite', {
    email: `e2e-mask-${label}-${stamp}@oxshare-e2e.test`,
    name: `E2E Mask ${label}`,
    roleId,
  });
  expect(invited.ok(), `the invite answered ${invited.status()}`).toBe(true);
  const token = new URL(
    ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
  ).searchParams.get('token')!;

  const admin = await acceptAdminInvite(token, `Mask-${stamp}-123!`);
  const context = await browser.newContext({ storageState: await browserStateFrom(admin.ctx) });
  return {
    page: await context.newPage(),
    async dispose() {
      await context.close();
      // Suspended, never deleted: there is no admin DELETE, and suspension is
      // the terminal state this console models. The ROLE is deliberately left
      // in place and reused by the next run — see the note above.
      await master.patch(`/admin/users/${admin.id}/status`, { status: 'suspended' });
      await admin.ctx.dispose();
    },
  };
}

const nameHeader = (page: Page) => page.getByRole('columnheader', { name: /^name$/i });
const maskNotice = (page: Page) => page.getByText(/hidden by your permissions/i);

test.describe('hiding one half of a name', () => {
  test('leaves the OTHER half readable, in the list and on the profile', async ({ browser }) => {
    test.setTimeout(300_000);
    const master = await adminApiSession();
    const op = await maskedOperator(browser, master, ['client.firstName'], 'first');
    try {
      const { page } = op;
      await page.goto('/clients');
      await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

      // ⚠️ THE REPORTED BUG. The column used to disappear entirely.
      await expect(nameHeader(page), 'hiding the first name removed the Name column').toBeVisible();

      /*
       * And it still carries a name. The server omitted `firstName` from every
       * row, so what is left is the surname — the truthful answer to "what of
       * this person's name may I see", rather than nothing at all.
       */
      const names = await page.locator('tbody tr td:nth-child(1)').allTextContents();
      expect(names.length, 'no client rows to check').toBeGreaterThan(0);
      expect(
        names.some((n) => n.trim().length > 0),
        'the Name column survived but renders nothing',
      ).toBe(true);

      /*
       * The banner names the column, and ONLY things on this screen. The two
       * alias keys it used to print are not columns here and mean nothing to
       * the person reading it.
       */
      await expect(maskNotice(page)).toBeVisible();
      const notice = (await maskNotice(page).textContent()) ?? '';
      expect(notice, 'the banner is printing raw catalog keys again').not.toMatch(
        /client\.[a-z]+\.[a-zA-Z]+/,
      );
      expect(notice).toMatch(/name/i);

      /*
       * The sort goes with the value. The API orders by `users.first_name`, so
       * a sortable header for a viewer who cannot read that column is an
       * ordering oracle — one click and the alphabetical sequence of names
       * they may not see sits beside the ids.
       */
      expect(
        await nameHeader(page).getByRole('button').count(),
        'a hidden column is still offering its sort',
      ).toBe(0);

      // The profile heading: the same collapse, in the other direction.
      const clientId = await clientIdByEmail(master, SEEDED_CLIENT);
      await page.goto(`/clients/${clientId}`);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible({ timeout: 30_000 });
      expect(
        ((await heading.textContent()) ?? '').replace(/[•\s]/g, ''),
        'the heading redacted the whole name over one masked half',
      ).not.toBe('');
    } finally {
      await op.dispose();
      await master.dispose();
    }
  });

  test('drops the column only when NEITHER half is readable', async ({ browser }) => {
    test.setTimeout(300_000);
    const master = await adminApiSession();
    const op = await maskedOperator(
      browser,
      master,
      ['client.firstName', 'client.lastName'],
      'both',
    );
    try {
      const { page } = op;
      await page.goto('/clients');
      await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });

      /*
       * A column of identical redaction chips spends horizontal space saying
       * one thing twenty-five times. With nothing left to render, the column
       * goes and the banner says so once.
       */
      await expect(nameHeader(page)).toBeHidden();
      await expect(maskNotice(page)).toBeVisible();

      // Said ONCE, though two keys are hidden — both label as "Name", and
      // "hidden: Name, Name" reads as a bug in the console.
      const notice = (await maskNotice(page).textContent()) ?? '';
      expect((notice.match(/name/gi) ?? []).length, 'the banner said "Name" twice').toBe(1);

      // The client is still identifiable: `client.portalId` is declared
      // non-maskable precisely so a fully masked row can still be quoted to
      // support — the Portal ID column, since 0133.
      await expect(page.getByRole('columnheader', { name: /^portal id$/i })).toBeVisible();
    } finally {
      await op.dispose();
      await master.dispose();
    }
  });

  test('an unmasked operator sees the whole name and its sort', async ({ page }) => {
    // The control. Without it, every assertion above would also pass on a
    // console that had simply stopped rendering names for everybody.
    await page.goto('/clients');
    await expect(page.locator('thead')).toBeVisible({ timeout: 30_000 });
    await expect(nameHeader(page)).toBeVisible();
    expect(await nameHeader(page).getByRole('button').count()).toBe(1);
    await expect(maskNotice(page)).toBeHidden();
  });
});
