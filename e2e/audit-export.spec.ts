import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { adminApiSession } from './helpers';

/**
 * The audit log leaves the building WHOLE — proven through the browser.
 *
 * ── Why this spec exists ───────────────────────────────────────────────────
 *
 * `GET /admin/audit-log/export` was served, permission-gated on `audit.view`
 * and covered by `masking-exports.spec.ts` — which only ever asserted that a
 * RESTRICTED admin is refused it. Nobody had counted what a permitted admin
 * actually receives, and no screen rendered a control for it at all, so the
 * whole surface existed without a single browser reaching it.
 *
 * Both halves were broken on 11 Sep 2026:
 *
 *  1. `AdminExportService.auditBatch` asked `AuditLogStore.findAll` for 1,000
 *     rows a batch. `findAll` ran the request through `pageSize()`, which
 *     clamps to MAX_PAGE_SIZE (100). `streamCsv` treats a SHORT BATCH as the
 *     end of the data — so it wrote 100 rows and stopped, on a table holding
 *     1,600. No error, no truncation notice (that only fires past
 *     MAX_EXPORT_ROWS = 200,000), and a file that looks completely ordinary.
 *     This is defect class 7 in its most expensive form: the failure renders
 *     as a plausible smaller answer rather than as a failure.
 *  2. The audit-log screen had no export control, so the only way to reach
 *     the endpoint was to construct the URL by hand.
 *
 * A compliance reviewer is handed this file. "The first hundred rows" and
 * "every row" are indistinguishable to whoever opens it.
 *
 * ── Why the row count is compared, and not the contents ────────────────────
 *
 * Counting LINES is exact here, which is not generally true of CSV. Every
 * column is a timestamp, an email, a uuid, an enum, an IP, or `details` — and
 * `details` is `JSON.stringify`d, which escapes newlines as `\n` rather than
 * emitting them. So no field can contain a literal newline and one record is
 * always one line. If a column is ever added that can, this assertion has to
 * change with it.
 */
test('the audit export downloads EVERY matching row, not the first page of them', async ({
  page,
}) => {
  // Two admin logins against a 5-a-minute-per-IP cap; `adminApiSession` sleeps
  // the cap out at 65s, which cannot fit the default 60s timeout.
  test.setTimeout(180_000);
  const admin = await adminApiSession();

  try {
    const listRes = await admin.get('/admin/audit-log?limit=1');
    expect(listRes.ok(), `the audit list answered ${listRes.status()}`).toBe(true);
    const { total } = (await listRes.json()) as { total: number };

    /*
     * THE NON-VACUITY FLOOR, and the most important line in this file.
     *
     * The defect is an export that stops at MAX_PAGE_SIZE. On a table holding
     * fewer rows than that, a truncating export and a correct one produce
     * byte-identical files — so every assertion below would pass against the
     * bug, and this spec would be a test that cannot fail.
     *
     * The dev database accumulates audit rows from every run (1,600 when the
     * defect was found), and this suite mints more of its own, so the floor is
     * comfortably met in practice. It is asserted rather than assumed because
     * the day it is NOT met is the day this spec silently stops testing
     * anything, and that must read as a failure rather than as a pass.
     */
    expect(
      total,
      'fewer than one page of audit rows exist, so this spec cannot see a truncating ' +
        'export — seed more history rather than trusting the green',
    ).toBeGreaterThan(100);

    // ALL time: the page opens on today since the period filter (6 Oct 2026), and
    // the export follows the page — while `total` above counts every row.
    await page.goto('/audit-log?range=all');
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^export$/i }).click(),
    ]);

    // The file is named for the day it was taken — an audit artefact nobody can
    // date is one nobody can file.
    expect(download.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);

    const path = await download.path();
    const csv = await readFile(path, 'utf8');
    const lines = csv.trim().split('\n');
    const header = lines[0];
    const dataRows = lines.length - 1;

    expect(header, 'the CSV lost its header row').toContain('Action');

    /*
     * `>=`, not `===`. `total` was counted at an earlier instant than the
     * export was taken, rows are only ever APPENDED to this table (D-21), and
     * this suite writes audit rows of its own while it runs — so the export
     * legitimately sees at least as many rows as the count did, and demanding
     * equality would make this flake for a reason that is not a defect.
     *
     * It still kills the bug outright: under the clamp this is exactly 100
     * against a `total` in the thousands.
     */
    expect(
      dataRows,
      `the export returned ${dataRows} rows; the log holds at least ${total}`,
    ).toBeGreaterThanOrEqual(total);

    /*
     * Truncation is a thing the file must SAY, never something it does quietly.
     * Far below MAX_EXPORT_ROWS (200,000) here, so the notice must be absent.
     *
     * Matched on the notice's own opening token rather than on /truncat/i:
     * `details` is jsonb serialised whole, so an audit row describing anything
     * truncated would put that word in the file legitimately and fail this for
     * a reason that is not a defect.
     */
    expect(csv, 'an unexpected truncation notice').not.toContain(
      'TRUNCATED: this export stopped at the',
    );
  } finally {
    await admin.dispose();
  }
});
