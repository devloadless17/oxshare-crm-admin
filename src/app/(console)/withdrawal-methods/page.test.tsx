import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { WithdrawalMethod } from '@/lib/api/admin';
import WithdrawalMethodsPage from './page';

/**
 * Withdrawal methods — the payout rails the withdraw form offers, managed here.
 *
 * What these pin: a disabled method is SHOWN (switching it back on is the point
 * of the screen), the key cannot be edited once it exists, toggling sends only
 * the flag, and a read-only operator gets no controls.
 */
const {
  getWithdrawalMethods,
  createWithdrawalMethod,
  updateWithdrawalMethod,
  uploadPaymentMethodLogo,
} = vi.hoisted(() => ({
  getWithdrawalMethods: vi.fn(),
  createWithdrawalMethod: vi.fn(),
  updateWithdrawalMethod: vi.fn(),
  uploadPaymentMethodLogo: vi.fn(),
}));

// Both exports — see the note in leverages/page.test.tsx.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/withdrawal-methods',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getWithdrawalMethods,
      createWithdrawalMethod,
      updateWithdrawalMethod,
      uploadPaymentMethodLogo,
      getPaymentProviders: () => Promise.resolve([]),
    },
  };
  return { api, default: api };
});

const permissions = { current: ALL_PERMISSIONS };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

function method(over: Partial<WithdrawalMethod> = {}): WithdrawalMethod {
  return {
    key: 'whish',
    name: 'Whish Money',
    nameAr: null,
    logoUrl: null,
    enabled: true,
    sortOrder: 0,
    inUse: false,
    countryRule: null,
    countryCodes: [],
    // Rival's Whish payout route, paid by Rival (backend 0168).
    providerCode: 'rival',
    channelCode: 'whish',
    paidBy: 'provider',
    availability: 'offered',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
    // A row's internal name starts as its display name, as the API's does.
    internalLabel: over.internalLabel ?? over.name ?? 'Whish Money',
    // No method is built in since backend 0168.
    builtIn: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getWithdrawalMethods.mockResolvedValue([
    method(),
    method({
      key: 'bank',
      name: 'Bank transfer',
      enabled: false,
      availability: 'disabled',
      sortOrder: 1,
    }),
    // Enabled, but its network is switched off: hidden from every client.
    method({ key: 'usdt', name: 'USDT (ERC20)', availability: 'channel_off', sortOrder: 2 }),
  ]);
  createWithdrawalMethod.mockResolvedValue(method({ key: 'omt', name: 'OMT' }));
  updateWithdrawalMethod.mockResolvedValue(method());
});

describe('the withdrawal methods page', () => {
  it('lists every method, disabled ones included', async () => {
    renderWithProviders(<WithdrawalMethodsPage />);

    expect(await screen.findByText('Whish Money')).toBeInTheDocument();
    expect(screen.getByText('Bank transfer')).toBeInTheDocument();
    expect(screen.getByText('Switched off')).toBeInTheDocument();
    // Reported 30 Sep 2026: "Enabled" here while clients could not see it.
    expect(screen.getByText('Hidden: network switched off')).toBeInTheDocument();
  });

  it('opens settings on their own page — adding and editing alike', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodsPage />);
    await user.click(await screen.findByRole('button', { name: /add method/i }));
    expect(push).toHaveBeenCalledWith('/withdrawal-methods/new');
    await user.click(await screen.findByRole('button', { name: /actions for whish money/i }));
    expect(screen.queryByText('whish')).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
    expect(push).toHaveBeenCalledWith('/withdrawal-methods/whish');
  });

  it('switches a method on or off with a single flag', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodsPage />);

    await user.click(await screen.findByRole('button', { name: /actions for bank transfer/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^enable$/i }));

    await waitFor(() =>
      expect(updateWithdrawalMethod).toHaveBeenCalledWith('bank', { enabled: true }),
    );
  });

  it('offers no controls to an operator who may only read', async () => {
    permissions.current = ['payments.view'];
    renderWithProviders(<WithdrawalMethodsPage />);

    await screen.findByText('Whish Money');
    expect(screen.queryByRole('button', { name: /add method/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
  });
});
