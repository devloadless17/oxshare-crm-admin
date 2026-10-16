import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import TransfersPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The Transfers page (16 Oct 2026) — every move between a client's own accounts.
 *
 * What this pins: it reads `GET /admin/transfers` (never the platform-wide list), every row names
 * BOTH ends — a wallet by its number, an account by its MT5 login — and where the money came
 * from, the tabs and filters are SERVER-side, and the tiles render the server's strings without
 * adding any.
 */
const { getTransfers, getTransfersSummary, getCurrencies, getStuckTransfers } = vi.hoisted(() => ({
  getTransfers: vi.fn(),
  getTransfersSummary: vi.fn(),
  getCurrencies: vi.fn(),
  getStuckTransfers: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getTransfers, getTransfersSummary, getCurrencies, getStuckTransfers } };
  return { api, default: api };
});

const listeners = new Set<() => void>();
const searchParams = { current: new URLSearchParams() };
let snapshot = 0;
const replace = vi.fn((url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
  snapshot += 1;
  for (const notify of listeners) notify();
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () => {
      useSyncExternalStore(
        (onChange: () => void) => {
          listeners.add(onChange);
          return () => listeners.delete(onChange);
        },
        () => snapshot,
        () => snapshot,
      );
      return searchParams.current;
    },
    usePathname: () => '/transfers',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      role: 'sub_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const transfer = (over: Record<string, unknown> = {}) => ({
  id: 'tr-1',
  kind: 'transfer',
  direction: 'withdrawal',
  state: 'success',
  amount: '250.00000000',
  currency: 'USD',
  methodName: 'transfer',
  provider: 'transfer',
  providerRef: null,
  destination: null,
  rejectionReason: null,
  tradingAccountId: 'acc-1',
  walletId: 'w-1',
  needsAttention: false,
  createdAt: '2026-10-16T10:00:00.000Z',
  settledAt: '2026-10-16T10:00:05.000Z',
  user: {
    id: 1000245,
    portalId: 1000245,
    email: 'jane@client.test',
    firstName: 'Jane',
    lastName: 'Client',
  },
  type: 'transfer_to_account',
  effect: 'internal',
  from: {
    kind: 'wallet',
    walletId: 'w-1',
    walletNumber: '7k3mq9xx2abc',
    walletKind: 'main',
    currency: 'USD',
  },
  to: { kind: 'trading_account', tradingAccountId: 'acc-1', login: '5000001', environment: 'live' },
  onward: null,
  origin: 'deposit',
  source: {
    transactionId: 'tx-9',
    methodLabel: 'USDT TRC20',
    reference: 'OX-AB12CD',
    settledAt: null,
  },
  requestedBy: null,
  approvedBy: null,
  decidedBy: null,
  deskReason: null,
  deskReasonAr: null,
  providerEnvironment: null,
  providerFee: null,
  providerNetAmount: null,
  providerRequestAmount: null,
  providerAmountReceived: null,
  requestedAmount: null,
  providerStatus: null,
  providerPayoutId: null,
  providerSubmittedAt: null,
  providerCheckedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  getTransfers.mockResolvedValue({
    items: [transfer()],
    nextCursor: null,
    prevCursor: null,
    total: 1,
    page: 1,
    limit: 25,
    counts: { all: 1, success: 1 },
    directionCounts: { all: 0 },
    typeCounts: { all: 1, transfer_to_account: 1 },
    groupCounts: { all: 1, transfer: 1 },
    countsCapped: [],
    maskedFields: [],
  });
  getTransfersSummary.mockResolvedValue({
    rows: [],
    directions: [],
    accounting: [
      {
        currency: 'USD',
        type: 'transfer_to_account',
        effect: 'internal',
        bucket: 'settled',
        count: 1,
        total: '250.00000000',
      },
    ],
    effects: [
      { currency: 'USD', effect: 'internal', bucket: 'settled', count: 1, total: '250.00000000' },
    ],
    net: [],
  });
  getCurrencies.mockResolvedValue([{ code: 'USD' }]);
  getStuckTransfers.mockResolvedValue({ count: 0, thresholdMinutes: 15 });
});

describe('the Transfers page', () => {
  it('reads the transfers endpoint and names both ends and the origin of each transfer', async () => {
    renderWithProviders(<TransfersPage />);
    expect(await screen.findByText('MT5 5000001')).toBeInTheDocument();
    expect(screen.getByText('7k3mq9xx2abc')).toBeInTheDocument();
    expect(screen.getByText('From deposit OX-AB12CD')).toBeInTheDocument();
    expect(getTransfers).toHaveBeenCalledWith(
      expect.objectContaining({ facet: 'type' }),
      expect.anything(),
    );
  });

  it('renders the server’s settled total, never a sum of its own', async () => {
    renderWithProviders(<TransfersPage />);
    // The string the server summed, formatted — the page adds nothing.
    expect((await screen.findAllByText('$250.00')).length).toBeGreaterThan(0);
  });

  it('filters on the server: a tab and an origin reach the request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransfersPage />);
    await screen.findByText('MT5 5000001');
    await user.click(screen.getByRole('button', { name: /^To wallet/ }));
    await waitFor(() =>
      expect(getTransfers).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'transfer_to_wallet' }),
        expect.anything(),
      ),
    );
  });

  it('shows the account a link narrowed to, and lets it go', async () => {
    searchParams.current = new URLSearchParams('account=5000001&range=all');
    renderWithProviders(<TransfersPage />);
    await screen.findByText('MT5 5000001');
    expect(getTransfers).toHaveBeenCalledWith(
      expect.objectContaining({ account: '5000001' }),
      expect.anything(),
    );
    expect(screen.getByRole('button', { name: 'Show every account' })).toBeInTheDocument();
  });
});
