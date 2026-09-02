import { expect, test } from './fixtures';
import {
  adminApiSession,
  API_NODE_BASE,
  mintClientWithPendingKyc,
  TOPOLOGY_PORTAL_ORIGIN,
  type MintedClient,
} from './helpers';

/**
 * The Rival payout rail, A→Z, on a client minted for this run alone.
 *
 * ## What this covers that the Vitest suites do not
 *
 * `rival-deposit-flow`, `rival-webhook-http`, `rival-withdrawal-flow` and
 * `rival-settings` already pin the protocol and the money rules against real
 * Postgres — replayed webhooks, tampered signatures, out-of-order events,
 * concurrent settles, `reversed` never touching the ledger. They run in CI and
 * need nothing else alive.
 *
 * What none of them can see is the TWO SYSTEMS disagreeing in real time, or what
 * the operator's screen says while they do. That is this file: a real Rival at
 * the other end, a real webhook coming back over the wire, and the desk read
 * through the console the way a person reads it.
 *
 * ## The rule under test, above all others
 *
 * D-66. With the payout rail ON, approving must leave the row AUTHORISED
 * (`approved`, `settledAt` null) and hand it to Rival — never `success`. A
 * withdrawal marked paid without being sent for payout debits the client and
 * pays nobody, and nothing looks wrong until they ask where their money is.
 *
 * ## Skipped, not failed, when the rail is off
 *
 * The rail is a settings toggle. A suite that goes red because an integration is
 * switched off teaches people to ignore it; one that says why it did not run
 * does not.
 */

/** Is the Rival rail configured AND switched on for this database? */
async function railIsLive(admin: Awaited<ReturnType<typeof adminApiSession>>): Promise<boolean> {
  const res = await admin.get('/admin/settings/rival');
  if (!res.ok()) return false;
  const cfg = (await res.json()) as { enabled?: boolean; apiKeySet?: boolean };
  if (!cfg.enabled || !cfg.apiKeySet) return false;
  // Configured is not the same as REACHABLE — the test-connection call is what
  // proves the key is accepted and Rival is answering right now.
  const probe = await admin.post('/admin/settings/rival/test', {});
  if (!probe.ok()) return false;
  return ((await probe.json()) as { ok?: boolean }).ok === true;
}

async function mintFundedClient(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  label: string,
  amount = '500.00000000',
): Promise<MintedClient> {
  const client = await mintClientWithPendingKyc(admin, label);
  expect((await admin.patch(`/admin/kyc/${client.id}/approve`)).ok()).toBe(true);
  const credit = await admin.post(
    '/admin/wallets/credit',
    { userId: client.id, amount, currency: 'USD', reason: `e2e ${label}` },
    { 'idempotency-key': `rival-${label}-credit-${client.id}` },
  );
  expect(credit.ok(), 'the wallet credit must land').toBe(true);
  return client;
}

/** The balance the SERVER reports — never a number read off a screen. */
async function usdBalance(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  clientId: string,
): Promise<string> {
  const res = await admin.get(`/admin/wallets?userId=${clientId}&limit=100&page=1`);
  expect(res.ok()).toBe(true);
  const wallets = ((await res.json()) as { items: { currency: string; balance: string }[] }).items;
  return wallets.find((w) => w.currency === 'USD')?.balance ?? '0';
}

async function requestWithdrawal(
  client: MintedClient,
  amount: string,
  tag: string,
): Promise<string> {
  const res = await client.portal.post(`${API_NODE_BASE}/payments/withdrawals`, {
    headers: {
      Origin: TOPOLOGY_PORTAL_ORIGIN,
      'X-OxShare-CSRF': client.csrf,
      'idempotency-key': `rival-${tag}-${client.id}`,
    },
    data: {
      amount,
      currency: 'USD',
      methodKey: 'whish',
      destination: '+961 70 123 456',
    },
  });
  expect(res.ok(), `withdrawal request answered ${res.status()}`).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** One row from the desk, as the console reads it. */
async function deskRow(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  txId: string,
): Promise<Record<string, unknown> | undefined> {
  // No `state` filter: it accepts only real enum values, and OMITTING it is how
  // the desk asks for every state. `state=all` is a 400.
  const res = await admin.get('/admin/withdrawals?limit=50');
  expect(res.ok()).toBe(true);
  const items = ((await res.json()) as { items: Record<string, unknown>[] }).items;
  return items.find((r) => r.id === txId);
}

/** Wait for the post-commit submission to reach Rival. */
async function awaitRivalId(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  txId: string,
): Promise<string | null> {
  for (let i = 0; i < 20; i += 1) {
    const row = await deskRow(admin, txId);
    // Narrowed rather than String()-ed: the desk row is typed as a bag of
    // `unknown`, and stringifying one would happily produce "[object Object]".
    const id = row?.rivalWithdrawalId;
    if (typeof id === 'string' && id.length > 0) return id;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

test.describe('the Rival payout rail', () => {
  test('D-66: approval AUTHORISES and hands off to Rival — it does not pay', async () => {
    test.setTimeout(300_000);
    const admin = await adminApiSession();
    test.skip(!(await railIsLive(admin)), 'the Rival rail is not configured/reachable here');

    const client = await mintFundedClient(admin, 'auth');
    try {
      const opening = await usdBalance(admin, client.id);
      const txId = await requestWithdrawal(client, '25.00000000', 'auth');

      await test.step('the request DEBITS immediately', async () => {
        expect(await usdBalance(admin, client.id)).toBe('475.00000000');
        const row = await deskRow(admin, txId);
        expect(row?.state, 'the desk shows it waiting for a decision').toBe('pending');
      });

      await test.step('approval leaves it AUTHORISED, not paid', async () => {
        const res = await admin.patch(`/admin/withdrawals/${txId}/approve`, undefined, {
          'idempotency-key': `rival-auth-approve-${txId}`,
        });
        expect(res.ok(), `approve answered ${res.status()}`).toBe(true);
        const body = (await res.json()) as { state: string; settledAt: string | null };

        // THE assertion. `success` here means the payout rail was bypassed.
        expect(body.state, 'with the rail on, approval authorises — it does not pay').toBe(
          'approved',
        );
        // Null because nothing has settled: the rail has not been asked yet. It
        // is also what makes "approved but never submitted" visible to the
        // reconciler rather than indistinguishable from a completed payout.
        expect(body.settledAt).toBeNull();
      });

      await test.step('the CRM submits it to Rival, and the desk shows the reference', async () => {
        const rivalId = await awaitRivalId(admin, txId);
        expect(rivalId, 'the payout was never handed to Rival').toBeTruthy();

        const row = await deskRow(admin, txId);
        expect(row?.state).toBe('approved');
        // The identifier an operator quotes in a ticket. Stored from day one and
        // rendered nowhere until it was put on the desk.
        expect(String(row?.rivalWithdrawalId)).toMatch(/[0-9a-f-]{36}/);
        expect(row?.rivalNeedsAttention, 'a clean submission raises no flag').toBeFalsy();
      });

      await test.step('the money has NOT moved again', async () => {
        expect(await usdBalance(admin, client.id)).toBe('475.00000000');
        expect(opening).toBe('500.00000000');
      });
    } finally {
      await client.dispose();
    }
  });

  test('a second approval is refused — a double-click cannot pay twice', async () => {
    test.setTimeout(300_000);
    const admin = await adminApiSession();
    test.skip(!(await railIsLive(admin)), 'the Rival rail is not configured/reachable here');

    const client = await mintFundedClient(admin, 'dbl');
    try {
      const txId = await requestWithdrawal(client, '30.00000000', 'dbl');
      const first = await admin.patch(`/admin/withdrawals/${txId}/approve`, undefined, {
        'idempotency-key': `rival-dbl-a-${txId}`,
      });
      expect(first.ok()).toBe(true);

      // A DIFFERENT idempotency key, deliberately: this is the conditional
      // `UPDATE … WHERE state = 'pending'` doing the work, not a replayed answer.
      const second = await admin.patch(`/admin/withdrawals/${txId}/approve`, undefined, {
        'idempotency-key': `rival-dbl-b-${txId}`,
      });
      expect(second.ok(), 'the second approval must be refused').toBe(false);
      expect(await usdBalance(admin, client.id), 'no second debit').toBe('470.00000000');
    } finally {
      await client.dispose();
    }
  });

  test('the desk can still REFUSE before the rail is involved — and the money comes back', async () => {
    test.setTimeout(300_000);
    const admin = await adminApiSession();
    test.skip(!(await railIsLive(admin)), 'the Rival rail is not configured/reachable here');

    const client = await mintFundedClient(admin, 'rej');
    try {
      const txId = await requestWithdrawal(client, '40.00000000', 'rej');
      expect(await usdBalance(admin, client.id)).toBe('460.00000000');

      const res = await admin.patch(
        `/admin/withdrawals/${txId}/reject`,
        { reason: 'e2e: refused at the desk' },
        { 'idempotency-key': `rival-rej-${txId}` },
      );
      expect(res.ok(), `reject answered ${res.status()}`).toBe(true);

      const row = await deskRow(admin, txId);
      expect(row?.state).toBe('rejected');
      // Refused before approval, so it never reached the rail at all.
      expect(row?.rivalWithdrawalId ?? null, 'a refused request is never submitted').toBeNull();
      expect(await usdBalance(admin, client.id), 'refunded in full').toBe('500.00000000');
    } finally {
      await client.dispose();
    }
  });

  test('the console shows the authorised state and both references', async ({ page }) => {
    test.setTimeout(300_000);
    const admin = await adminApiSession();
    test.skip(!(await railIsLive(admin)), 'the Rival rail is not configured/reachable here');

    const client = await mintFundedClient(admin, 'ui');
    try {
      const txId = await requestWithdrawal(client, '50.00000000', 'ui');
      expect(
        (
          await admin.patch(`/admin/withdrawals/${txId}/approve`, undefined, {
            'idempotency-key': `rival-ui-approve-${txId}`,
          })
        ).ok(),
      ).toBe(true);
      const rivalId = await awaitRivalId(admin, txId);
      expect(rivalId).toBeTruthy();

      /*
       * Read through the CONSOLE, not the API. An operator raising a ticket
       * about a payout reads this screen; a reference that exists only in a JSON
       * response is one they have to ask an engineer for.
       */
      /*
       * `state=all` on the PAGE, and no `state` on the API.
       *
       * They are not the same parameter: the desk defaults to `pending`, and its
       * own `all` option maps to omitting the filter when it calls the API —
       * which rejects the literal `all` as an enum value. An approved row is
       * invisible under the default filter, so this is what makes it findable.
       */
      await page.goto(`/transactions?state=all&q=${encodeURIComponent(client.email)}`);
      await page.waitForLoadState('networkidle');

      /*
       * Found by the CLIENT'S EMAIL, not a row index.
       *
       * The desk is a live queue — another spec approving something reorders it
       * between the read and the click. The minted client's address is unique to
       * this run, and the row-actions trigger is deliberately named per row
       * ("Actions for …'s withdrawal") precisely so it can be addressed.
       */
      /*
       * The desk is searched down to this client, then the single row's action
       * trigger is taken generically. Matching the trigger's NAME on the email
       * does not work: it is built from the client's first and last name, and
       * only falls back to the address when those are empty.
       */
      const actions = page.getByRole('button', { name: /Actions for/i });
      await expect(actions.first()).toBeVisible({ timeout: 20_000 });
      await actions.first().click();

      await page.getByRole('menuitem', { name: /view details/i }).click();

      // Both halves of the reference pair, on the screen an operator reads
      // before raising a ticket.
      await expect(page.getByText('Payment platform reference')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(String(rivalId), { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await client.dispose();
    }
  });
});
