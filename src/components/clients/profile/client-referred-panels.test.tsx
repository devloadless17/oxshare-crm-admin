import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import { ReferredAccountsPanel, ReferredClientsPanel } from './client-referred-panels';

/**
 * A partner's book on their profile (owner, 26 Sep 2026): the clients they
 * introduced and those clients' trading accounts, each with the actions an
 * operator takes from the matching desk — and nothing that re-prices a partner.
 */
const { getClients, getTradingAccounts, setClientStatus } = vi.hoisted(() => ({
  getClients: vi.fn(),
  getTradingAccounts: vi.fn(),
  setClientStatus: vi.fn(),
}));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getClients, getTradingAccounts, setClientStatus } };
  return { api, default: api };
});

const session = vi.hoisted(() => ({ permissions: [] as readonly string[] }));
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'desk@oxshare.com',
      role: 'admin',
      permissions: session.permissions,
    },
  }),
}));

const client = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  portalId: 1000301,
  email: 'nadia@example.com',
  firstName: 'Nadia',
  lastName: 'Saab',
  type: 'referral',
  status: 'active',
  kycStatus: 'approved',
  emailVerified: true,
  country: 'Lebanon',
  tags: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const account = (over: Record<string, unknown> = {}) => ({
  id: 'ta-1',
  login: '6480824',
  environment: 'live',
  status: 'active',
  currency: 'USD',
  balance: '120.00000000',
  balanceSyncedAt: '2026-09-26T10:00:00.000Z',
  leverage: 100,
  createdAt: '2026-09-01T00:00:00.000Z',
  user: {
    id: 'u-1',
    portalId: 1000301,
    email: 'nadia@example.com',
    firstName: 'Nadia',
    lastName: 'Saab',
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.permissions = ALL_PERMISSIONS;
  getClients.mockResolvedValue({ items: [client()], total: 1, maskedFields: [] });
  getTradingAccounts.mockResolvedValue({ items: [account()], total: 1, maskedFields: [] });
});

describe('Referred clients', () => {
  it("asks for this partner's clients by Portal ID, and lists them", async () => {
    renderWithProviders(<ReferredClientsPanel partnerPortalId={1000142} />);

    expect(await screen.findByText('Nadia Saab')).toBeInTheDocument();
    expect(getClients).toHaveBeenCalledWith(
      expect.objectContaining({ referredBy: '1000142', page: 1, withTotal: true }),
      expect.anything(),
    );
  });

  it('offers the profile and suspension — never a commission-level change', async () => {
    const user = userEvent.setup();
    getClients.mockResolvedValue({
      items: [client({ type: 'partner' })],
      total: 1,
      maskedFields: [],
    });
    renderWithProviders(<ReferredClientsPanel partnerPortalId={1000142} />);

    await user.click(await screen.findByRole('button', { name: /actions for nadia saab/i }));

    expect(await screen.findByRole('menuitem', { name: /view profile/i })).toHaveAttribute(
      'href',
      '/clients/1000301',
    );
    expect(screen.getByRole('menuitem', { name: /suspend/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /commission level/i })).toBeNull();
  });

  it('searches on the server, back on page one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReferredClientsPanel partnerPortalId={1000142} />);
    await screen.findByText('Nadia Saab');

    await user.type(screen.getByRole('searchbox'), 'nadia');

    await vi.waitFor(() =>
      expect(getClients).toHaveBeenLastCalledWith(
        expect.objectContaining({ referredBy: '1000142', q: 'nadia', page: 1 }),
        expect.anything(),
      ),
    );
  });

  it('says so when the partner has introduced nobody', async () => {
    getClients.mockResolvedValue({ items: [], total: 0, maskedFields: [] });
    renderWithProviders(<ReferredClientsPanel partnerPortalId={1000142} />);

    expect(
      await screen.findByText('This partner has not introduced any clients yet.'),
    ).toBeInTheDocument();
  });
});

describe('Referred accounts', () => {
  it("asks for the accounts of this partner's clients, and shows whose each is", async () => {
    renderWithProviders(<ReferredAccountsPanel partnerPortalId={1000142} />);

    const row = (await screen.findByText('6480824')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Nadia Saab')).toBeInTheDocument();
    expect(getTradingAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ referredBy: '1000142', page: 1 }),
      expect.anything(),
    );
  });

  it("offers the owner's profile and moving money on a live, active account", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReferredAccountsPanel partnerPortalId={1000142} />);

    await user.click(await screen.findByRole('button', { name: /6480824/ }));

    expect(await screen.findByRole('menuitem', { name: /view client profile/i })).toHaveAttribute(
      'href',
      '/clients/1000301',
    );
    await user.click(screen.getByRole('menuitem', { name: /add or remove funds/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers no money action on a demo account, or to a reader who may not move money', async () => {
    const user = userEvent.setup();
    getTradingAccounts.mockResolvedValue({
      items: [account({ environment: 'demo' })],
      total: 1,
      maskedFields: [],
    });
    const { unmount } = renderWithProviders(<ReferredAccountsPanel partnerPortalId={1000142} />);

    await user.click(await screen.findByRole('button', { name: /6480824/ }));
    await screen.findByRole('menuitem', { name: /view client profile/i });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    await user.keyboard('{Escape}');
    unmount();

    session.permissions = ['trading.view', 'clients.view'];
    getTradingAccounts.mockResolvedValue({ items: [account()], total: 1, maskedFields: [] });
    renderWithProviders(<ReferredAccountsPanel partnerPortalId={1000142} />);

    await user.click(await screen.findByRole('button', { name: /6480824/ }));
    await screen.findByRole('menuitem', { name: /view client profile/i });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });
});
