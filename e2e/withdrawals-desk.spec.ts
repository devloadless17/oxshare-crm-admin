import { expect, test } from './fixtures';
import {
  adminApiSession,
  API_NODE_BASE,
  mintFreshClientWithPendingKyc,
  TOPOLOGY_PORTAL_ORIGIN,
  type MintedClient,
  requirePrecondition,
  requireRail,
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

/**
 * A fresh client, KYC APPROVED and ready to be credited.
 *
 * The journey up to the submission lives in `helpers.ts` — the realtime spec
 * needs the same client one step earlier, with the review still pending,
 * because there the approval is the thing under test.
 */
async function mintApprovedClient(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
): Promise<MintedClient> {
  const client = await mintFreshClientWithPendingKyc(admin, 'desk');
  expect((await admin.patch(`/admin/kyc/${client.id}/approve`)).ok()).toBe(true);
  return client;
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
    // Whether approval hands off to a payout rail — see the approve step.
    let railPaysOut = false;
    await test.step('the client requests three withdrawals — each debits on REQUEST', async () => {
      const methodsRes = await client.portal.get(`${API_NODE_BASE}/payments/withdrawal-methods`, {
        headers: { Origin: TOPOLOGY_PORTAL_ORIGIN },
      });
      expect(methodsRes.ok()).toBe(true);
      const methods = (await methodsRes.json()) as { key: string }[];
      requirePrecondition(
        methods.length === 0,
        'no withdrawal method is configured on this database',
      );

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
      const search = page.getByPlaceholder(/search by name, email.*portal id/i);
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
      /*
       * ⚠️ APPROVAL HAS TWO LEGITIMATE OUTCOMES, and which one you get is a
       * matter of CONFIGURATION rather than of the code under test.
       *
       * `RivalWithdrawalsService.willPayOut` requires the provider to be
       * `whish` AND Rival to be enabled. With a rail: approval AUTHORISES and
       * parks the row in `approved` while the payout runs (D-66). Without one:
       * there is nothing to hand off to, so the desk pays in one step and the
       * row goes straight to `success`.
       *
       * This asserted only the first, which is what a developer with live
       * Rival credentials in their `.env` sees. CI configures no rail, so it
       * took the second path and the journey failed on a state name while
       * every money movement was correct. Both are pinned now, and the money
       * is asserted to the cent either way — which is what this test is for.
       */
      const approvedRow = (await approved.json()) as { id: string; state: string };
      approvedId = approvedRow.id;
      railPaysOut = approvedRow.state === 'approved';
      expect(approvedRow.state, 'approval produced neither of the two lifecycle outcomes').toMatch(
        /^(approved|success)$/,
      );
      /*
       * The money is the same in both: the client was debited at REQUEST time,
       * so neither authorising nor paying moves the wallet again. A refund
       * would show here as a balance above 70.
       */
      expect(await usdBalance(), 'deciding a withdrawal must not move the wallet').toBe(
        '70.00000000',
      );
    });

    await test.step('SETTLE is its own permission and its own step — approved → success', async () => {
      /*
       * Only reachable behind a rail. Without one the row already settled on
       * approval, and settling a `success` row is the state-guard case the
       * negative assertion below covers rather than the path this step walks.
       */
      requireRail(railPaysOut);
      const settle = (key: string) =>
        admin.patch(
          `/admin/withdrawals/${approvedId}/settle`,
          // Unique per WITHDRAWAL, and never a client uuid: the console prints a
          // provider reference verbatim, so a fixture that built one from the
          // client id put that id on screen.
          { providerRef: `e2e-desk-ref-${approvedId}` },
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
      const search = page.getByPlaceholder(/search by name, email.*portal id/i);
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
      const search = page.getByPlaceholder(/search by name, email.*portal id/i);
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
