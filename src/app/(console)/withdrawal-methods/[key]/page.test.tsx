import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { WithdrawalMethod } from '@/lib/api/admin';
import WithdrawalMethodPage from './page';

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
const route = vi.hoisted(() => ({ key: 'new' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ key: route.key }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/withdrawal-methods/${route.key}`,
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

describe('a withdrawal method’s settings page', () => {
  it('adds a method named once: the internal name follows the display name', async () => {
    route.key = 'new';
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodPage />);

    await user.type(await screen.findByPlaceholderText('Bank transfer'), 'OMT');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(createWithdrawalMethod).toHaveBeenCalledWith(
        expect.objectContaining({ internalLabel: 'OMT', name: 'OMT', enabled: true }),
      ),
    );
    // No key (the API generates the permanent ID) and no order (it goes last).
    expect(createWithdrawalMethod.mock.calls[0]?.[0]).not.toHaveProperty('key');
    expect(createWithdrawalMethod.mock.calls[0]?.[0]).not.toHaveProperty('sortOrder');
  });

  it('adds a disabled method through the labelled enabled checkbox', async () => {
    route.key = 'new';
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodPage />);

    await user.type(await screen.findByLabelText(/^name$/i), 'OMT');
    await user.clear(screen.getByLabelText(/internal name/i));
    await user.type(screen.getByLabelText(/internal name/i), 'OMT payouts');
    const enabled = screen.getByRole('checkbox', { name: /offer it to clients/i });
    expect(enabled.tagName).toBe('BUTTON');
    expect(enabled).toBeChecked();
    await user.click(enabled);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(createWithdrawalMethod).toHaveBeenCalledWith(
        expect.objectContaining({ internalLabel: 'OMT payouts', name: 'OMT', enabled: false }),
      ),
    );
  });

  it('never shows a method’s key on its settings page', async () => {
    route.key = 'whish';
    renderWithProviders(<WithdrawalMethodPage />);

    expect(await screen.findByLabelText(/internal name/i)).toHaveValue('Whish Money');
    expect(screen.queryByDisplayValue('whish')).toBeNull();
  });
});

describe('a withdrawal method’s Arabic name', () => {
  it('SENDS the Arabic name typed, trimmed', async () => {
    route.key = 'new';
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodPage />);

    await user.type(await screen.findByLabelText(/^name$/i), 'OMT');
    const nameAr = screen.getByLabelText('Name (Arabic)');
    expect(nameAr).toHaveAttribute('dir', 'rtl');
    expect(nameAr).toHaveAttribute('lang', 'ar');
    expect(nameAr).toHaveAttribute('maxLength', '80');
    expect(nameAr).not.toBeRequired();
    await user.type(nameAr, ' أو إم تي ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(createWithdrawalMethod).toHaveBeenCalled());
    expect(createWithdrawalMethod.mock.calls[0]?.[0]).toMatchObject({
      name: 'OMT',
      nameAr: 'أو إم تي',
    });
  });

  it('prefills the stored Arabic, and sends null once it is cleared', async () => {
    route.key = 'whish';
    getWithdrawalMethods.mockResolvedValue([method({ nameAr: 'ويش موني' })]);
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodPage />);

    const nameAr = await screen.findByLabelText('Name (Arabic)');
    expect(nameAr).toHaveValue('ويش موني');
    await user.clear(nameAr);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateWithdrawalMethod).toHaveBeenCalled());
    expect(updateWithdrawalMethod.mock.calls[0]?.[1]).toMatchObject({ nameAr: null });
  });
});
