import { request, type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  adminApiSession,
  API_NODE_BASE,
  linkIn,
  TOPOLOGY_PORTAL_ORIGIN,
  waitForMail,
} from './helpers';

/**
 * FR-CORE-13 / ADM-03 A→Z — the money state machine, driven for real on a
 * client minted for this run alone:
 *
 *   register → verify → KYC (three documents) → an administrator approves →
 *   the wallet is CREDITED → three withdrawal requests debit it → the DESK
 *   approves one (paid), rejects one with a note (money comes BACK), leaves
 *   one pending → every balance is asserted to the cent from the server, the
 *   states land in the audit trail, and no cancel is offered where the
 *   lifecycle has no cancel.
 *
 * A fresh client, because money history is append-only: a seeded fixture
 * would accumulate this run's rows into every later assertion.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A portal API session for one fresh client, everything by wire. */
async function mintApprovedClient(admin: Awaited<ReturnType<typeof adminApiSession>>): Promise<{
  portal: APIRequestContext;
  csrf: string;
  email: string;
  id: string;
  dispose: () => Promise<void>;
}> {
  const email = `e2e-desk-${Date.now()}@oxshare-e2e-signup.test`;
  const password = 'Desk-journey-123!';
  const portal = await request.newContext();
  const origin = { Origin: TOPOLOGY_PORTAL_ORIGIN };

  const registered = await portal.post(`${API_NODE_BASE}/auth/register`, {
    headers: origin,
    data: { email, password, firstName: 'Desk', lastName: 'Journey' },
  });
  test.skip(registered.status() === 429, 'registration is rate limited right now (10/h)');
  expect(registered.ok(), `register answered ${registered.status()}`).toBe(true);

  const mail = await waitForMail(email, { subject: /verify/i });
  const token = new URL(linkIn(mail, TOPOLOGY_PORTAL_ORIGIN)).searchParams.get('token')!;
  expect(
    (
      await portal.post(`${API_NODE_BASE}/auth/verify-email`, { headers: origin, data: { token } })
    ).ok(),
  ).toBe(true);

  const login = await portal.post(`${API_NODE_BASE}/auth/login`, {
    headers: origin,
    data: { email, password },
  });
  test.skip(login.status() === 429, 'portal login is rate limited right now');
  expect(login.ok(), `login answered ${login.status()}`).toBe(true);
  const csrf =
    (await portal.storageState()).cookies.find((c) => c.name.includes('portal_csrf'))?.value ?? '';
  expect(csrf, 'no portal CSRF cookie after login').toBeTruthy();
  const write = { ...origin, 'X-OxShare-CSRF': csrf };

  // The three-document KYC, by wire, then the administrator's approval.
  const step = (stepName: string, data: Record<string, unknown>) =>
    portal.post(`${API_NODE_BASE}/kyc/step`, { headers: write, data: { step: stepName, data } });
  expect(
    (
      await step('personal', {
        firstName: 'Desk',
        lastName: 'Journey',
        dateOfBirth: '1988-08-08',
        phone: '+96170000010',
        nationality: 'Lebanon',
        country: 'Lebanon',
      })
    ).ok(),
  ).toBe(true);
  expect((await step('document', { docType: 'passport' })).ok()).toBe(true);
  for (const field of ['doc_front', 'selfie']) {
    const up = await portal.post(`${API_NODE_BASE}/kyc/upload`, {
      headers: write,
      multipart: { file: { name: `${field}.png`, mimeType: 'image/png', buffer: PNG }, field },
    });
    expect(up.ok(), `uploading ${field} answered ${up.status()}`).toBe(true);
  }
  expect((await step('address', { docType: 'utility_bill' })).ok()).toBe(true);
  const up = await portal.post(`${API_NODE_BASE}/kyc/upload`, {
    headers: write,
    multipart: {
      file: { name: 'address_proof.png', mimeType: 'image/png', buffer: PNG },
      field: 'address_proof',
    },
  });
  expect(up.ok()).toBe(true);
  expect((await portal.post(`${API_NODE_BASE}/kyc/submit`, { headers: write })).ok()).toBe(true);

  const found = await admin.get(`/admin/clients?q=${encodeURIComponent(email)}&limit=5`);
  const id =
    ((await found.json()) as { items: { id: string; email: string }[] }).items.find(
      (c) => c.email === email,
    )?.id ?? '';
  expect(id, 'the fresh client is not on the admin index').toBeTruthy();
  expect((await admin.patch(`/admin/kyc/${id}/approve`)).ok()).toBe(true);

  return { portal, csrf, email, id, dispose: () => portal.dispose() };
}

test('credit → request ×3 → approve+settle, reject, and cancel — every leg refunds or pays exactly once', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const admin = await adminApiSession();
  const client = await mintApprovedClient(admin);

  const usdBalance = async (): Promise<string> => {
    const res = await admin.get(`/admin/wallets?userId=${client.id}&limit=100&page=1`);
    expect(res.ok()).toBe(true);
    const wallet = (
      (await res.json()) as {
        items: { currency: string; balance: string }[];
      }
    ).items.find((w) => w.currency === 'USD');
    return wallet?.balance ?? '0';
  };

  try {
    await test.step('the administrator CREDITS the wallet, idempotently', async () => {
      const key = `desk-credit-${client.id}`;
      const credit = () =>
        admin.post(
          '/admin/wallets/credit',
          { userId: client.id, amount: '100.00000000', currency: 'USD', reason: 'e2e desk run' },
          { 'idempotency-key': key },
        );
      expect((await credit()).ok()).toBe(true);
      // The SAME key replays the stored answer instead of crediting twice.
      expect((await credit()).ok()).toBe(true);
      expect(await usdBalance(), 'one credit, whatever the retry count').toBe('100.00000000');
    });

    const withdrawalIds: string[] = [];
    let approvedId = '';
    await test.step('the client requests three withdrawals — each debits on REQUEST', async () => {
      const methodsRes = await client.portal.get(`${API_NODE_BASE}/payments/withdrawal-methods`, {
        headers: { Origin: TOPOLOGY_PORTAL_ORIGIN },
      });
      expect(methodsRes.ok()).toBe(true);
      const methods = (await methodsRes.json()) as { key: string }[];
      test.skip(methods.length === 0, 'no withdrawal method is configured on this database');

      for (let i = 0; i < 3; i++) {
        const res = await client.portal.post(`${API_NODE_BASE}/payments/withdrawals`, {
          headers: {
            Origin: TOPOLOGY_PORTAL_ORIGIN,
            'X-OxShare-CSRF': client.csrf,
            'idempotency-key': `desk-wd-${client.id}-${i}`,
          },
          data: {
            amount: '10.00000000',
            currency: 'USD',
            methodKey: methods[0]!.key,
            destination: '+961 70 123 456',
          },
        });
        expect(res.ok(), `withdrawal ${i} answered ${res.status()}`).toBe(true);
        withdrawalIds.push(((await res.json()) as { id: string }).id);
      }
      expect(await usdBalance(), 'three requests debit up front').toBe('70.00000000');
    });

    await test.step('the DESK approves one through the console — it pays in one step', async () => {
      await page.goto('/transactions');
      const search = page.getByPlaceholder(/search by client name or email/i);
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('q=') && r.ok()),
        search.fill(client.email),
      ]);
      // The search already narrows the table to this client's rows.
      const actions = page.getByRole('button', { name: /actions for/i });
      await expect(actions.first()).toBeVisible();
      await actions.first().click();
      const [approved] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/approve') && r.request().method() === 'PATCH',
        ),
        (async () => {
          await page.getByRole('menuitem', { name: /^approve$/i }).click();
          // The confirm is a Radix AlertDialog — role "alertdialog", not "dialog".
          await page
            .getByRole('alertdialog')
            .getByRole('button', { name: /^approve$/i })
            .click();
        })(),
      ]);
      expect(approved.status(), 'the desk approval failed').toBe(200);
      // Whish is a payment-platform rail (D-66): approval AUTHORISES and parks
      // the row in `approved` while the payout runs — it does not settle.
      const approvedRow = (await approved.json()) as { id: string; state: string };
      expect(approvedRow.state).toBe('approved');
      approvedId = approvedRow.id;
      expect(await usdBalance(), 'authorising must move no money').toBe('70.00000000');
    });

    await test.step('SETTLE is its own permission and its own step — approved → success', async () => {
      const settle = (key: string) =>
        admin.patch(
          `/admin/withdrawals/${approvedId}/settle`,
          { providerRef: `e2e-desk-ref-${client.id}` },
          { 'idempotency-key': key },
        );
      const settled = await settle(`desk-settle-${client.id}`);
      expect(settled.ok(), `settle answered ${settled.status()}`).toBe(true);
      expect(((await settled.json()) as { state: string }).state).toBe('success');
      // The SAME key replays the stored answer; money moved exactly once.
      expect((await settle(`desk-settle-${client.id}`)).ok()).toBe(true);
      // A NEW key against a settled row hits the state guard, not a second payout.
      const again = await settle(`desk-settle-${client.id}-2`);
      expect(again.status(), 'only an approved withdrawal may settle').toBeGreaterThanOrEqual(400);
      expect(await usdBalance(), 'settlement releases the hold, refunds nothing').toBe(
        '70.00000000',
      );
    });

    await test.step('the DESK rejects one with a note — the money comes BACK', async () => {
      await page.goto('/transactions');
      const search = page.getByPlaceholder(/search by client name or email/i);
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('q=') && r.ok()),
        search.fill(client.email),
      ]);
      const actions = page.getByRole('button', { name: /actions for/i });
      await expect(actions.first()).toBeVisible();
      await actions.first().click();
      await page.getByRole('menuitem', { name: /^reject$/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/reject withdrawal/i).first()).toBeVisible();
      await dialog.locator('textarea').fill('Destination details incomplete — e2e desk run.');
      const [rejected] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/reject') && r.request().method() === 'PATCH',
        ),
        dialog.getByRole('button', { name: /confirm rejection/i }).click(),
      ]);
      expect(rejected.status(), 'the rejection failed').toBe(200);
      expect(await usdBalance(), 'a rejected withdrawal must refund to the cent').toBe(
        '80.00000000',
      );
    });

    const statesNow = async (): Promise<string[]> => {
      const list = await admin.get(
        `/admin/withdrawals?q=${encodeURIComponent(client.email)}&limit=50`,
      );
      expect(list.ok()).toBe(true);
      const rows = ((await list.json()) as { items: { id: string; state: string }[] }).items;
      return rows
        .filter((r) => withdrawalIds.includes(r.id))
        .map((r) => r.state)
        .sort();
    };

    await test.step('the third row sat through all of it UNTOUCHED — still pending', async () => {
      expect(await statesNow()).toEqual(['pending', 'rejected', 'success']);
    });

    let cancelledId = '';
    await test.step('approve the third, then CANCEL it from the console — the money comes back', async () => {
      await page.goto('/transactions');
      const search = page.getByPlaceholder(/search by client name or email/i);
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('q=') && r.ok()),
        search.fill(client.email),
      ]);
      const actions = page.getByRole('button', { name: /actions for/i });
      await expect(actions.first()).toBeVisible();
      await actions.first().click();
      const [approved] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/approve') && r.request().method() === 'PATCH',
        ),
        (async () => {
          await page.getByRole('menuitem', { name: /^approve$/i }).click();
          await page
            .getByRole('alertdialog')
            .getByRole('button', { name: /^approve$/i })
            .click();
        })(),
      ]);
      expect(approved.status()).toBe(200);
      cancelledId = ((await approved.json()) as { id: string }).id;

      // Approved rows live on the "Awaiting payout" tab (D-66).
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('state=approved') && r.ok()),
        page.getByRole('button', { name: /awaiting payout/i }).click(),
      ]);
      await expect(actions.first()).toBeVisible();
      await actions.first().click();
      await page.getByRole('menuitem', { name: /^cancel$/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/cancel this approved withdrawal/i).first()).toBeVisible();
      await dialog.locator('textarea').fill('Client asked us to stop it — e2e desk run.');
      const [cancelled] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/cancel') && r.request().method() === 'PATCH',
        ),
        dialog.getByRole('button', { name: /cancel the withdrawal/i }).click(),
      ]);
      expect(cancelled.status(), 'the cancellation failed').toBe(200);
      expect(await usdBalance(), 'a cancelled payout must refund to the cent').toBe('90.00000000');
      // Cancel unwinds through the FAILURE leg — refunded, reasoned, terminal.
      expect(await statesNow()).toEqual(['failure', 'rejected', 'success']);
    });

    await test.step('terminal rows refuse re-approval — the state machine has no loops', async () => {
      const replay = await admin.patch(`/admin/withdrawals/${approvedId}/approve`);
      expect(replay.status(), 'a settled row must not approve again').toBeGreaterThanOrEqual(400);
    });

    await test.step('every decision is in the audit trail, by name', async () => {
      for (const [action, mustContain] of [
        ['withdrawal.approve', approvedId],
        ['withdrawal.settle', approvedId],
        ['withdrawal.cancel', cancelledId],
      ] as const) {
        const res = await admin.get(`/admin/audit-log?action=${action}&limit=20`);
        expect(res.ok()).toBe(true);
        expect(JSON.stringify(await res.json()), `${action} is not in the audit trail`).toContain(
          mustContain,
        );
      }
      const rejects = await admin.get('/admin/audit-log?action=withdrawal.reject&limit=20');
      const rejectText = JSON.stringify(await rejects.json());
      expect(
        withdrawalIds.some((id) => rejectText.includes(id)),
        'the rejection is not in the audit trail',
      ).toBe(true);
    });
  } finally {
    await client.dispose();
    await admin.dispose();
  }
});
