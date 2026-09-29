import { expect, test } from './fixtures';
import { adminApi, requirePrecondition, STORAGE_STATE } from './helpers';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * THE KYC STEP BUILDER, DRIVEN WITH A MOUSE — and the identity it cannot break.
 *
 * ## The report this file is built around (26 Sep 2026)
 *
 * In the builder, deleting First Name from Personal Information and adding it
 * back made a CUSTOM field: a box labelled "First Name" that no longer was the
 * client's first name. The cause was general — identity was recognised by a
 * field's key inside a configuration the builder could freely rewrite.
 *
 * Since Phase 2 (29 Sep 2026, the owner's "everything customizable") an identity
 * detail is a PLACEMENT: whether it is asked, where it sits and whether it is
 * required are the broker's; its name, label and type are the platform's,
 * rebuilt on every read. So First Name taken off and asked for again is the
 * client's name, and a question that would be a second copy of it is refused,
 * under the question. Every built-in step can be retitled, moved and switched
 * off — never deleted.
 *
 * So this file drives the reported scenario first, then the doors around it: a
 * crafted save, the built-in steps, the order, a save over somebody else's
 * change, and a broker's own step from creation to deletion.
 *
 * ## The config is GLOBAL state, so every case restores it
 *
 * There is one KYC configuration and every client onboarding through the portal
 * reads it. `afterEach` PUTs the snapshot back over the API rather than trusting
 * the UI to undo itself, because a failed test is precisely when the UI cannot
 * be trusted to — and it checks the restore LANDED.
 *
 * ⚠️ Never delete a step this file did not create. A step's address (its slug)
 * is kept for life, and one made by an older build may not have the shape a NEW
 * step must have ("custom slug 1" is on the dev database). Deleted and then
 * restored, it would be judged as new — refused — and the restore would fail
 * with the step gone.
 */

test.use({ storageState: STORAGE_STATE });

/*
 * The keys this file REASONS about, plus everything else the API returns.
 *
 * The index signature is load-bearing rather than lazy typing: `readConfig`
 * hands whole step objects straight back to `afterEach`, which PUTs them, and
 * that endpoint is a FULL REPLACE. A type naming only these keys would invite
 * somebody to `.map()` the snapshot into them and silently drop every hint and
 * document binding on the way.
 */
type Field = {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  system?: boolean;
  [key: string]: unknown;
};
type Step = {
  id: string;
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
  stepNumber: number;
  fields: Field[];
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

const shape = (steps: Step[]) =>
  steps.map((s) => ({ slug: s.slug, enabled: s.enabled, stepNumber: s.stepNumber }));

/** The builder, loaded: its Save button is on screen once the form has arrived. */
async function openBuilder(page: Page): Promise<void> {
  await page.goto('/kyc/builder');
  await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /save all changes/i })).toBeVisible();
}

/**
 * Open one step's TAB. The builder is a tablist — Overview, then one tab per
 * step — and a step's controls render only inside its own panel.
 */
async function openStepTab(page: Page, title: string): Promise<void> {
  // Escaped: a step title is operator-supplied and may hold regex metacharacters.
  const name = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

function stepOf(steps: Step[], slug: string): Step {
  const step = steps.find((s) => s.slug === slug);
  expect(step, `no '${slug}' step — every configuration has the four built-in steps`).toBeTruthy();
  return step!;
}

/** The steps with Personal Information's fields changed — a crafted save's body. */
function withPersonalFields(steps: Step[], change: (fields: Field[]) => Field[]): Step[] {
  return steps.map((step) =>
    step.slug === 'personal' ? { ...step, fields: change(step.fields) } : step,
  );
}

let snapshot: Step[] = [];

test.beforeEach(async ({ context }) => {
  snapshot = await readConfig(context);
  expect(snapshot.length, 'no KYC steps configured — nothing to drive').toBeGreaterThan(0);
});

test.afterEach(async ({ context }) => {
  /*
   * ## Refuse to restore NOTHING
   *
   * `snapshot` is module-level and `afterEach` runs even when `beforeEach`
   * threw — so on a first-test failure it still holds its initial `[]`, and
   * PUTting that would REPLACE the live KYC configuration with an empty one.
   */
  if (snapshot.length === 0) {
    throw new Error(
      'REFUSING TO RESTORE AN EMPTY KYC CONFIG — the snapshot was never taken, ' +
        'so there is nothing to put back. The live configuration has been left alone.',
    );
  }

  const api = await adminApi(context);
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await api.put('/admin/kyc-config', { format: 2, steps: snapshot });
    lastStatus = res.status();
    if (lastStatus === 200) break;
    lastBody = await res.text();
    // A restore is worth retrying where a test assertion is not: the cost of
    // giving up is a broken onboarding flow for every client in the database.
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  expect(
    lastStatus,
    `FAILED TO RESTORE THE KYC CONFIG — onboarding may be broken: ${lastBody}`,
  ).toBe(200);

  // A 200 that did not persist is exactly the defect this file exists to catch.
  const restored = await readConfig(context);
  expect(
    shape(restored),
    'the restore was accepted but did not persist — the KYC config is NOT as this run found it',
  ).toEqual(shape(snapshot));
});

test.describe('the client’s identity details on the form', () => {
  test('First Name taken off and asked for again is the client’s name — never a box that looks like it', async ({
    page,
    context,
  }) => {
    const personal = stepOf(snapshot, 'personal');
    requirePrecondition(
      !personal.fields.some((field) => field.name === 'firstName'),
      'First Name is not asked on this form — nothing to take off',
    );
    await openBuilder(page);
    await openStepTab(page, personal.title);

    // The reported scenario: take First Name off, then ask for it again.
    await page.getByRole('button', { name: 'Stop asking for First Name' }).click();
    await page.getByRole('combobox', { name: /ask for an identity detail/i }).click();
    await page.getByRole('option', { name: 'First Name', exact: true }).click();

    // The other door: the broker's own question, named like the identity detail.
    await page.getByRole('button', { name: /^add field$/i }).click();
    const label = page.getByLabel('Field Label').last();
    await label.fill('First name');
    await page.getByRole('button', { name: /save all changes/i }).click();

    // Refused, and said UNDER the question — not as a line somewhere above the form.
    await expect(label).toHaveAttribute('aria-invalid', 'true', { timeout: 15_000 });
    await expect(page.getByRole('alert').filter({ hasText: /already collected/i })).toBeVisible();

    // Without the lookalike it saves — and the one "First Name" is the platform's.
    await page.getByRole('button', { name: /^remove field first name$/i }).click();
    await page.getByRole('button', { name: /save all changes/i }).click();
    await expect
      .poll(
        async () =>
          stepOf(await readConfig(context), 'personal')
            .fields.filter((field) => /^first name$/i.test(field.label.trim()))
            .map(({ name, system }) => ({ name, system })),
        { timeout: 15_000 },
      )
      .toEqual([{ name: 'firstName', system: true }]);
  });

  test('a crafted save may stop asking for First Name, never rename it; an outdated builder is refused', async ({
    context,
  }) => {
    const api = await adminApi(context);
    requirePrecondition(
      !stepOf(snapshot, 'personal').fields.some((field) => field.name === 'firstName'),
      'First Name is not asked on this form',
    );

    // Taken off: sign-up already holds it, so the form may stop asking.
    const without = withPersonalFields(snapshot, (fields) =>
      fields.filter((field) => field.name !== 'firstName'),
    );
    expect((await api.put('/admin/kyc-config', { format: 2, steps: without })).status()).toBe(200);
    const served = stepOf(await readConfig(context), 'personal').fields;
    expect(served.map((field) => field.name)).not.toContain('firstName');

    // Relabelled: the platform names its details, so the label is put back.
    const relabelled = withPersonalFields(snapshot, (fields) =>
      fields.map((field) =>
        field.name === 'firstName' ? { ...field, label: 'Given name' } : field,
      ),
    );
    expect((await api.put('/admin/kyc-config', { format: 2, steps: relabelled })).status()).toBe(
      200,
    );
    expect(
      stepOf(await readConfig(context), 'personal').fields.find((f) => f.name === 'firstName'),
    ).toMatchObject({ label: 'First Name', system: true });

    // Re-keyed: refused, and the refusal names where in the posted form.
    const rekeyed = withPersonalFields(snapshot, (fields) =>
      fields.map((field) => (field.name === 'firstName' ? { ...field, name: 'givenName' } : field)),
    );
    const refused = await api.put('/admin/kyc-config', { format: 2, steps: rekeyed });
    expect(refused.status()).toBe(400);
    const body = (await refused.json()) as { fields?: Record<string, string> };
    expect(JSON.stringify(body)).toMatch(/fixed by the platform/i);
    expect(Object.keys(body.fields ?? {}).some((key) => key.startsWith('steps.'))).toBe(true);

    // A builder from before Phase 2 would save the identity away — it is turned back.
    const outdated = await api.put('/admin/kyc-config', { steps: snapshot });
    expect(outdated.status()).toBe(409);
    expect(((await outdated.json()) as { code?: string }).code).toBe('KYC_BUILDER_OUTDATED');
  });
});

test.describe('the built-in steps', () => {
  test('each can be switched off, none deleted — and Identity Document switched off stays off', async ({
    page,
    context,
  }) => {
    await openBuilder(page);
    for (const slug of ['personal', 'document', 'selfie', 'address']) {
      await openStepTab(page, stepOf(snapshot, slug).title);
      const panel = page.getByRole('tabpanel');
      await expect(panel.getByRole('button', { name: /^(disable|enable)$/i })).toBeVisible();
      await expect(panel.getByRole('button', { name: /^delete step/i })).toHaveCount(0);
    }

    const document = stepOf(snapshot, 'document');
    requirePrecondition(!document.enabled, 'Identity Document is already off — nothing to switch');
    await openStepTab(page, document.title);
    await page
      .getByRole('tabpanel')
      .getByRole('button', { name: /^disable$/i })
      .click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    await expect
      .poll(async () => stepOf(await readConfig(context), 'document').enabled, { timeout: 15_000 })
      .toBe(false);
  });

  test('a crafted save that deletes the Identity Document step is refused', async ({ context }) => {
    const api = await adminApi(context);
    const res = await api.put('/admin/kyc-config', {
      format: 2,
      steps: snapshot.filter((step) => step.slug !== 'document'),
    });
    expect(res.status()).toBe(400);
    expect(shape(await readConfig(context))).toEqual(shape(snapshot));
  });
});

test.describe('the order', () => {
  test('any step moves — Personal Information included — and the order SURVIVES a reload', async ({
    page,
    context,
  }) => {
    requirePrecondition(snapshot.length < 2, 'fewer than two steps — nothing to move');
    await openBuilder(page);

    const [first, second] = snapshot;
    const last = snapshot[snapshot.length - 1]!;
    await expect(page.getByRole('button', { name: `Move ${first!.title} up` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Move ${last.title} down` })).toBeDisabled();

    await page.getByRole('button', { name: `Move ${first!.title} down` }).click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    // Asserted on the API: the screen re-renders from its own state after a save.
    await expect
      .poll(async () => (await readConfig(context)).map((s) => s.slug), { timeout: 15_000 })
      .toEqual([second!.slug, first!.slug, ...snapshot.slice(2).map((s) => s.slug)]);
  });
});

test.describe('two people editing the form', () => {
  test('a save over somebody else’s change is refused — and says so — rather than erasing it', async ({
    page,
    context,
  }) => {
    await openBuilder(page);
    const selfie = stepOf(snapshot, 'selfie');

    // Somebody else saves while this screen is open.
    const elsewhere = `${selfie.description} (changed by another admin)`;
    const api = await adminApi(context);
    const theirs = await api.put('/admin/kyc-config', {
      format: 2,
      steps: snapshot.map((step) =>
        step.slug === 'selfie' ? { ...step, description: elsewhere } : step,
      ),
    });
    expect(theirs.status()).toBe(200);

    // This screen, still on the form it loaded, edits and saves.
    await openStepTab(page, selfie.title);
    await page.getByLabel(/description \/ instructions/i).fill('Mine');
    await page.getByRole('button', { name: /save all changes/i }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: /someone else changed this form/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^reload$/i })).toBeVisible();
    expect(stepOf(await readConfig(context), 'selfie').description).toBe(elsewhere);
  });
});

test.describe('a step of the broker’s own', () => {
  test('is added with an address made from its title, saved, and deleted again', async ({
    page,
    context,
  }) => {
    await openBuilder(page);
    const title = `E2E source of funds ${Date.now()}`;

    await page.getByRole('button', { name: /add custom step/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/step title/i).fill(title);
    await dialog.getByRole('button', { name: /^add step$/i }).click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    await expect
      .poll(async () => (await readConfig(context)).find((s) => s.title === title)?.slug, {
        timeout: 15_000,
      })
      // From its title, so the client's address bar reads like the step.
      .toMatch(/^e2e-source-of-funds-\d+$/);

    // Deleted from its own tab — a step this run created, so the restore is safe.
    await openStepTab(page, title);
    await page.getByRole('button', { name: `Delete step ${title}` }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^delete$/i })
      .click();
    await page.getByRole('button', { name: /save all changes/i }).click();

    await expect
      .poll(async () => (await readConfig(context)).some((s) => s.title === title), {
        timeout: 15_000,
      })
      .toBe(false);
  });
});
