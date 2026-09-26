import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import {
  adminApiSession,
  answerBrokersQuestions,
  API_NODE_BASE,
  mintFreshClientWithPendingKyc,
  STORAGE_STATE,
  TOPOLOGY_PORTAL_ORIGIN,
  waitForMail,
  type MintedClient,
} from './helpers';

/**
 * AN APPROVED CLIENT WHOSE VERIFIED DETAILS TURN OUT WRONG (the owner's ruling,
 * 26 Sep 2026): "Correct any field + re-verify".
 *
 * Before, an approved verification had one lever — a rejection — so a misspelt
 * surname shut a client's money doors and emailed them "your application needs
 * correction" for the desk's typo. Now there are two, each with its own
 * consequence, and this file drives both with a mouse and checks each
 * consequence where it lands rather than on a toast:
 *
 *  - CORRECT DETAILS: any identity field but the phone, a reason required. The
 *    client stays verified, their account reads the corrected value, and they
 *    are emailed what changed.
 *  - REQUEST RE-VERIFICATION: for a detail that changed materially. The
 *    verification goes back to the client with the items to redo, the money
 *    gate closes (level 0) until it is approved again, and the email asks them
 *    to UPDATE — it is not a rejection. Their resubmission and a fresh approval
 *    open the gate again.
 *
 * Fresh fixtures (the dev fixtures route), because both are decisions: a pooled
 * client decided by one run would be the next run's wrong starting point.
 */

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ timeout: 180_000 });

let admin: Awaited<ReturnType<typeof adminApiSession>>;
let client: MintedClient;

test.beforeEach(async () => {
  admin = await adminApiSession();
  client = await mintFreshClientWithPendingKyc(admin, 'correct');
  // Approved over the API: the decision is the starting point here, not the subject.
  expect((await admin.patch(`/admin/kyc/${client.id}/claim`)).ok()).toBe(true);
  const approved = await admin.patch(`/admin/kyc/${client.id}/approve`);
  expect(approved.status(), `the fixture could not be approved: ${await approved.text()}`).toBe(
    200,
  );
});

test.afterEach(async () => {
  await client?.dispose();
  await admin?.dispose();
});

/** The client's own view of themselves, from their session. */
async function clientGet(path: string): Promise<{ status: number; body: unknown }> {
  const res = await client.portal.get(`${API_NODE_BASE}${path}`, {
    headers: { Origin: TOPOLOGY_PORTAL_ORIGIN },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/**
 * The money gate, probed where it stands: `KycVerifiedGuard` answers before the
 * route looks the reference up, so an unknown one is 403 for an unverified
 * client and anything else for a verified one.
 */
async function moneyGateOpen(): Promise<boolean> {
  return (await clientGet('/payments/deposits/e2e-no-such-reference/status')).status !== 403;
}

async function openReview(page: Page): Promise<void> {
  await page.goto(`/kyc/${client.id}`);
  await expect(page.getByRole('button', { name: /^correct details$/i })).toBeVisible({
    timeout: 30_000,
  });
}

test('Correct details fixes a misspelt surname, with a reason — the client stays verified', async ({
  page,
}) => {
  expect(await moneyGateOpen(), 'the approved fixture cannot reach the money routes').toBe(true);
  await openReview(page);

  await page.getByRole('button', { name: /^correct details$/i }).click();
  const dialog = page.getByRole('dialog', { name: /correct identity details/i });
  await dialog.getByLabel(/^last name$/i).fill('Haddad');
  const save = dialog.getByRole('button', { name: /^save correction$/i });
  // The reason is the point: no reason, no correction.
  await expect(save).toBeDisabled();
  await dialog
    .getByLabel(/reason for the correction/i)
    .fill('Surname misspelt against the passport — e2e.');

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/admin\/kyc\/[^/]+\/personal-info$/.test(r.url()) && r.request().method() === 'PATCH',
    ),
    save.click(),
  ]);
  expect(response.status(), `the correction answered ${response.status()}`).toBe(200);
  await expect(dialog).toBeHidden();

  // Still verified, on the record and at the gate.
  const record = (await (await admin.get(`/admin/kyc/${client.id}`)).json()) as {
    status: string;
    personalInfo?: { lastName?: string };
  };
  expect(record.status).toBe('approved');
  expect(record.personalInfo?.lastName).toBe('Haddad');
  expect(await moneyGateOpen(), 'a correction closed the money doors').toBe(true);

  // ONE record: the client's own account reads the corrected surname.
  const me = await clientGet('/auth/me');
  expect((me.body as { lastName?: string }).lastName).toBe('Haddad');

  // And they are told what changed — never "rejected".
  const mail = await waitForMail(client.email, { subject: /we corrected details/i });
  expect(`${mail.text} ${mail.html}`).toMatch(/last name/i);
  expect(`${mail.text} ${mail.html}`).not.toMatch(/reject/i);
});

test('Request re-verification returns it with the items to redo, and money waits for re-approval', async ({
  page,
}) => {
  await openReview(page);

  await page.getByRole('button', { name: /^request re-verification$/i }).click();
  const dialog = page.getByRole('dialog', { name: /update their verification/i });
  await dialog.getByRole('checkbox', { name: /residential address/i }).click();
  await dialog
    .getByLabel(/reason, sent to the client/i)
    .fill('You told us you have moved abroad — please update your address.');
  // Said plainly before anything is sent: the money pauses.
  await expect(dialog).toContainText(/deposits and withdrawals/i);

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/admin\/kyc\/[^/]+\/reverify$/.test(r.url()) && r.request().method() === 'POST',
    ),
    dialog.getByRole('button', { name: /^return for re-verification$/i }).click(),
  ]);
  expect(response.status(), `re-verification answered ${response.status()}`).toBeLessThan(300);

  // Returned to the client, with exactly the item asked for — and the gate shut.
  const status = await clientGet('/kyc/status');
  const returned = status.body as {
    status: string;
    rejectedFields?: string[];
    reverificationRequestedAt?: string;
  };
  expect(returned.status).toBe('rejected');
  expect(returned.rejectedFields).toEqual(['address']);
  expect(returned.reverificationRequestedAt, 'not marked as a re-verification').toBeTruthy();
  const level = (await (await admin.get(`/admin/clients/${client.id}`)).json()) as {
    verificationLevel?: number;
  };
  expect(level.verificationLevel, 'still level 1 — the money doors stayed open').toBe(0);
  expect(await moneyGateOpen(), 'the money gate did not close').toBe(false);

  // Asked to UPDATE, with the reason as written — not told they were rejected.
  const mail = await waitForMail(client.email, { subject: /please update your verification/i });
  expect(`${mail.text} ${mail.html}`).toMatch(/moved abroad/i);

  // The client answers it: a new address settles the item, and they resubmit.
  const write = { Origin: TOPOLOGY_PORTAL_ORIGIN, 'X-OxShare-CSRF': client.csrf };
  const saved = await client.portal.post(`${API_NODE_BASE}/kyc/step`, {
    headers: write,
    data: { step: 'personal', data: { address: '5 Rue de Rivoli', city: 'Paris' } },
  });
  expect(saved.status(), `saving the new address failed: ${await saved.text()}`).toBeLessThan(300);
  // And whatever the broker's own steps require — a resubmission is judged whole.
  await answerBrokersQuestions(client.portal, write);
  const resubmitted = await client.portal.post(`${API_NODE_BASE}/kyc/submit`, { headers: write });
  expect(resubmitted.status(), `resubmission failed: ${await resubmitted.text()}`).toBeLessThan(
    300,
  );

  // Approved again: level 1, the request over, the gate open.
  expect((await admin.patch(`/admin/kyc/${client.id}/claim`)).ok()).toBe(true);
  expect((await admin.patch(`/admin/kyc/${client.id}/approve`)).status()).toBe(200);
  const after = (await clientGet('/kyc/status')).body as {
    status: string;
    reverificationRequestedAt?: string;
  };
  expect(after.status).toBe('approved');
  expect(after.reverificationRequestedAt ?? null).toBeNull();
  expect(await moneyGateOpen(), 'approved again, and the money gate is still shut').toBe(true);
});
