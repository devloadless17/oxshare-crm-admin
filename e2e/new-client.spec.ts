import { test, expect } from './fixtures';
import {
  adminApi,
  createClientByStaff,
  E2E_CLIENTS,
  linkIn,
  mailCount,
  RESTRICTED_STATE,
  staffClientDetails,
  TOPOLOGY_PORTAL_ORIGIN,
  waitForMail,
} from './helpers';

/**
 * "NEW CLIENT" (backend 0211) — staff create a client for somebody who cannot
 * sign up themselves, in a real browser against the real API.
 *
 * Every journey a desk will actually take: the form, its refusals (the same as a
 * sign-up's), the welcome email in the client's language, the client choosing
 * their own password in the portal and signing in, a mistyped address fixed by
 * changing it, the welcome resent, and the button absent for staff who may not
 * create clients.
 */

const WELCOME = /account is ready/i;
const SCREENS = 'test-results/assist-screens';

test.describe('New client', () => {
  test('staff create a client from the list and go straight on to Complete KYC', async ({
    page,
    browser,
  }) => {
    const client = staffClientDetails('ui');
    await page.goto('/clients');
    await page.getByRole('button', { name: 'New client' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New client' })).toBeVisible();

    await dialog.getByLabel(/^Email/).fill(client.email);
    await dialog.getByLabel(/^First name/).fill(client.firstName);
    await dialog.getByLabel(/^Last name/).fill(client.lastName);
    await dialog.getByLabel(/^Date of birth/).fill(client.dateOfBirth);
    await dialog.getByLabel(/^Nationality/).selectOption(client.nationality);
    await dialog.getByLabel(/^Phone/).fill(client.phone);
    await dialog.getByLabel(/^Country of residence/).selectOption(client.country);
    await dialog.getByLabel(/^Language/).selectOption('ar');
    await page.screenshot({ path: `${SCREENS}/01-new-client-dialog.png`, fullPage: true });

    const [created] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/v1/admin/clients') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Create and complete KYC' }).click(),
    ]);
    expect(created.status(), await created.text()).toBe(201);
    const { id } = (await created.json()) as { id: number };

    await expect(page).toHaveURL(new RegExp(`/clients/${id}/kyc$`));
    await expect(page.getByRole('heading', { name: 'Complete KYC' })).toBeVisible();
    await expect(page.getByText(/You are completing this KYC for the client/)).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/02-complete-kyc-new.png`, fullPage: true });

    // The record: who created them, their language, and no password anybody knows yet.
    const api = await adminApi(page.context());
    const profile = (await (await api.get(`/admin/clients/${id}`)).json()) as {
      createdByName: string | null;
      awaitingWelcome: boolean;
    };
    expect(profile.createdByName).toBe('E2E Admin');
    expect(profile.awaitingWelcome).toBe(true);
    // Arabic was chosen, so the welcome is in Arabic…
    const welcome = await waitForMail(client.email, { subject: /OXShare/ });
    expect(welcome.subject).toMatch(/حسابك/);
    // …and so is the page its link opens, on a phone that never chose a language.
    const own = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const portal = await own.newPage();
    await portal.goto(linkIn(welcome, TOPOLOGY_PORTAL_ORIGIN));
    await expect(portal.getByRole('heading', { name: 'مرحباً بك في OXShare' })).toBeVisible();
    await expect(portal.locator('html')).toHaveAttribute('dir', 'rtl');
    // The language was remembered and left the address; the token did not.
    const landed = new URL(portal.url());
    expect(landed.searchParams.has('lang')).toBe(false);
    expect(landed.searchParams.get('token')).toBeTruthy();
    await own.close();
  });

  test('refuses what a sign-up would refuse, each under its own field', async ({ page }) => {
    await page.goto('/clients');
    await page.getByRole('button', { name: 'New client' }).click();
    const dialog = page.getByRole('dialog');
    const client = staffClientDetails('refused');

    // A taken address — one of the suite's seeded clients.
    await dialog.getByLabel(/^Email/).fill(E2E_CLIENTS.alpha.email);
    await dialog.getByLabel(/^First name/).fill(client.firstName);
    await dialog.getByLabel(/^Last name/).fill(client.lastName);
    await dialog.getByLabel(/^Date of birth/).fill(client.dateOfBirth);
    await dialog.getByLabel(/^Nationality/).selectOption(client.nationality);
    await dialog.getByLabel(/^Phone/).fill(client.phone);
    await dialog.getByLabel(/^Country of residence/).selectOption(client.country);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.locator('#new-client-email-error')).toContainText(
      'already has an OxShare account',
    );

    // Corrected, then too young: refused under the date, nothing created.
    await dialog.getByLabel(/^Email/).fill(client.email);
    await dialog.getByLabel(/^Date of birth/).fill('2015-06-01');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.locator('#new-client-dateOfBirth-error')).toContainText('at least 18');
    await page.screenshot({ path: `${SCREENS}/03-new-client-refused.png`, fullPage: true });

    const api = await adminApi(page.context());
    const found = (await (
      await api.get(`/admin/clients?q=${encodeURIComponent(client.email)}`)
    ).json()) as { items: unknown[] };
    expect(found.items, 'a refused creation left a client behind').toHaveLength(0);

    // A taken phone — refused under the phone.
    const holder = await createClientByStaff(page.context(), 'phone-holder');
    await dialog.getByLabel(/^Date of birth/).fill(client.dateOfBirth);
    await dialog.getByLabel(/^Phone/).fill(holder.details.phone);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.locator('#new-client-phone-error')).toContainText(
      'already used by another OxShare account',
    );
  });

  test('the welcome email lets the client choose their password and sign in', async ({
    page,
    browser,
  }) => {
    const { id, email } = await createClientByStaff(page.context(), 'welcome');
    const mail = await waitForMail(email, { subject: WELCOME });
    const link = linkIn(mail, TOPOLOGY_PORTAL_ORIGIN);
    expect(link).toContain('welcome=1');

    // The client's own browser: nothing of the staff member's session in it.
    const own = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const portal = await own.newPage();
    await portal.goto(link);
    await expect(portal.getByRole('heading', { name: 'Welcome to OxShare' })).toBeVisible();
    await portal.screenshot({ path: `${SCREENS}/04-portal-welcome.png`, fullPage: true });
    await portal.getByLabel('New Password').fill('chosen-by-client-1');
    await portal.getByLabel('Confirm Password').fill('chosen-by-client-1');
    await portal.getByRole('button', { name: 'Set my password' }).click();
    await expect(portal.getByText('Your password is set!')).toBeVisible();

    // A used link is spent: what a client sees who opens the email a second time.
    // (Run the API with RELAX_RATE_LIMITS=1, as CI does: the reset route allows
    // five attempts in 15 minutes, and repeated local runs spend them.)
    await portal.goto(link);
    await portal.getByLabel('New Password').fill('someone-else-123');
    await portal.getByLabel('Confirm Password').fill('someone-else-123');
    await portal.getByRole('button', { name: 'Set my password' }).click();
    await expect(portal.getByText(/invalid or has expired/i)).toBeVisible();

    // And they sign in with the password they chose.
    await portal.goto(`${TOPOLOGY_PORTAL_ORIGIN}/auth/login`);
    await portal.getByLabel('Email', { exact: true }).fill(email);
    await portal.getByLabel('Password', { exact: true }).fill('chosen-by-client-1');
    await portal.getByRole('button', { name: 'Log In' }).click();
    await expect(portal).not.toHaveURL(/\/auth\/login/);
    await own.close();

    const api = await adminApi(page.context());
    const profile = (await (await api.get(`/admin/clients/${id}`)).json()) as {
      awaitingWelcome: boolean;
      emailVerified: boolean;
    };
    expect(profile.awaitingWelcome).toBe(false);
    expect(profile.emailVerified).toBe(true);
  });

  test('a mistyped address is fixed by changing it, and the welcome can be resent', async ({
    page,
  }) => {
    const { id, email } = await createClientByStaff(page.context(), 'resend');
    await waitForMail(email, { subject: WELCOME });

    await page.goto(`/clients/${id}`);
    await expect(
      page.getByText(/Created by E2E Admin · has not chosen a password yet/),
    ).toBeVisible();
    await page.getByRole('button', { name: /actions for/i }).click();
    await page.getByRole('menuitem', { name: 'Resend welcome email' }).click();
    await expect(page.getByText('Welcome email sent again')).toBeVisible();
    await expect.poll(() => mailCount(email, WELCOME)).toBe(2);

    const fixed = staffClientDetails('fixed').email;
    await page.getByRole('button', { name: /actions for/i }).click();
    await page.getByRole('menuitem', { name: 'Change sign-in email' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('New address').fill(fixed);
    // The dialog asks for the word, on purpose: changing a sign-in address is a takeover route.
    await dialog.getByLabel('Type CHANGE to confirm').fill('CHANGE');
    await dialog.getByRole('button', { name: 'Change it' }).click();
    // The welcome goes to the corrected address, not a verification link.
    const moved = await waitForMail(fixed, { subject: WELCOME });
    expect(linkIn(moved, TOPOLOGY_PORTAL_ORIGIN)).toContain('welcome=1');
  });

  test('staff who may not create clients are not offered it', async ({ browser }) => {
    const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
    const page = await restricted.newPage();
    await page.goto('/clients');
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New client' })).toHaveCount(0);
    await restricted.close();
  });
});
