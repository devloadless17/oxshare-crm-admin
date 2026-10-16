import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { ClientDocument, TransactionRow } from '@/lib/api/admin';
import { ClientTransactionsTab } from './client-transactions-tab';
import { ClientDocumentsPanel } from './client-documents-panel';
import { ClientAccountsPanel } from './client-accounts-panel';

/**
 * The client profile's three new tabs (owner, 29 Sep 2026).
 *
 *  - TRANSACTIONS replaced History: Deposits / Withdrawals / Transfers, each the
 *    Financial list filtered to this client, with filters sent to the server
 *    and a Details view holding everything — the receipt and the reason.
 *  - DOCUMENTS: KYC versions and deposit receipts in one list, each with the
 *    status its source gave it; a receipt on a refused deposit is Rejected.
 *  - ACCOUNTS: this client's MT5 accounts only.
 */

const { getTransfers } = vi.hoisted(() => ({ getTransfers: vi.fn() }));
const { getTransactions, getCurrencies, getClientDocuments, getTradingAccounts } = vi.hoisted(
  () => ({
    getTransactions: vi.fn(),
    getCurrencies: vi.fn(),
    getClientDocuments: vi.fn(),
    getTradingAccounts: vi.fn(),
  }),
);

// The Accounts tab's "View transfers" navigates with the app router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/clients/1000245',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: { getTransactions, getTransfers, getCurrencies, getClientDocuments, getTradingAccounts },
  };
  return { api, default: api };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master',
      role: 'master_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  }),
}));

function movement(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-1',
    kind: 'payment',
    direction: 'deposit',
    state: 'rejected',
    amount: '150.00000000',
    currency: 'USD',
    methodName: 'OMT – Hamra',
    provider: 'manual_omt',
    providerRef: null,
    providerPaymentId: null,
    destination: null,
    rejectionReason: 'The receipt is for a different amount.',
    tradingAccountId: null,
    proofFilename: 'cccc3333.png',
    walletId: 'w-1',
    createdAt: '2026-09-28T10:00:00.000Z',
    settledAt: null,
    reviewedAt: '2026-09-28T12:00:00.000Z',
    needsAttention: false,
    attentionReason: null,
    user: { id: 1000245, portalId: 1000245, email: 'rana@example.test' },
    // The server's classification (16 Oct 2026).
    type: 'deposit',
    effect: 'in',
    from: {
      kind: 'method',
      methodLabel: 'OMT – Hamra',
      providerCode: 'manual',
      channelCode: 'omt',
    },
    to: { kind: 'wallet', walletNumber: 'abcd1234wxyz', walletKind: 'main', currency: 'USD' },
    onward: null,
    origin: null,
    source: null,
    requestedBy: null,
    approvedBy: null,
    decidedBy: null,
    deskReason: null,
    deskReasonAr: null,
    ...over,
  } as TransactionRow;
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, limit: 25 });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrencies.mockResolvedValue([]);
  getTransactions.mockResolvedValue({ ...page([movement()]), counts: {}, directionCounts: {} });
  getTransfers.mockResolvedValue({ ...page([]), counts: {}, directionCounts: {} });
});

describe('the Transactions tab', () => {
  it('asks for THIS client’s deposits first, then each sub-tab’s own accounting types', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    await screen.findByText('$150.00');
    expect(getTransactions.mock.calls[0]?.[0]).toMatchObject({
      userId: 1000245,
      type: 'deposit,desk_credit',
    });

    await user.click(screen.getByRole('tab', { name: /withdrawals/i }));
    await waitFor(() =>
      expect(getTransactions.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'withdrawal,desk_debit',
      }),
    );

    // Transfers read their own endpoint — wallet ⇄ account AND commission moves.
    await user.click(screen.getByRole('tab', { name: /transfers/i }));
    await waitFor(() =>
      expect(getTransfers.mock.calls.at(-1)?.[0]).toMatchObject({ userId: 1000245 }),
    );
  });

  it('sends the status filter to the server, on page one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    await screen.findByText('$150.00');
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: /rejected/i }));
    await waitFor(() =>
      expect(getTransactions.mock.calls.at(-1)?.[0]).toMatchObject({ state: 'rejected', page: 1 }),
    );
  });

  it('opens Details with the receipt, the reason and when it was decided', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    await user.click(await screen.findByRole('button', { name: /details of \$150\.00/i }));
    const dialog = await screen.findByRole('dialog');
    // The method is the deposit's FROM end (16 Oct 2026), with its channel beside it.
    expect(within(dialog).getByText(/OMT – Hamra/)).toBeInTheDocument();
    expect(within(dialog).getByText('The receipt is for a different amount.')).toBeInTheDocument();
    expect(within(dialog).getByText(/why it was rejected/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /receipt/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/decided/i)).toBeInTheDocument();
  });

  it('names a transfer by both ends, never "deposit" or "withdrawal"', async () => {
    getTransfers.mockResolvedValue({
      ...page([
        movement({
          kind: 'transfer',
          direction: 'withdrawal',
          provider: 'transfer',
          proofFilename: null,
          type: 'transfer_to_account',
          effect: 'internal',
          from: {
            kind: 'wallet',
            walletNumber: 'abcd1234wxyz',
            walletKind: 'main',
            currency: 'USD',
          },
          to: { kind: 'trading_account', login: '5000777', environment: 'live' },
          origin: 'client',
        }),
      ]),
      counts: {},
      directionCounts: {},
    });
    const user = userEvent.setup();
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    await user.click(await screen.findByRole('tab', { name: /transfers/i }));
    expect(await screen.findByText('MT5 5000777')).toBeInTheDocument();
    expect(screen.getByText('To trading account')).toBeInTheDocument();
  });
});

function doc(over: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'd-1',
    category: 'deposit_receipt',
    title: 'Deposit receipt',
    detail: '150 USD via OMT – Hamra',
    status: 'rejected',
    current: true,
    files: [{ label: 'Receipt', path: 'uploads/deposit-proofs/cccc3333.png' }],
    reason: 'The receipt is for a different amount.',
    transactionId: 'tx-1',
    uploadedAt: '2026-09-28T10:00:00.000Z',
    ...over,
  };
}

describe('the Documents tab', () => {
  it('shows each document’s status — a refused deposit’s receipt is Rejected, with why', async () => {
    getClientDocuments.mockResolvedValue({
      items: [
        doc(),
        doc({
          id: 'v-1',
          category: 'identity',
          title: 'Identity document',
          detail: 'Passport',
          status: 'approved',
          reason: null,
          transactionId: null,
          files: [
            { label: 'First page', path: 'uploads/kyc/a.png' },
            { label: 'Second page', path: 'uploads/kyc/b.png' },
          ],
        }),
        doc({
          id: 'v-0',
          detail: 'Identity card',
          category: 'identity',
          title: 'Identity document',
          status: 'rejected',
          current: false,
          reason: null,
        }),
      ],
      hidden: [],
    });
    renderWithProviders(<ClientDocumentsPanel userId={1000245} />);

    const receipt = (await screen.findByText('150 USD via OMT – Hamra')).closest(
      'tr',
    ) as HTMLElement;
    expect(within(receipt).getByText('Rejected')).toBeInTheDocument();
    expect(within(receipt).getByText('The receipt is for a different amount.')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View Identity document — Passport' }),
    ).toHaveTextContent('View (2 pages)');
    expect(screen.getByText('Replaced')).toBeInTheDocument();
  });

  it('filters by type and status over the whole list', async () => {
    getClientDocuments.mockResolvedValue({
      items: [
        doc(),
        doc({
          id: 'v-1',
          category: 'selfie',
          title: 'Selfie',
          status: 'approved',
          detail: null,
          reason: null,
        }),
      ],
      hidden: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<ClientDocumentsPanel userId={1000245} />);
    await screen.findByText('150 USD via OMT – Hamra');
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + two documents
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Deposit receipt' }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText('150 USD via OMT – Hamra')).toBeInTheDocument();
  });

  it('says which half is hidden, never an empty list that means "none"', async () => {
    getClientDocuments.mockResolvedValue({
      items: [doc()],
      hidden: ['identity', 'address', 'selfie', 'kyc_other'],
    });
    renderWithProviders(<ClientDocumentsPanel userId={1000245} />);
    expect(
      await screen.findByText('KYC documents are hidden by your permissions.'),
    ).toBeInTheDocument();
  });
});

describe('the Accounts tab', () => {
  it('lists this client’s accounts only, without a Client column', async () => {
    getTradingAccounts.mockResolvedValue({
      items: [
        {
          id: 'acc-1',
          login: '5000123',
          environment: 'live',
          currency: 'USD',
          balance: '100.00000000',
          status: 'active',
          leverage: 100,
          createdAt: '2026-09-20T00:00:00.000Z',
          user: { id: 1000245, portalId: 1000245, firstName: 'Rana', lastName: 'Docs' },
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
      nextCursor: null,
    });
    renderWithProviders(
      <ClientAccountsPanel
        userId={1000245}
        clientName="Rana Docs"
        client={{ id: 1000245, portalId: 1000245, firstName: 'Rana', lastName: 'Docs' }}
      />,
    );
    expect(await screen.findByText('5000123')).toBeInTheDocument();
    expect(getTradingAccounts.mock.calls[0]?.[0]).toMatchObject({ userId: 1000245 });
    expect(screen.queryByRole('columnheader', { name: /^client/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open account/i })).toBeInTheDocument();
  });
});
