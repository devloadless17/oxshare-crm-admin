import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Mt5AccountLookup } from '@/lib/api/admin';
import { LinkAccountDialog } from './link-account-dialog';

/**
 * LINK AN EXISTING MT5 ACCOUNT (owner, 29 Sep 2026): client → login → both side
 * by side → product → link. From a profile the client is filled in; from the
 * accounts desk it is searched. The server repeats every check; these pin that
 * the screen shows them BEFORE the click.
 */

const { lookupMt5Account, linkMt5Account, getClients } = vi.hoisted(() => ({
  lookupMt5Account: vi.fn(),
  linkMt5Account: vi.fn(),
  getClients: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { lookupMt5Account, linkMt5Account, getClients } };
  return { api, default: api };
});

const CLIENT = {
  id: 1000245,
  portalId: 1000245,
  firstName: 'Rana',
  lastName: 'Haddad',
  email: 'rana@example.test',
  country: 'Lebanon',
};

function found(over: Partial<Mt5AccountLookup> = {}): Mt5AccountLookup {
  return {
    login: '5000123',
    group: 'real\\Standard',
    currency: 'USD',
    leverage: 200,
    balance: '1250.00000000',
    equity: '1250.00000000',
    credit: '0.00000000',
    holderName: 'Rana Haddad',
    holderEmail: 'rana@old.test',
    environment: 'live',
    currencyKnown: true,
    products: [
      { id: 'p-std', name: 'Standard' },
      { id: 'p-pro', name: 'Pro' },
    ],
    owner: null,
    waitingDeals: 3,
    ...over,
  };
}

async function lookUp(user: ReturnType<typeof userEvent.setup>, login = '5000123') {
  await user.type(screen.getByLabelText('MT5 login'), login);
  await user.click(screen.getByRole('button', { name: /^find$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupMt5Account.mockResolvedValue(found());
  linkMt5Account.mockResolvedValue({
    id: 'a-1',
    login: '5000123',
    group: 'real\\Standard',
    productId: 'p-pro',
    environment: 'live',
    currency: 'USD',
    balance: '1250.00000000',
    waitingDeals: 3,
  });
});

describe('from a client’s profile — the client is filled in', () => {
  it('asks only for the login, then shows the client and the MT5 account side by side', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} client={CLIENT} />);
    expect(screen.queryByLabelText(/search clients/i)).toBeNull();
    await lookUp(user);

    expect(lookupMt5Account).toHaveBeenCalledWith('5000123');
    expect(await screen.findByText('MT5 account 5000123')).toBeInTheDocument();
    expect(screen.getByText('rana@old.test')).toBeInTheDocument();
    expect(screen.getByText('$1,250.00')).toBeInTheDocument();
    expect(screen.getByText(/3 of its trades are waiting/i)).toBeInTheDocument();
  });

  it('will not link until a product is chosen when several sell the group', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} client={CLIENT} />);
    await lookUp(user);
    const link = await screen.findByRole('button', { name: /^link account$/i });
    expect(link).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Product' }));
    await user.click(await screen.findByRole('option', { name: 'Pro' }));
    expect(link).toBeEnabled();
    await user.click(link);

    await waitFor(() =>
      expect(linkMt5Account).toHaveBeenCalledWith({
        userId: 1000245,
        login: '5000123',
        productId: 'p-pro',
      }),
    );
    expect(await screen.findByText(/3 waiting trades will earn commission/i)).toBeInTheDocument();
  });

  it('chooses the product itself when only one sells the group', async () => {
    lookupMt5Account.mockResolvedValue(found({ products: [{ id: 'p-ecn', name: 'ECN' }] }));
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} client={CLIENT} />);
    await lookUp(user);
    await user.click(await screen.findByRole('button', { name: /^link account$/i }));
    await waitFor(() =>
      expect(linkMt5Account).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p-ecn' })),
    );
  });

  it('refuses a login another client already owns, naming them', async () => {
    lookupMt5Account.mockResolvedValue(
      found({ owner: { portalId: 1000999, name: 'Omar Khalil', outsideTerritory: false } }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} client={CLIENT} />);
    await lookUp(user);
    expect(await screen.findByText(/already linked to Omar Khalil/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^link account$/i })).toBeDisabled();
  });

  it('flags names that do not look alike — a prompt to look twice, not a refusal', async () => {
    lookupMt5Account.mockResolvedValue(found({ holderName: 'Someone Else' }));
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} client={CLIENT} />);
    await lookUp(user);
    expect(await screen.findByText(/names do not look alike/i)).toBeInTheDocument();
  });

  it('says so when MT5 has no such login', async () => {
    lookupMt5Account.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: 'MT5 has no account with login 5999999.' } },
    });
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} client={CLIENT} />);
    await lookUp(user, '5999999');
    expect(await screen.findByText('MT5 has no account with login 5999999.')).toBeInTheDocument();
  });
});

describe('from the accounts desk — the client is searched', () => {
  it('searches clients, and links the one picked', async () => {
    getClients.mockResolvedValue({
      items: [
        {
          id: 1000245,
          portalId: 1000245,
          firstName: 'Rana',
          lastName: 'Haddad',
          email: 'rana@example.test',
          type: 'individual',
          status: 'active',
          emailVerified: true,
          kycStatus: 'approved',
          verificationLevel: 1,
          tags: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 8,
      maskedFields: [],
    });
    lookupMt5Account.mockResolvedValue(found({ products: [{ id: 'p-ecn', name: 'ECN' }] }));
    const user = userEvent.setup();
    renderWithProviders(<LinkAccountDialog open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/search clients/i), 'rana');
    await user.click(await screen.findByRole('button', { name: /rana haddad/i }));
    await lookUp(user);
    await user.click(await screen.findByRole('button', { name: /^link account$/i }));

    await waitFor(() =>
      expect(linkMt5Account).toHaveBeenCalledWith(expect.objectContaining({ userId: 1000245 })),
    );
  });
});
