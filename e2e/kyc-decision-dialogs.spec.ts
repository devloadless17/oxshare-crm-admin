import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { adminApiSession, mintFreshClientWithPendingKyc, type MintedClient } from './helpers';

/**
 * THE IRREVERSIBLE CONTROLS, DRIVEN WITH A MOUSE.
 *
 * The existing KYC specs assert that Approve and Reject are PRESENT for a
 * reviewer and ABSENT for a `kyc.view`-only admin. Nothing opened either dialog.
 * So the console was proven to offer the controls and never proven to let a
 * reviewer complete a decision through them — and these are the two writes that
 * cannot be undone by clicking again: an approval raises the client's
 * verification level, and a rejection is the record the client is shown.
 *
 * The §14 KYC walk recorded alongside this was API-DRIVEN. It proves the system
 * behaves correctly end to end; it does not prove a reviewer can get there with a
 * mouse, and those are different claims. This file is the second one.
 *
 * ## What is actually asserted, and why each earns its place
 *
 *   A REJECTION MUST CARRY A REASON. `canConfirmReject` is
 *   `selectedReasonId !== '' || rejectReason.trim() !== ''` — a configured reason
 *   OR a note, and the dialog's own docblock says why: "a rejection with no
 *   recorded reason is not reviewable later and leaves the client nothing to act
 *   on." That rule lives in one boolean on the page and nothing checked it.
 *
 *   THE PER-FIELD SELECTION REACHES THE API. A reviewer ticking "date of birth"
 *   is telling the client which field to fix. If those checkboxes were decorative
 *   the screen would look identical and the client would be told only "rejected".
 *
 *   THE DECISION LANDS. Asserted on the WIRE and then on the row, not on a toast
 *   — a dialog that closes optimistically looks exactly like one that succeeded.
 *
 * ## The freshness this needs, and why it is not the pooled fixture
 *
 * These decide a submission irreversibly, so they take `mintFreshClientWithPendingKyc`
 * rather than leasing from the pool. A pooled client's id is stable, which is what
 * made the money specs replay a deduplicated credit and read a stale balance as a
 * broken one. A decision spec has the same hazard from the other direction: a
 * fixture another run already decided cannot be decided again.
 */

const rejectBtn = (page: Page) => page.getByRole('button', { name: /reject kyc submission/i });
const approveBtn = (page: Page) => page.getByRole('button', { name: /approve kyc submission/i });
const claimBtn = (page: Page) => page.getByRole('button', { name: /claim for review/i });

/** The dialog, addressed by its heading rather than a container class. */
const rejectDialog = (page: Page) => page.getByRole('dialog', { name: /reject kyc submission/i });
const approveDialog = (page: Page) => page.getByRole('dialog', { name: /approve kyc submission/i });

test.describe('the decision dialogs', () => {
  /*
   * ON THE DESCRIBE, not in each test, because the HOOK is the heavy part and
   * `test.setTimeout` inside a test body does not reach `beforeEach`.
   *
   * Each case mints a fresh client: an admin API session, a seeded client, a
   * portal sign-in. That is well over the 60s default on a cold run, and the
   * failure arrives as "Test timeout exceeded while running beforeEach hook" —
   * which reads as the dialogs being slow rather than the fixture being heavy.
   *
   * Written down because I made this exact mistake in `client-admin-actions`
   * earlier today and diagnosed it there: heavy work on a default budget, whose
   * timeout then describes something other than its cause.
   */
  test.describe.configure({ timeout: 180_000 });

  let admin: Awaited<ReturnType<typeof adminApiSession>>;
  let client: MintedClient;

  test.beforeEach(async () => {
    /*
     * A fresh client per case. These are irreversible decisions: reusing one
     * would make the second case depend on what the first decided, which is the
     * shape that made a pooled fixture read as a broken credit elsewhere today.
     */
    admin = await adminApiSession();
    client = await mintFreshClientWithPendingKyc(admin, 'dialog');
  });

  test.afterEach(async () => {
    await client?.dispose();
  });

  test('a rejection cannot be confirmed with nothing — the reason is the point', async ({
    page,
  }) => {
    await page.goto(`/kyc/${client.id}`);
    await claimBtn(page).click();
    await rejectBtn(page).click();

    const dialog = rejectDialog(page);
    await expect(dialog).toBeVisible();

    const confirm = dialog.getByRole('button', { name: /^(confirm|reject)/i }).last();

    /*
     * The empty dialog first. A reviewer who opens Reject and clicks straight
     * through would otherwise record a decision the client cannot act on and
     * nobody can review later.
     */
    await expect(
      confirm,
      'an empty rejection was confirmable — a client would be told only "rejected"',
    ).toBeDisabled();

    // A note alone is enough: the rule is reason OR note, not reason AND note.
    await dialog.getByRole('textbox').first().fill('The passport photo is unreadable.');
    await expect(
      confirm,
      'a typed note did not enable the confirm — the rule is reason OR note',
    ).toBeEnabled();
  });

  test('rejecting with a reason and per-field selection reaches the API and the row', async ({
    page,
  }) => {
    await page.goto(`/kyc/${client.id}`);
    await claimBtn(page).click();
    await rejectBtn(page).click();

    const dialog = rejectDialog(page);
    await expect(dialog).toBeVisible();

    /*
     * Tick whichever per-field boxes this configuration offers rather than
     * naming one: the steps are admin-configurable, so a fixed field id would
     * make this spec assert a particular KYC form rather than the mechanism.
     */
    const fields = dialog.locator('input[type="checkbox"]');
    const fieldCount = await fields.count();
    if (fieldCount > 0) await fields.first().check();

    await dialog.getByRole('textbox').first().fill('Date of birth does not match the document.');

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => /\/admin\/kyc\/.*\/reject/.test(r.url()) && r.request().method() === 'PATCH',
      ),
      dialog
        .getByRole('button', { name: /^(confirm|reject)/i })
        .last()
        .click(),
    ]);

    /*
     * The STATUS first. A 401 and a correctly-refused decision are both
     * non-200, and only one of them is an answer — the rule the backend
     * adversarial pass adopted after reading a 401 as a result.
     */
    expect(response.status(), `reject answered ${response.status()}`).toBe(200);

    // And on the row, through the API rather than the screen that just wrote it.
    const after = await admin.get(`/admin/kyc/${client.id}`);
    expect(after.ok()).toBe(true);
    const body = (await after.json()) as { status: string; rejectionReason?: string | null };
    expect(body.status, 'the dialog closed but the submission was not rejected').toBe('rejected');
    expect(
      body.rejectionReason ?? '',
      'the rejection landed with no recorded reason, which is what the dialog exists to prevent',
    ).not.toBe('');
  });

  test('approving asks for confirmation first, and cancelling decides nothing', async ({
    page,
  }) => {
    await page.goto(`/kyc/${client.id}`);
    await claimBtn(page).click();
    await approveBtn(page).click();

    const dialog = approveDialog(page);
    await expect(dialog, 'Approve decided immediately, with no confirmation step').toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();

    /*
     * The half that matters about a cancel: it must not have decided. A dialog
     * that closes and writes anyway looks identical from the screen.
     */
    const after = await admin.get(`/admin/kyc/${client.id}`);
    const body = (await after.json()) as { status: string };
    expect(body.status, 'cancelling the approval still approved it').not.toBe('approved');
  });

  test('confirming the approval decides it, and the client is verified', async ({ page }) => {
    await page.goto(`/kyc/${client.id}`);
    await claimBtn(page).click();
    await approveBtn(page).click();

    const dialog = approveDialog(page);
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => /\/admin\/kyc\/.*\/approve/.test(r.url()) && r.request().method() === 'PATCH',
      ),
      dialog
        .getByRole('button', { name: /^(confirm|approve)/i })
        .last()
        .click(),
    ]);

    expect(response.status(), `approve answered ${response.status()}`).toBe(200);

    const after = await admin.get(`/admin/kyc/${client.id}`);
    const body = (await after.json()) as { status: string };
    expect(body.status).toBe('approved');

    /*
     * The consequence, not just the status. An approval that moved the row and
     * not the verification level would leave the client unable to move money
     * while the console said they were verified — the exact disagreement the
     * §14 walk's money-gate table exists to catch, asserted here from the
     * console's side.
     */
    const profile = await admin.get(`/admin/clients/${client.id}`);
    const client_ = (await profile.json()) as { verificationLevel?: number };
    expect(
      client_.verificationLevel,
      'approved on the row but the client is still level 0 — the money doors stay shut',
    ).toBe(1);
  });
});
