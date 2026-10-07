import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { MoneyAction } from './client-money-dialog';
import { ClientMoneyDialog } from './client-money-dialog';
import { ClientTransactionsTab } from './client-transactions-tab';

/**
 * The Transactions tab's Deposit / Withdraw / Transfer (owner, 7 Oct 2026).
 * Every choice must reach the endpoint that moves money THAT way — the
 * system or the wallet — and nothing may be offered that its key forbids.
 */

const {
  getWallets,
  getTradingAccounts,
  creditWallet,
  debitWallet,
  fundTradingAccount,
  getTransactions,
  getCurrencies,
} = vi.hoisted(() => ({
  getWallets: vi.fn(),
  getTradingAccounts: vi.fn(),
  creditWallet: vi.fn(),
  debitWallet: vi.fn(),
  fundTradingAccount: vi.fn(),
  getTransactions: vi.fn(),
  getCurrencies: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getWallets,
      getTradingAccounts,
      creditWallet,
      debitWallet,
      fundTradingAccount,
      getTransactions,
      getCurrencies,
    },
  };
  return { api, default: api };
});

const permissions = { current: ALL_PERMISSIONS as readonly string[] };
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      status: 'active',
      seesAllClients: true,
      permissions: permissions.current,
    },
  }),
}));

const WALLET = {
  id: 'w-1',
  walletNumber: '4f7kq2nm8xcb',
  balance: '100.00000000',
  onHold: '30.00000000',
  currency: 'USD',
  kind: 'main',
};
const ACCOUNT = {
  id: 'ta-1',
  login: '5090001',
  environment: 'live',
  currency: 'USD',
  balance: '500.00000000',
  status: 'active',
  product: 'Standard',
};

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getWallets.mockResolvedValue({ items: [WALLET], total: 1, page: 1, limit: 100 });
  getTradingAccounts.mockResolvedValue({ items: [ACCOUNT], total: 1, page: 1, limit: 100 });
  creditWallet.mockResolvedValue({ transaction: {}, replayed: false });
  debitWallet.mockResolvedValue({ transaction: {}, replayed: false });
  fundTradingAccount.mockResolvedValue({
    transaction: null,
    replayed: false,
    transfer: {},
    transferError: null,
  });
  getTransactions.mockResolvedValue({ items: [], total: 0 });
  getCurrencies.mockResolvedValue([]);
});

function open(action: MoneyAction) {
  const onClose = vi.fn();
  renderWithProviders(<ClientMoneyDialog action={action} userId={1000245} onClose={onClose} />);
  return { user: userEvent.setup(), onClose };
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(screen.getByRole('textbox', { name: /^amount$/i }), amount);
  await user.type(screen.getByPlaceholderText(/why this money is moving/i), 'Desk adjustment');
}

describe('Deposit', () => {
  it('into the wallet is new money from the system — a credit', async () => {
    const { user, onClose } = open('deposit');
    await screen.findByRole('option', { name: /USD · 4f7kq2nm8xcb/ });
    await fill(user, '25');
    await user.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() =>
      expect(creditWallet).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1000245, amount: '25', currency: 'USD' }),
        expect.stringMatching(/^deposit:wallet:w-1:/),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('into a trading account from the SYSTEM mints it', async () => {
    const { user } = open('deposit');
    await user.click(await screen.findByRole('radio', { name: /trading account/i }));
    await user.click(screen.getByRole('radio', { name: /the system/i }));
    await fill(user, '40');
    await user.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() =>
      expect(fundTradingAccount).toHaveBeenCalledWith(
        'ta-1',
        expect.objectContaining({ amount: '40', direction: 'deposit', source: 'system' }),
        expect.any(String),
      ),
    );
  });

  it('into a trading account from the WALLET moves what they hold, never past it', async () => {
    const { user } = open('deposit');
    await user.click(await screen.findByRole('radio', { name: /trading account/i }));
    await user.click(screen.getByRole('radio', { name: /the client’s wallet/i }));
    // 100 held less 30 on hold: 70 available.
    expect(await screen.findByText(/has \$70\.00 available/i)).toBeInTheDocument();

    await fill(user, '80');
    expect(screen.getByRole('alert')).toHaveTextContent(/more than the wallet has available/i);
    expect(screen.getByRole('button', { name: /^deposit$/i })).toBeDisabled();

    const amount = screen.getByRole('textbox', { name: /^amount$/i });
    await user.clear(amount);
    await user.type(amount, '70');
    await user.click(screen.getByRole('button', { name: /^deposit$/i }));
    await waitFor(() =>
      expect(fundTradingAccount).toHaveBeenCalledWith(
        'ta-1',
        expect.objectContaining({ direction: 'deposit', source: 'wallet' }),
        expect.any(String),
      ),
    );
  });

  it('offers only the wallet deposit to an admin who may not fund accounts', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'trading.deposit');
    open('deposit');
    await screen.findByRole('option', { name: /USD · 4f7kq2nm8xcb/ });
    expect(screen.queryByRole('radio', { name: /trading account/i })).toBeNull();
  });
});

describe('Withdraw', () => {
  it('from the wallet takes money off the platform — a debit', async () => {
    const { user } = open('withdraw');
    await screen.findByRole('option', { name: /USD · 4f7kq2nm8xcb/ });
    await fill(user, '50');
    await user.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await waitFor(() =>
      expect(debitWallet).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '50', currency: 'USD' }),
        expect.stringMatching(/^withdraw:wallet:w-1:/),
      ),
    );
  });

  it('from the wallet is refused in the form past the available balance', async () => {
    const { user } = open('withdraw');
    await screen.findByRole('option', { name: /USD · 4f7kq2nm8xcb/ });
    await fill(user, '70.01');
    expect(screen.getByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    expect(debitWallet).not.toHaveBeenCalled();
  });

  it('from a trading account OUT of the platform sends source=system', async () => {
    const { user } = open('withdraw');
    await user.click(await screen.findByRole('radio', { name: /trading account/i }));
    await user.click(screen.getByRole('radio', { name: /out of the platform/i }));
    await fill(user, '120');
    await user.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await waitFor(() =>
      expect(fundTradingAccount).toHaveBeenCalledWith(
        'ta-1',
        expect.objectContaining({ direction: 'withdraw', source: 'system' }),
        expect.any(String),
      ),
    );
  });

  it('hides the wallet withdrawal from an admin without wallets.debit', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'wallets.debit');
    open('withdraw');
    // Only the account remains, so it is the one choice — and only to the wallet.
    expect(await screen.findByRole('radio', { name: /trading account/i })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /^wallet$/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /out of the platform/i })).toBeNull();
  });
});

describe('Transfer', () => {
  it('account → wallet moves money back, from the wallet’s side', async () => {
    const { user } = open('transfer');
    await user.click(await screen.findByRole('radio', { name: /trading account → wallet/i }));
    await fill(user, '15');
    await user.click(screen.getByRole('button', { name: /^transfer$/i }));
    await waitFor(() =>
      expect(fundTradingAccount).toHaveBeenCalledWith(
        'ta-1',
        expect.objectContaining({ direction: 'withdraw', source: 'wallet' }),
        expect.any(String),
      ),
    );
  });

  it('says so, without closing as a failure, when only half of it happened', async () => {
    fundTradingAccount.mockResolvedValue({
      transaction: null,
      replayed: false,
      transfer: { state: 'pending' },
      transferError: 'The money has not reached the wallet yet.',
    });
    const { user, onClose } = open('withdraw');
    await user.click(await screen.findByRole('radio', { name: /trading account/i }));
    await user.click(screen.getByRole('radio', { name: /out of the platform/i }));
    await fill(user, '10');
    await user.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText(/only part of the movement happened/i)).toBeInTheDocument();
  });
});

describe('the Transactions tab buttons', () => {
  it('shows Deposit, Withdraw and Transfer to an admin holding every key', async () => {
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    expect(await screen.findByRole('button', { name: /^deposit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^withdraw$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^transfer$/i })).toBeInTheDocument();
  });

  it('shows none to an admin who may move no money', async () => {
    permissions.current = ['clients.view', 'transactions.view'];
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    await screen.findByRole('tab', { name: /deposits/i });
    expect(screen.queryByRole('button', { name: /^deposit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^withdraw$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^transfer$/i })).toBeNull();
  });

  it('opens the deposit dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientTransactionsTab userId={1000245} />);
    await user.click(await screen.findByRole('button', { name: /^deposit$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/deposit for this client/i)).toBeInTheDocument();
  });
});
