import { expect, test } from './fixtures';
import { adminApiSession, E2E_ADMIN } from './helpers';

/**
 * FR-CORE-19 / D-21 — the append-only admin action log, proven with rows this
 * run MINTS rather than rows it hopes are there:
 *
 * A tag is created, renamed, and deleted through the real API. That yields
 * three audit rows whose order, actor, and action names are known exactly —
 * so "newest first", "who did it", and "the filter goes through the server"
 * are assertions, not impressions.
 */

interface AuditEntry {
  action: string;
  actorEmail: string;
  subjectId: string | null;
  createdAt: string;
}

test('actions land in order, attributed, and the action filter narrows on the server', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const admin = await adminApiSession();
  const label = `E2E Audit ${Date.now()}`;
  let tagId = '';

  try {
    await test.step('mint three auditable actions: create → rename → delete', async () => {
      const created = await admin.post('/admin/tags', { label });
      expect(created.ok(), `tag create answered ${created.status()}`).toBe(true);
      tagId = ((await created.json()) as { id: string }).id;
      expect((await admin.patch(`/admin/tags/${tagId}`, { label: `${label} renamed` })).ok()).toBe(
        true,
      );
      expect((await admin.del(`/admin/tags/${tagId}`)).ok()).toBe(true);
    });

    await test.step('the log answers newest FIRST, each row owned by its actor', async () => {
      // The newest 100, not 10: other writes in a long run can push the tag's
      // first row past the tenth (a cross-host run saw two of three). The rows
      // are filtered to this tag below either way.
      // POLLED: configuration changes are audited fire-and-forget
      // (`AdminAuditService.record` — a lost audit row must not undo a tag
      // rename; money is audited inside its transaction instead), so the delete's
      // row can land a moment after its response. A cross-host run read too soon.
      let ours: AuditEntry[] = [];
      await expect(async () => {
        const res = await admin.get('/admin/audit-log?limit=100');
        expect(res.ok()).toBe(true);
        const { items } = (await res.json()) as { items: AuditEntry[] };
        ours = items.filter((e) => e.subjectId === tagId);
        expect(
          ours.map((e) => e.action),
          'three rows, newest first',
        ).toEqual(['client_tag.delete', 'client_tag.update', 'client_tag.create']);
      }).toPass({ timeout: 10_000 });
      for (const row of ours) {
        expect(row.actorEmail, 'a row without its actor is not an audit trail').toBe(
          E2E_ADMIN.email,
        );
      }
    });

    await test.step('the console renders it, and the action filter is SERVER-side', async () => {
      await page.goto('/audit-log');
      await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible();
      // Our freshest row is on page one before any filter. The action cell
      // renders the raw key; the FILTER options carry the human labels.
      await expect(page.getByRole('cell', { name: 'client_tag.delete' }).first()).toBeVisible();

      // Pick one action; the request must carry it as a query param.
      await page.getByRole('combobox').first().click();
      const [filtered] = await Promise.all([
        // The API GET only: the page's OWN URL carries the same param (that is
        // the point — an investigation is a link), so Next's RSC fetches to
        // :3002 match a naive predicate and hand back a non-JSON body.
        page.waitForResponse(
          (r) =>
            r.url().includes('/v1/admin/audit-log') &&
            r.url().includes('action=client_tag.create') &&
            r.request().method() === 'GET' &&
            r.ok(),
        ),
        page.getByRole('option', { name: /^client tag created$/i }).click(),
      ]);
      expect(filtered.ok()).toBe(true);
      const body = (await filtered.json()) as { items: AuditEntry[] };
      expect(body.items.length).toBeGreaterThan(0);
      for (const row of body.items) {
        expect(row.action, 'the filtered page leaked another action').toBe('client_tag.create');
      }
      // And the filter survives in the URL — an investigation is a LINK (D-21).
      expect(page.url()).toContain('action=client_tag.create');
    });

    await test.step('the vocabulary is fetched, never hardcoded — our action is offered', async () => {
      const actions = await admin.get('/admin/audit-log/actions');
      expect(actions.ok()).toBe(true);
      const text = JSON.stringify(await actions.json());
      for (const a of ['client_tag.create', 'withdrawal.approve', 'security.denied']) {
        expect(text, `${a} is missing from the filter vocabulary`).toContain(a);
      }
    });
  } finally {
    await admin.dispose();
  }
});
