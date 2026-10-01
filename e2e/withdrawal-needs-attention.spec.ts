import { expect, test } from './fixtures';
import {
  adminApiSession,
  API_NODE_BASE,
  mintFreshClientWithPendingKyc,
  STORAGE_STATE,
  TOPOLOGY_PORTAL_ORIGIN,
  type MintedClient,
  requireRail,
} from './helpers';

/**
 * When the payment platform REFUSES a payout, the desk has to SEE it.
 *
 * ## Why this needs a browser, and why it is the load-bearing test for D-76
 *
 * A withdrawal the CRM approves but Rival cannot fund stays `approved` with the
 * client's money already debited, and is deliberately NOT auto-refunded — the
 * desk is expected to top up and retry, because auto-refunding would cancel a
 * withdrawal the client never cancelled.
 *
 * That trade is only defensible if the failure is LOUD. `scripts/rival-underfunded-payout.mjs`
 * proves the flag, the notification and the audit row all land IN THE DATABASE.
 * None of that is worth anything if the desk screen does not render it: a row
 * sitting in `approved` looks exactly like one waiting for a slow payout, and
 * the client's money sits inside it indefinitely with nobody looking.
 *
 * So the assertion here is the one no HTTP test can make — that a human at the
 * console is TOLD, in words, and is offered the recovery.
 *
 * ## How the refusal is produced
 *
 * By asking for more than OxShare's own wallet holds at Rival. Rival checks the
 * company balance at CREATE time and answers 409 INSUFFICIENT_BALANCE before
 * reserving anything, so nothing is created there and no balance moves — the
 * shortfall costs nothing and cleans up after itself.
 *
 * Skipped, not failed, when the rail is off or Rival is unreachable: a suite
 * that goes red because an integration is switched off teaches people to
 * ignore it.
 */

test.use({ storageState: STORAGE_STATE });

/**
 * An INCONCLUSIVE probe throws; only "an operator switched it off" skips.
 *
 * Returning `false` on any non-2xx conflated "the rail is off" with "I could
 * not find out", and the second is routine: admin logins are rate limited per
 * account, so a 429 here silently skipped the one test that proves a refused
 * payout is visible to the desk. See the twin in `rival-integration.spec.ts`.
 */
async function railIsLive(admin: Awaited<ReturnType<typeof adminApiSession>>): Promise<boolean> {
  const res = await admin.get('/admin/payment-providers/rival');
  if (res.status() === 429) {
    throw new Error('Rate limited while checking the Rival rail — inconclusive, not "off".');
  }
  if (!res.ok()) throw new Error(`Could not read Rival's provider settings: HTTP ${res.status()}`);
  const cfg = (await res.json()) as {
    enabled?: boolean;
    settings?: { name: string; isSet?: boolean }[];
  };
  const apiKeySet = cfg.settings?.find((setting) => setting.name === 'apiKey')?.isSet === true;
  if (!cfg.enabled || !apiKeySet) return false;
  const probe = await admin.post('/admin/payment-providers/rival/test', {});
  if (probe.status() === 429) {
    throw new Error('Rate limited while probing the Rival connection — inconclusive, not "off".');
  }
  if (!probe.ok()) throw new Error(`Rival connection probe failed: HTTP ${probe.status()}`);
  return ((await probe.json()) as { ok?: boolean }).ok === true;
}

/**
 * An amount OxShare's Rival wallet provably cannot cover.
 *
 * Read from Rival rather than hardcoded: a fixed number is either too small the
 * day the wallet is funded (the test silently stops testing anything, because
 * the payout SUCCEEDS and every assertion below is skipped) or absurdly large.
 */
async function unfundableAmount(): Promise<string> {
  const base = process.env.RIVAL_API ?? 'http://localhost:4001/v1';
  const email = process.env.RIVAL_OWNER_EMAIL ?? 'owner@oxshare-crm.test';
  const password = process.env.RIVAL_OWNER_PASSWORD ?? 'OxShareLocal1!';
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) throw new Error(`Rival owner login answered ${login.status}`);
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    const res = await fetch(`${base}/company/wallets`, { headers: { cookie } });
    if (!res.ok) throw new Error(`Rival /company/wallets answered ${res.status}`);
    /*
     * Rival's LIST endpoints double-nest: `{success, statusCode, data: {data: []}}`,
     * while its single-object endpoints put the object straight in `data`. Reading
     * only the flat shape yields an empty list, which this helper would report as
     * "cannot read the balance" and the test would SKIP — passing without ever
     * running. Accept both shapes rather than trusting one.
     */
    const body = (await res.json()) as { data?: unknown };
    const inner = (body.data as { data?: unknown })?.data ?? body.data;
    const rows = (Array.isArray(inner) ? inner : []) as {
      currency?: string;
      availableBalance?: string;
    }[];
    const usd = rows.find((w) => w.currency === 'USD');
    if (!usd?.availableBalance) {
      throw new Error(`No USD wallet in Rival's response: ${JSON.stringify(rows).slice(0, 200)}`);
    }
    // Whole dollars, comfortably clear of the balance and of any fee on top.
    return String(Math.floor(Number(usd.availableBalance)) + 250);
  } catch (error) {
    /*
     * THROW, never return null.
     *
     * This swallowed every failure into "cannot read the balance", which the
     * caller turned into a SKIP — so a broken Rival connection, a changed
     * response shape or a wrong password all produced a green run with one
     * quietly skipped test. Being unable to read the balance is a broken
     * environment, not a reason to declare the payout rail untestable.
     */
    throw new Error(
      `Could not read OxShare's balance at Rival: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function requestWithdrawal(client: MintedClient, amount: string): Promise<string> {
  const res = await client.portal.post(`${API_NODE_BASE}/payments/withdrawals`, {
    headers: {
      Origin: TOPOLOGY_PORTAL_ORIGIN,
      'X-OxShare-CSRF': client.csrf,
      'idempotency-key': `needs-attention-${client.id}`,
    },
    data: { amount, currency: 'USD', methodKey: 'whish', destination: '+961 70 123 456' },
  });
  expect(res.ok(), `withdrawal request answered ${res.status()}`).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

test.describe('a payout the platform refuses is visible on the desk', () => {
  test('the row is flagged, the reason is on screen, and a retry is offered', async ({ page }) => {
    /*
     * The same 300s its two sibling money specs take, and for the same reason:
     * this case drives the whole payout lifecycle before it opens a browser —
     * mint a client, approve KYC, credit the wallet, request, approve, then poll
     * up to 30s for a post-commit flag — and only then loads the desk.
     *
     * It was the only one of the three with NO budget set, so it ran on the 60s
     * default and timed out on the work rather than on anything being wrong.
     * That is worth naming because the failure looked like the desk not
     * flagging the row, which is exactly what this test exists to detect: a
     * timeout here is indistinguishable from the defect unless the budget is
     * obviously sufficient.
     */
    test.setTimeout(300_000);
    const admin = await adminApiSession();
    requireRail(await railIsLive(admin));

    const amount = await unfundableAmount();

    // ── produce the refusal ────────────────────────────────────────────────
    const client = await mintFreshClientWithPendingKyc(admin, 'needs-attention');
    expect((await admin.patch(`/admin/kyc/${client.id}/approve`)).ok()).toBe(true);
    expect(
      (
        await admin.post(
          '/admin/wallets/credit',
          { userId: client.id, amount: `${Number(amount) + 100}`, currency: 'USD', reason: 'e2e' },
          { 'idempotency-key': `needs-attention-credit-${client.id}` },
        )
      ).ok(),
    ).toBe(true);

    const txId = await requestWithdrawal(client, amount);
    expect(
      (
        await admin.patch(`/admin/withdrawals/${txId}/approve`, undefined, {
          'idempotency-key': `needs-attention-approve-${txId}`,
        })
      ).ok(),
    ).toBe(true);

    // The submission is post-commit, so the flag arrives a moment later.
    await expect
      .poll(
        async () => {
          const res = await admin.get('/admin/withdrawals?limit=50');
          const items = ((await res.json()) as { items: Record<string, unknown>[] }).items;
          return items.find((r) => r.id === txId)?.needsAttention === true;
        },
        { timeout: 30_000, message: 'the refusal never flagged the row' },
      )
      .toBe(true);

    // ── the part only a browser can answer ─────────────────────────────────
    /*
     * The desk is `/transactions`, not `/withdrawals` — there is no such route.
     * Narrowing by SEARCH rather than scanning the table is what the existing
     * desk spec does, and it matters here: the console is a shared dev database
     * whose first page is whatever ran most recently, so an unfiltered table
     * makes this test's result depend on other tests.
     */
    await page.goto('/transactions');

    /*
     * The desk opens on PENDING, and a refused payout is `approved` — so the
     * default view says "No withdrawals in this state" and a test that searched
     * without switching tabs would fail while the feature works perfectly.
     *
     * "Awaiting payout" is the desk's dedicated queue for rail-backed rows that
     * have been authorised but not paid, and its COUNT is the first thing that
     * tells an operator something is waiting on them. Asserting the tab exists
     * and carries this row is a stronger statement than finding it in an
     * unfiltered list: it proves the row is somewhere a person actually looks.
     */
    await page.waitForLoadState('networkidle');

    const awaitingTab = page.getByRole('button', { name: /awaiting payout/i });
    await expect(
      awaitingTab,
      'the desk needs a queue for authorised-but-unpaid rows',
    ).toBeVisible();

    // Click AND wait for the refetch it triggers. Firing the click without
    // waiting raced hydration: the tab stayed on Pending, the table said "no
    // withdrawals in this state", and the failure looked like a missing row.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/admin/withdrawals') && r.ok()),
      awaitingTab.click(),
    ]);
    await expect(awaitingTab, 'the tab must actually switch').toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const search = page.getByPlaceholder(/search by name, email or portal id/i);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('q=') && r.ok()),
      search.fill(client.email),
    ]);

    const row = page.locator('tr', { hasText: client.email });
    await expect(row.first(), 'the flagged withdrawal must be on the desk').toBeVisible({
      timeout: 20_000,
    });

    /*
     * The BADGE. Without it an underfunded payout is indistinguishable from one
     * waiting on a slow provider, and the client's debited money sits in a row
     * nobody is looking at — which is the entire risk D-76 accepts.
     */
    await expect(row.first().getByText(/needs attention/i)).toBeVisible();

    /*
     * The REASON, in words. The flag alone reads as "the system is broken" and
     * sends the operator to the logs; naming the shortfall is what makes the
     * next action ("top up at Rival") obvious.
     */
    await expect(
      row
        .first()
        .getByText(/insufficient|balance/i)
        .first(),
    ).toBeVisible();

    /*
     * The RECOVERY. `POST /admin/withdrawals/:id/rival-submit` exists, but a
     * desk that cannot reach it has to escalate to an engineer for what is a
     * routine top-up-and-retry.
     */
    // "Resend payout" since the payments core (0173): one name for every provider.
    await expect(row.first().getByRole('button', { name: /resend payout/i })).toBeVisible();

    /*
     * And it must still read as UNPAID. A refused payout showing "paid" would be
     * the most expensive wrong pixel on this screen.
     */
    await expect(row.first().getByText(/\bpaid\b/i)).toHaveCount(0);

    // ── leave nothing holding the client's money ───────────────────────────
    const cancel = await admin.patch(
      `/admin/withdrawals/${txId}/cancel`,
      { reason: 'e2e cleanup: underfunded payout.' },
      { 'idempotency-key': `needs-attention-cancel-${txId}` },
    );
    expect(cancel.ok(), 'the cleanup cancel must refund the client').toBe(true);
  });
});
