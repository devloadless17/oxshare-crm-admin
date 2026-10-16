import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures';
import {
  adminApiSession,
  API_NODE_BASE,
  mintFreshClientWithPendingKyc,
  TINY_PNG,
  TOPOLOGY_PORTAL_ORIGIN,
} from './helpers';

/**
 * EVERY MOVEMENT EXPLAINS ITSELF (16 Oct 2026), driven for real.
 *
 * The buyer's accountants asked, for every transfer, which account the money moved from and to
 * and where the money on a trading account came from. This drives every way money reaches or
 * leaves a trading account, on a client minted for this run alone (money history is append-only),
 * and checks what the record SAYS on every surface:
 *
 *   1. the desk credits the wallet (desk credit, money IN from the company);
 *   2. the client moves wallet → account themselves (origin Client);
 *   3. the desk funds the account with new money (a desk credit + a transfer, origin Desk: new
 *      funds, its source the credit);
 *   4. the desk moves wallet → account (Desk: from wallet) and account → wallet (Desk: from account);
 *   5. the client deposits by bank transfer STRAIGHT to the account, the desk approves, and the
 *      chained transfer names that deposit as its source (origin Deposit to account).
 *
 * Then the server's accounting is asserted to the cent (settled per type, net), and the browser is
 * driven over the Transfers page, Financial and the client profile.
 */

const AMOUNTS = {
  deskCredit: '500.00',
  clientToAccount: '200.00',
  deskNewFunds: '160.00',
  deskFromWallet: '150.00',
  deskFromAccount: '30.00',
  bankDeposit: '150.00',
};

type Row = {
  id: string;
  type: string;
  effect: string;
  state: string;
  amount: string;
  origin: string | null;
  from: { kind: string; walletNumber?: string | null; login?: string | null };
  to: { kind: string; walletNumber?: string | null; login?: string | null };
  source: { transactionId: string } | null;
  requestedBy: { name: string | null } | null;
  deskReason: string | null;
};

test('every transfer names both ends, its origin and its source — on every screen, and the books add up', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const admin = await adminApiSession();
  const client = await mintFreshClientWithPendingKyc(admin, 'transfers');
  const portalHeaders = (extra: Record<string, string> = {}) => ({
    Origin: TOPOLOGY_PORTAL_ORIGIN,
    'X-OxShare-CSRF': client.csrf,
    ...extra,
  });
  const key = () => ({ 'Idempotency-Key': randomUUID() });

  try {
    expect((await admin.patch(`/admin/kyc/${client.id}/approve`)).ok()).toBe(true);

    // 1. The desk credits the wallet.
    const credit = await admin.post(
      '/admin/wallets/credit',
      {
        userId: client.id,
        amount: AMOUNTS.deskCredit,
        currency: 'USD',
        reason: 'E2E opening balance',
      },
      key(),
    );
    expect(credit.ok(), `desk credit answered ${credit.status()}`).toBe(true);

    // A live account, opened by the client (its product needs 150 USD available) (the simulated bridge issues a login).
    const opened = await client.portal.post(`${API_NODE_BASE}/trading/accounts`, {
      headers: portalHeaders(),
      data: { environment: 'live' },
    });
    expect(
      opened.ok(),
      `opening a live account answered ${opened.status()}: ${await opened.text()}`,
    ).toBe(true);
    const accounts = (await (
      await client.portal.get(`${API_NODE_BASE}/trading/accounts`, { headers: portalHeaders() })
    ).json()) as
      { items?: { id: string; login: string | null }[] } | { id: string; login: string | null }[];
    const list = Array.isArray(accounts) ? accounts : (accounts.items ?? []);
    const account = list.find((a) => a.login);
    expect(account, 'the opened account has no MT5 login').toBeTruthy();
    const { id: accountId, login } = account as { id: string; login: string };

    // 2. The client moves wallet → account themselves.
    const own = await client.portal.post(`${API_NODE_BASE}/payments/transfers`, {
      headers: portalHeaders(key()),
      data: {
        tradingAccountId: accountId,
        direction: 'wallet_to_account',
        amount: AMOUNTS.clientToAccount,
        currency: 'USD',
      },
    });
    expect(own.ok(), `client transfer answered ${own.status()}`).toBe(true);

    // 3–4. The desk: new funds, from the wallet, and back from the account.
    for (const [amount, direction, source, reason] of [
      [AMOUNTS.deskNewFunds, 'deposit', 'system', 'E2E bonus funds'],
      [AMOUNTS.deskFromWallet, 'deposit', 'wallet', 'E2E move to account'],
      [AMOUNTS.deskFromAccount, 'withdraw', undefined, 'E2E move back to wallet'],
    ] as const) {
      const fund = await admin.post(
        `/admin/trading-accounts/${accountId}/fund`,
        { amount, direction, reason, ...(source ? { source } : {}) },
        key(),
      );
      expect(
        fund.ok(),
        `desk ${direction}/${source ?? '-'} answered ${fund.status()}: ${await fund.text()}`,
      ).toBe(true);
    }

    // 5. A bank deposit aimed straight at the account, approved by the desk.
    const filed = await client.portal.post(`${API_NODE_BASE}/payments/deposits/offline`, {
      headers: portalHeaders(key()),
      multipart: {
        amount: AMOUNTS.bankDeposit,
        currency: 'USD',
        method: 'bank_transfer',
        destinationTradingAccountId: accountId,
        file: { name: 'receipt.png', mimeType: 'image/png', buffer: TINY_PNG },
      },
    });
    expect(filed.ok(), `offline deposit answered ${filed.status()}: ${await filed.text()}`).toBe(
      true,
    );
    const filedBody = (await filed.json()) as { id?: string; transaction?: { id: string } };
    const depositId = filedBody.id ?? filedBody.transaction?.id;
    expect(depositId, `no id in ${JSON.stringify(filedBody)}`).toBeTruthy();
    const approved = await admin.patch(`/admin/deposits/${depositId}/approve`, undefined, key());
    expect(approved.ok(), `approving the deposit answered ${approved.status()}`).toBe(true);

    // ── What the record SAYS, from the server ───────────────────────────────────────────
    const read = await admin.get(`/admin/transfers?userId=${client.id}&range=all&limit=50`);
    expect(read.ok()).toBe(true);
    const transfers = ((await read.json()) as { items: Row[] }).items;
    // Each way in or out happened exactly once on this fresh client.
    const one = (origin: string): Row => {
      const rows = transfers.filter((r) => r.origin === origin);
      expect(rows, `transfers with origin ${origin}`).toHaveLength(1);
      return rows[0] as Row;
    };

    expect(
      transfers.every((r) => r.state === 'success'),
      JSON.stringify(transfers.map((r) => [r.origin, r.state])),
    ).toBe(true);
    // Client: wallet → this login, asked by nobody at the desk.
    const mine = one('client');
    expect(mine).toMatchObject({
      type: 'transfer_to_account',
      effect: 'internal',
      amount: '200.00000000',
    });
    expect(mine.from.kind).toBe('wallet');
    expect(mine.from.walletNumber).toBeTruthy();
    expect(mine.to).toMatchObject({ kind: 'trading_account', login });
    expect(mine.requestedBy).toBeNull();
    // Desk: new funds — its source is the desk's own credit, its reason and requester recorded.
    const newFunds = one('desk_credit');
    expect(newFunds).toMatchObject({ amount: '160.00000000', deskReason: 'E2E bonus funds' });
    expect(newFunds.source?.transactionId).toBeTruthy();
    expect(newFunds.requestedBy?.name).toBeTruthy();
    // Desk: from wallet, and from account (the reverse direction).
    expect(one('desk_wallet')).toMatchObject({
      type: 'transfer_to_account',
      amount: '150.00000000',
    });
    const back = one('desk_debit');
    expect(back).toMatchObject({ type: 'transfer_to_wallet', amount: '30.00000000' });
    expect(back.from).toMatchObject({ kind: 'trading_account', login });
    expect(back.to.kind).toBe('wallet');
    // Deposit to account: its source IS the deposit the client filed.
    const chained = one('deposit');
    expect(chained).toMatchObject({ amount: '150.00000000', source: { transactionId: depositId } });

    // The books: settled per type, and the net — the server's strings, exact.
    const summary = (await (
      await admin.get(`/admin/transactions/summary?userId=${client.id}&range=all`)
    ).json()) as {
      accounting: { currency: string; type: string; bucket: string; total: string }[];
      net: { currency: string; total: string }[];
    };
    const settled = (type: string) =>
      summary.accounting.find(
        (l) => l.type === type && l.bucket === 'settled' && l.currency === 'USD',
      )?.total;
    expect(settled('desk_credit')).toBe('660.00000000'); // 500 + 160 new funds
    expect(settled('deposit')).toBe('150.00000000'); // the bank deposit, the client's own money
    expect(settled('transfer_to_account')).toBe('660.00000000'); // 200 + 160 + 150 + 150
    expect(settled('transfer_to_wallet')).toBe('30.00000000');
    expect(summary.net.find((n) => n.currency === 'USD')?.total).toBe('810.00000000'); // in − out: 660 + 150

    // ── The screens ─────────────────────────────────────────────────────────────────────
    await page.goto(`/transfers?userId=${client.id}&range=all`);
    const table = page.getByRole('table');
    await expect(table.getByText(`MT5 ${login}`).first()).toBeVisible();
    for (const origin of ['Client', 'Desk: new funds', 'Desk: from wallet', 'Desk: from account']) {
      await expect(table.getByText(origin, { exact: false }).first()).toBeVisible();
    }
    // A deposit-funded transfer names the deposit itself, by the reference the client was given.
    await expect(table.getByText(/^From deposit OX-/).first()).toBeVisible();
    await expect(table.getByText(mine.from.walletNumber as string).first()).toBeVisible();

    // The record panel: everything about the desk's new funds.
    await page.goto(`/transfers?userId=${client.id}&range=all&open=${newFunds.id}`);
    const panel = page.getByRole('dialog');
    await expect(panel.getByText('Funded by')).toBeVisible();
    await expect(panel.getByText('Requested by')).toBeVisible();
    await expect(panel.getByText('E2E bonus funds', { exact: false })).toBeVisible();

    // Narrowed to the account, from the Trading accounts link.
    await page.goto(`/transfers?account=${login}&range=all`);
    await expect(page.getByRole('button', { name: 'Show every account' })).toBeVisible();
    await expect(page.getByRole('table').getByText(`MT5 ${login}`).first()).toBeVisible();

    // Financial: the desk's credit is a Desk credit, never a Deposit.
    await page.goto(`/financial?userId=${client.id}&range=all`);
    await expect(page.getByRole('table').getByText('Desk credit').first()).toBeVisible();
    await expect(page.getByText('$810.00').first()).toBeVisible(); // the net tile

    // The client profile's Transactions → Transfers names the login.
    await page.goto(`/clients/${client.id}`);
    await page.getByRole('tab', { name: /^transactions$/i }).click();
    await page.getByRole('tab', { name: /^transfers$/i }).click();
    await expect(page.getByText(`MT5 ${login}`).first()).toBeVisible();
  } finally {
    await client.dispose();
    await admin.dispose();
  }
});
