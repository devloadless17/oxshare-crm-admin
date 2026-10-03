import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { WalletRow } from '@/lib/api/admin';
import { ClientWalletsPanel } from './client-wallets-panel';

/**
 * The profile's wallet card credits through the same endpoint as the wallets
 * list, and carried the same balance-derived idempotency key: a second
 * deliberate credit at an unchanged balance reused the first's key and the
 * server replayed it, moving no money. The key is now minted per dialog.
 */

const { getWallets, getCurrencies, creditWallet } = vi.hoisted(() => ({
  getWallets: vi.fn(),
  getCurrencies: vi.fn(),
  creditWallet: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getWallets, getCurrencies, creditWallet } };
  return { api, default: api };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      status: 'active',
      seesUntriaged: true,
      seesAllClients: true,
      permissions: ALL_PERMISSIONS,
    },
  }),
}));

const wallet = {
  id: 'w-1',
  walletNumber: '4f7kq2nm8xcb',
  name: 'USD Wallet',
  balance: '0.00000000',
  onHold: '0.00000000',
  currency: 'USD',
  kind: 'main',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  user: {
    id: 1000245,
    portalId: 1000245,
    email: 'client@example.com',
    firstName: 'Dana',
    lastName: 'Haddad',
  },
} as unknown as WalletRow;

beforeEach(() => {
  vi.clearAllMocks();
  getWallets.mockResolvedValue({
    items: [wallet],
    nextCursor: null,
    total: 1,
    page: 1,
    limit: 100,
  });
  getCurrencies.mockResolvedValue([]);
  creditWallet.mockResolvedValue({ transaction: {}, replayed: false });
});

describe('ClientWalletsPanel — credit idempotency', () => {
  it('gives each opened credit dialog its own key, even at the same balance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientWalletsPanel userId={1000245} />);
    await screen.findByText('4f7kq2nm8xcb');

    for (const n of [1, 2]) {
      await user.click(screen.getByRole('button', { name: /actions for/i }));
      await user.click(await screen.findByRole('menuitem', { name: /add funds/i }));
      await user.type(await screen.findByLabelText(/amount to add/i), '50');
      await user.type(screen.getByLabelText(/^reason(?! in arabic)/i), 'Goodwill credit');
      await user.click(screen.getByRole('button', { name: /^add funds$/i }));
      await waitFor(() => expect(creditWallet).toHaveBeenCalledTimes(n));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }

    const [first, second] = creditWallet.mock.calls.map((c) => c[1] as string);
    expect(second).not.toBe(first);
  });
});
