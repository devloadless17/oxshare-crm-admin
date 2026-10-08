import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  adminApi,
  API_NODE_BASE,
  APP_ORIGIN,
  createClientByStaff,
  mailCount,
  RESTRICTED_STATE,
  TINY_PNG,
} from './helpers';

/**
 * "COMPLETE KYC" (backend 0210) — staff do a client's KYC for them, in a real
 * browser against the real API: the page the server lays out, real uploads
 * through the real file pipeline, and the one approval.
 *
 * The journeys a desk takes, and the ones that must hold whatever happens: the
 * whole verification in one flow with the record naming who did it; a KYC
 * waiting for review returned to edit without a word to the client; unsaved
 * answers never lost to a stray click; a refused file explained on its tile;
 * and the page closed to staff without the key.
 */

const SCREENS = 'test-results/assist-screens';

/** A real image's bytes — the server decides the type from them, not the name. */
const PHOTO = { name: 'page.png', mimeType: 'image/png', buffer: TINY_PNG };

async function upload(page: Page, tile: string, file = PHOTO) {
  const [answer] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/assist/upload') && r.request().method() === 'POST',
    ),
    page.locator(`#${tile} input[type=file]`).setInputFiles(file),
  ]);
  return answer;
}

test.describe('Complete KYC', () => {
  test('staff complete a never-started client’s KYC and verify them in one flow', async ({
    page,
  }) => {
    // Created by staff with the sign-up's details only: the address and city are still owed.
    const { id } = await createClientByStaff(page.context(), 'journey');

    await page.goto(`/clients/${id}`);
    await page.getByRole('link', { name: 'Complete KYC for the client' }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${id}/kyc$`));
    await expect(page.getByText(/0 of 4 steps complete/)).toBeVisible();

    const personal = page.locator('#assist-step-personal');
    await expect(personal.getByText('2 missing')).toBeVisible();
    await personal.getByLabel(/^Residential Address/).fill('Rue Gouraud 4');
    await personal.getByLabel(/^City/).fill('Beirut');
    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/assist/step')),
      page.getByRole('button', { name: 'Save changes' }).click(),
    ]);
    expect(saved.status(), await saved.text()).toBe(201);
    await expect(personal.getByText('Done', { exact: true })).toBeVisible();

    const document = page.locator('#assist-step-document');
    await document.getByRole('radio', { name: 'Passport' }).click();
    expect((await upload(page, 'assist-document-doc_front')).status()).toBe(201);
    await expect(document.getByText('Done', { exact: true })).toBeVisible();

    const address = page.locator('#assist-step-address');
    await address.getByRole('radio', { name: 'Utility Bill' }).click();
    expect((await upload(page, 'assist-address-address_proof')).status()).toBe(201);
    expect((await upload(page, 'assist-selfie-selfie')).status()).toBe(201);

    await expect(page.getByText('Everything needed is here.')).toBeVisible();
    await expect(page.getByText(/4 of 4 steps complete/)).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/05-complete-kyc-ready.png`, fullPage: true });

    const [submitted] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/assist/submit')),
      page.getByRole('button', { name: 'Submit & approve' }).click(),
    ]);
    expect(submitted.status(), await submitted.text()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`/clients/${id}$`));

    // Verified, through the one approval — and the record says who did each thing.
    const api = await adminApi(page.context());
    const client = (await (await api.get(`/admin/clients/${id}`)).json()) as {
      verificationLevel: number;
    };
    expect(client.verificationLevel).toBe(1);
    const documents = (await (await api.get(`/admin/clients/${id}/documents`)).json()) as {
      items: { category: string; uploadedByStaff: string | null }[];
    };
    const kyc = documents.items.filter((d) => d.category !== 'deposit_receipt');
    expect(kyc.length).toBeGreaterThanOrEqual(3);
    expect(kyc.every((d) => d.uploadedByStaff === 'E2E Admin')).toBe(true);

    await page.goto(`/kyc/${id}`);
    await expect(page.getByText('Submitted by E2E Admin for the client')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/06-review-submitted-by-staff.png`, fullPage: true });

    // Verified is verified: the entry point is gone, and the page says how to change it.
    await page.goto(`/clients/${id}`);
    await expect(page.getByRole('link', { name: 'Complete KYC for the client' })).toHaveCount(0);
    await page.goto(`/clients/${id}/kyc`);
    await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  });

  test('a KYC waiting for review is returned to edit, and the client is not emailed', async ({
    page,
  }) => {
    // A client whose KYC is already submitted (the suite's fresh fixture).
    const made = await page.context().request.post(`${API_NODE_BASE}/e2e/fixtures/client`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect(made.ok(), 'the e2e fixtures route is development-only').toBe(true);
    const { id, email } = (await made.json()) as { id: number; email: string };

    await page.goto(`/clients/${id}/kyc`);
    await expect(page.getByText('Waiting for review')).toBeVisible();
    // Nothing on it can be changed while a reviewer may be looking at it.
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}/07-waiting-for-review.png`, fullPage: true });

    await page.getByRole('button', { name: 'Return to edit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/Reason/)).toHaveValue(/Staff are completing/);
    const [returned] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/assist/return')),
      dialog.getByRole('button', { name: 'Return to edit' }).click(),
    ]);
    expect(returned.status(), await returned.text()).toBe(201);
    await expect(page.getByText('Returned for changes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit & approve' })).toBeVisible();

    // A return the client would normally be emailed about: not this one.
    await page.waitForTimeout(1500);
    expect(await mailCount(email)).toBe(0);
  });

  test('what a reviewer returned is shown, and staff fix exactly that for the client', async ({
    page,
  }) => {
    // A submitted KYC (the suite's fresh fixture), returned by a reviewer for one page.
    const made = await page.context().request.post(`${API_NODE_BASE}/e2e/fixtures/client`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect(made.ok(), 'the e2e fixtures route is development-only').toBe(true);
    const { id } = (await made.json()) as { id: number };
    const api = await adminApi(page.context());
    const sentBack = await api.patch(`/admin/kyc/${id}/reject`, {
      reason: 'The photo page is blurred.',
      rejectedFields: ['doc_front'],
    });
    expect(sentBack.status(), await sentBack.text()).toBe(200);

    await page.goto(`/clients/${id}/kyc`);
    await expect(page.getByText('The photo page is blurred.')).toBeVisible();
    const document = page.locator('#assist-step-document');
    await expect(document.getByText(/^Returned by the reviewer/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit & approve' })).toBeDisabled();

    // Replacing that page is the whole fix: nothing else is touched.
    expect((await upload(page, 'assist-document-doc_front')).status()).toBe(201);
    await expect(document.getByText(/^Returned by the reviewer/)).toHaveCount(0);
    await expect(page.getByText('Everything needed is here.')).toBeVisible();

    const [submitted] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/assist/submit')),
      page.getByRole('button', { name: 'Submit & approve' }).click(),
    ]);
    expect(submitted.status(), await submitted.text()).toBe(201);
    const client = (await (await api.get(`/admin/clients/${id}`)).json()) as {
      verificationLevel: number;
    };
    expect(client.verificationLevel).toBe(1);
  });

  test('a suspended client is not offered it, and their page says why', async ({ page }) => {
    const { id } = await createClientByStaff(page.context(), 'suspended');
    const api = await adminApi(page.context());
    const suspended = await api.patch(`/admin/clients/${id}/status`, { status: 'suspended' });
    expect(suspended.status(), await suspended.text()).toBe(200);

    await page.goto(`/clients/${id}`);
    await expect(page.getByRole('link', { name: 'Complete KYC for the client' })).toHaveCount(0);
    // Reached directly, it explains itself rather than refusing the first save.
    await page.goto(`/clients/${id}/kyc`);
    await expect(page.getByText('This client is suspended')).toBeVisible();
    await expect(page.locator('#assist-step-personal').getByLabel(/^City/)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  });

  test('unsaved answers are never lost to a stray click', async ({ page }) => {
    const { id } = await createClientByStaff(page.context(), 'unsaved');
    await page.goto(`/clients/${id}/kyc`);
    const city = page.locator('#assist-step-personal').getByLabel(/^City/);
    await city.fill('Tripoli');

    // A link in the console — the guard asks, and Stay keeps everything.
    await page.getByRole('link', { name: 'Back to client' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask.getByText('Leave without saving?')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/08-unsaved-guard.png`, fullPage: true });
    await ask.getByRole('button', { name: 'Stay on this page' }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${id}/kyc$`));
    await expect(city).toHaveValue('Tripoli');

    // Leave goes where the click was going.
    await page.getByRole('link', { name: 'Back to client' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${id}$`));

    // Leave meant it: back on the page through the console, as staff go, nothing is offered.
    await page.getByRole('link', { name: 'Complete KYC for the client' }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${id}/kyc$`));
    await expect(city).toHaveValue('');
    await expect(page.getByText('Your unsaved changes are back')).toHaveCount(0);

    // The browser's Back button cannot be asked about — so the answers wait, and come back.
    await city.fill('Zahle');
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/clients/${id}$`));
    await page.goForward();
    await expect(page.getByText('Your unsaved changes are back')).toBeVisible();
    await expect(city).toHaveValue('Zahle');

    // Saved, there is nothing to ask about, and nothing is kept.
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved')).toBeVisible();
    await expect(page.getByText('Your unsaved changes are back')).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to client' }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${id}$`));
  });

  test('a file the server refuses says why on its tile, and nothing is stored', async ({
    page,
  }) => {
    const { id } = await createClientByStaff(page.context(), 'refused-file');
    await page.goto(`/clients/${id}/kyc`);
    await page.locator('#assist-step-document').getByRole('radio', { name: 'Passport' }).click();

    // Called .png, not an image: the server reads the bytes and refuses it.
    const fake = {
      name: 'passport.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    };
    const answer = await upload(page, 'assist-document-doc_front', fake);
    expect(answer.status()).toBe(400);
    const refusal = page.locator('#assist-document-doc_front [role=alert]');
    await expect(refusal).toContainText('This file is not a JPG, PNG or WebP image or a PDF');
    // Worded for staff at a computer, not the client's phone settings.
    await expect(refusal).not.toContainText('Settings');
    await page.screenshot({ path: `${SCREENS}/09-refused-file.png`, fullPage: true });
    await expect(page.locator('#assist-step-document').getByText('1 missing')).toBeVisible();
  });

  test('staff without the key are not offered it, and cannot open it', async ({ browser }) => {
    const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
    const page = await restricted.newPage();
    const api = await adminApi(restricted);
    // A client this reviewer can see: the suite's own tagged one.
    const list = (await (await api.get('/admin/clients?tag=e2e-alpha')).json()) as {
      items: { id: number }[];
    };
    const visible = list.items[0];
    if (!visible) throw new Error('the restricted reviewer sees no client to test with');

    await page.goto(`/clients/${visible.id}`);
    await expect(page.getByRole('link', { name: 'Complete KYC for the client' })).toHaveCount(0);
    const direct = await api.get(`/admin/kyc/${visible.id}/assist`);
    expect(direct.status()).toBe(403);
    await restricted.close();
  });
});
