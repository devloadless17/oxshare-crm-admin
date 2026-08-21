import { expect, test } from './fixtures';
import {
  E2E_CLIENTS,
  KYC_VIEWER_STATE,
  RESTRICTED_STATE,
  adminApi,
  adminApiSession,
} from './helpers';
import { type BrowserContext, type Page } from '@playwright/test';

/**
 * RBAC-03 on the KYC REVIEW screen — the screen holding the most sensitive
 * data, and the one the field mask never reached until this audit.
 *
 *  - A `kyc.view`-only reviewer sees NO Approve / Reject / Claim control, and
 *    the API refuses the decision anyway.
 *  - A masked admin does not receive the masked value on the wire, under any
 *    of the names it travels by (`user.email`, `personalInfo.email`).
 *  - The master sees everything.
 *
 * Against the seeded `alpha` client's submission (tagged `e2e-alpha`, so the
 * scoped restricted admin can see it). Nothing here DECIDES the submission —
 * approval is terminal on a shared fixture.
 */
/** ONE master API session for the file — admin login is capped at five a minute. */
let master: Awaited<ReturnType<typeof adminApiSession>>;
let alpha = '';
let hasSubmission = false;

test.beforeAll(async () => {
  master = await adminApiSession();
  const res = await master.get(`/admin/clients?q=${encodeURIComponent(E2E_CLIENTS.alpha.email)}`);
  const found = ((await res.json()) as { items: { id: string; email: string }[] }).items.find(
    (c) => c.email === E2E_CLIENTS.alpha.email,
  );
  expect(found, 'alpha is not seeded').toBeTruthy();
  alpha = found!.id;
  hasSubmission = (await master.get(`/admin/kyc/${alpha}`)).ok();
});
test.afterAll(async () => {
  await master?.dispose();
});

function bodiesOf(page: Page) {
  const pending: Promise<string>[] = [];
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.startsWith('/v1/')) pending.push(r.text().catch(() => ''));
  });
  return { all: async () => (await Promise.all(pending)).join('\n') };
}

async function openReview(context: BrowserContext, id: string) {
  const page = await context.newPage();
  const bodies = bodiesOf(page);
  await page.goto(`/kyc/${id}`);
  await page.waitForLoadState('networkidle');
  return { page, bodies };
}

test('a masked reviewer does not receive the client email, under ANY name, on the review screen', async ({
  browser,
}) => {
  const id = alpha;
  test.skip(!hasSubmission, 'alpha has no seeded KYC submission');

  const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
  const { page, bodies } = await openReview(restricted, id);
  await expect(page.getByText(/access denied/i)).toHaveCount(0);

  const wire = await bodies.all();
  expect(wire, 'the masked email travelled on the wire').not.toContain(E2E_CLIENTS.alpha.email);
  await expect(page.getByText(E2E_CLIENTS.alpha.email)).toHaveCount(0);
  // The response says what was hidden, so the screen can say "hidden" not "—".
  expect(wire).toMatch(/maskedFields/);
  await restricted.close();
});

test('the master still sees the email on the same screen', async ({ browser }) => {
  const id = alpha;
  test.skip(!hasSubmission, 'alpha has no seeded KYC submission');
  const master = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const { bodies } = await openReview(master, id);
  expect(await bodies.all()).toContain(E2E_CLIENTS.alpha.email);
  await master.close();
});

test('a kyc.view-only reviewer is shown no decision control, and the API refuses a decision', async ({
  browser,
}) => {
  const id = alpha;
  test.skip(!hasSubmission, 'alpha has no seeded KYC submission');
  let viewer: BrowserContext;
  try {
    viewer = await browser.newContext({ storageState: KYC_VIEWER_STATE });
  } catch {
    test.skip(true, 'no kyc-viewer storage state — is e2e-kyc-viewer@oxshare.com seeded?');
    return;
  }
  const { page } = await openReview(viewer, id);
  await expect(page.getByText(/access denied/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /approve kyc submission/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /reject kyc submission/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /claim/i })).toHaveCount(0);

  const refused = await (await adminApi(viewer)).patch(`/admin/kyc/${id}/approve`);
  expect(refused.status()).toBe(403);
  await viewer.close();
});

test('a kyc.review admin IS shown the decision controls for a waiting submission', async ({
  browser,
}) => {
  const id = alpha;
  test.skip(!hasSubmission, 'alpha has no seeded KYC submission');
  const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
  const { page } = await openReview(restricted, id);
  await expect(page.getByRole('button', { name: /approve kyc submission/i })).toBeVisible();
  await restricted.close();
});
