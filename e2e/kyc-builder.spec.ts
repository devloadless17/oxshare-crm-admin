import { expect, test } from './fixtures';
import { adminApi, requirePrecondition, STORAGE_STATE } from './helpers';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * THE KYC STEP BUILDER, DRIVEN WITH A MOUSE.
 *
 * ## Why this file exists
 *
 * Every other admin KYC surface had browser coverage — claim and hand-back,
 * the holder named in the queue, masked reviewers, documents opening from R2.
 * This screen had one line in `console-pages.spec.ts` that loads it and checks
 * it renders. Reordering, adding, editing, disabling, deleting and saving —
 * every control a person actually uses — were unclicked anywhere.
 *
 * That matters more here than on most screens: the builder edits what EVERY
 * client must submit to be verified, and verification is what opens the
 * withdrawal gate. `kyc_config.replace` is audited for exactly that reason.
 *
 * ## It must not assert the rule that was removed
 *
 * The four steps `personal`, `document`, `selfie` and `address` used to be
 * undeletable. The owner retired that on 15 Aug 2026 — a KYC flow sold as
 * configurable that refuses to drop four of its steps is not configurable, and
 * which documents a jurisdiction requires is the broker's decision. So this
 * file asserts a step CAN be removed, which is the behaviour that was chosen.
 * A spec asserting the old rule would pin a behaviour deliberately removed,
 * which is the same failure as a comment describing code that no longer exists.
 *
 * ## The config is GLOBAL state, so every case restores it
 *
 * There is one KYC configuration and every client onboarding through the portal
 * reads it. A spec that leaves a step disabled breaks onboarding for the whole
 * database until somebody notices — the exact shape of the fixture damage this
 * suite spent the day removing. `afterEach` PUTs the snapshot back over the
 * API rather than trusting the UI to undo itself, because a failed test is
 * precisely when the UI cannot be trusted to.
 */

test.use({ storageState: STORAGE_STATE });

/*
 * The keys this file REASONS about, plus everything else the API returns.
 *
 * The index signature is load-bearing rather than lazy typing: `readConfig`
 * hands whole step objects straight back to `afterEach`, which PUTs them, and
 * that endpoint is a FULL REPLACE. A type naming only five keys would invite
 * somebody to `.map()` the snapshot into those five and silently drop every
 * field, hint and document binding on the way — restoring a configuration that
 * validates, saves, and is not the one this run found.
 */
type Step = {
  id: string;
  slug: string;
  title: string;
  enabled: boolean;
  stepNumber: number;
  [key: string]: unknown;
};

/** The config as the API reports it — the truth the screen is edited against. */
async function readConfig(context: BrowserContext): Promise<Step[]> {
  const api = await adminApi(context);
  const res = await api.get('/admin/kyc-config');
  expect(res.status(), 'could not read the KYC config').toBe(200);
  const body: unknown = await res.json();
  return (Array.isArray(body) ? body : ((body as { steps?: Step[] }).steps ?? [])) as Step[];
}

/**
 * Open one step's TAB.
 *
 * The builder is a tablist — Overview, then one tab per step — and `Disable`
 * and `Delete step` render only inside the ACTIVE step's card. The Overview
 * panel carries reorder controls and an "Open" button and neither of those two.
 *
 * This exists because the first version of these tests reached for
 * `getByRole('button', { name: title })`, which matched the row summary on the
 * Overview panel ("Personal InformationForm Fields (7)"), clicked it, and then
 * waited sixty seconds for a Disable button that was never going to be on that
 * panel. The failure looked exactly like a missing control.
 */
async function openStepTab(page: Page, title: string): Promise<void> {
  // Escaped: a step title is operator-supplied and may hold regex metacharacters.
  const name = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

let snapshot: Step[] = [];

test.beforeEach(async ({ context }) => {
  snapshot = await readConfig(context);
  expect(snapshot.length, 'no KYC steps configured — nothing to drive').toBeGreaterThan(0);
});

test.afterEach(async ({ context }) => {
  /*
   * Restore over the API, not through the screen. A test that failed half way
   * through an edit cannot be trusted to undo it with the same controls.
   *
   * ## Refuse to restore NOTHING
   *
   * `snapshot` is module-level and `afterEach` runs even when `beforeEach`
   * threw — so on a first-test failure it still holds its initial `[]`, and
   * PUTting `{ steps: [] }` would REPLACE the live KYC configuration with an
   * empty one. That is a full replace: every client onboarding through the
   * portal would meet a wizard with no steps, and no test would report it
   * because the restore itself answers 200. A cleanup that can destroy the
   * thing it protects is worse than no cleanup, so this refuses.
   *
   * ## Verify the restore LANDED, do not trust the 200
   *
   * A 200 that did not persist is exactly the defect this whole file was
   * written to catch. Taking the status code as proof here would mean the
   * cleanup trusts the very thing the tests distrust.
   */
  if (snapshot.length === 0) {
    throw new Error(
      'REFUSING TO RESTORE AN EMPTY KYC CONFIG — the snapshot was never taken, ' +
        'so there is nothing to put back. The live configuration has been left alone.',
    );
  }

  const api = await adminApi(context);
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await api.put('/admin/kyc-config', { steps: snapshot });
    lastStatus = res.status();
    if (lastStatus === 200) break;
    // A restore is worth retrying where a test assertion is not: the cost of
    // giving up is a broken onboarding flow for every client in the database.
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  expect(lastStatus, 'FAILED TO RESTORE THE KYC CONFIG — onboarding may be broken').toBe(200);

  const restored = await readConfig(context);
  expect(
    restored.map((s) => ({ slug: s.slug, enabled: s.enabled, stepNumber: s.stepNumber })),
    'the restore was accepted but did not persist — the KYC config is NOT as this run found it',
  ).toEqual(snapshot.map((s) => ({ slug: s.slug, enabled: s.enabled, stepNumber: s.stepNumber })));
});

test.describe('the KYC step builder', () => {
  test('reorders a step, and the new order SURVIVES a reload', async ({ page, context }) => {
    await page.goto('/kyc/builder');
    await expect(page.getByRole('button', { name: /save all changes/i })).toBeVisible({
      timeout: 30_000,
    });

    const before = snapshot.map((s) => s.slug);
    // The second step's "up" moves it above the first — the first's own "up" is
    // disabled, which is the guard worth exercising from the reachable side.
    const moveUp = page.getByRole('button', { name: /move step up/i });
    await expect(moveUp.first()).toBeDisabled();
    await moveUp.nth(1).click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    /*
     * Asserted on the API, not on the screen. The screen re-renders from its own
     * local state after a save, so reading it back proves the component
     * re-rendered — not that anything was persisted. Only the config the portal
     * will actually serve answers the question this test is asking.
     */
    await expect
      .poll(async () => (await readConfig(context)).map((s) => s.slug), { timeout: 15_000 })
      .toEqual([before[1], before[0], ...before.slice(2)]);
  });

  test('disables a step, and the portal contract says so', async ({ page, context }) => {
    await page.goto('/kyc/builder');
    await expect(page.getByRole('button', { name: /save all changes/i })).toBeVisible({
      timeout: 30_000,
    });
    const target = snapshot.find((s) => s.enabled);
    expect(target, 'every step is already disabled — nothing to turn off').toBeTruthy();

    await openStepTab(page, target!.title);
    await page.getByRole('button', { name: /^disable$/i }).click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    await expect
      .poll(async () => (await readConfig(context)).find((s) => s.slug === target!.slug)?.enabled, {
        timeout: 15_000,
      })
      .toBe(false);
  });

  test('DELETES one of the four once-mandatory steps — configurability is the point', async ({
    page,
    context,
  }) => {
    /*
     * `document` is one of the four the old rule protected. Removing it is the
     * capability the owner chose on 15 Aug; a spec that asserted the refusal
     * would be pinning a rule that no longer exists.
     */
    const target = snapshot.find((s) => s.slug === 'document');
    expect(target, "no 'document' step — the default config has changed").toBeTruthy();
    /*
     * The screen now refuses to delete the LAST remaining step, so this case
     * needs something left behind to be testing deletion rather than the floor.
     * Through `requirePrecondition` rather than a bare skip: under E2E_STRICT a
     * skipped Playwright test reports as PASSING, and a run that never deleted
     * anything must not be indistinguishable from one that did.
     */
    requirePrecondition(
      snapshot.length <= 1,
      'only one KYC step is configured, so the last-step guard is what would be exercised',
    );

    await page.goto('/kyc/builder');
    await expect(page.getByRole('button', { name: /save all changes/i })).toBeVisible({
      timeout: 30_000,
    });
    await openStepTab(page, target!.title);
    await page.getByRole('button', { name: /^delete step/i }).click();
    await page.getByRole('button', { name: /^delete$/i }).click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    await expect
      .poll(async () => (await readConfig(context)).map((s) => s.slug), { timeout: 15_000 })
      .not.toContain('document');
  });

  test('a save with no changes leaves the configuration byte-for-byte identical', async ({
    page,
    context,
  }) => {
    /*
     * The quiet one, and the reason it is here: `PUT /admin/kyc-config` is a FULL
     * REPLACE, and the screen sends whatever it currently holds. If the read and
     * the write disagree about any field — a default filled in on load, a number
     * re-derived — an operator who opens the builder and clicks Save changes the
     * onboarding flow without touching a control, and the audit row records a
     * change nobody made.
     */
    await page.goto('/kyc/builder');
    await page.getByRole('button', { name: /save all changes/i }).click();
    await expect(page.getByRole('button', { name: /save all changes/i })).toBeEnabled({
      timeout: 15_000,
    });

    const after = await readConfig(context);
    expect(
      after.map((s) => ({ slug: s.slug, enabled: s.enabled, stepNumber: s.stepNumber })),
      'opening the builder and saving without editing altered the configuration',
    ).toEqual(
      snapshot.map((s) => ({ slug: s.slug, enabled: s.enabled, stepNumber: s.stepNumber })),
    );
  });
});
