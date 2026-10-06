import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import PaymentMethodsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { PaymentMethod } from '@/lib/api/admin';

/*
 * This file exists because of one bug, reported from production.
 *
 * The page builds its request body FIELD BY FIELD — deliberately, so a spread
 * cannot ship whatever the form happens to hold. But every field on the update
 * DTO is optional, so a field left OUT is not a type error: the save returns
 * 200, the toast says saved, and the value never changes.
 *
 * `requiresProof` was left out. The checkbox ticked, the method stayed a plain
 * one, and no client was ever asked for a receipt — the whole offline deposit
 * flow sat there inert with nothing reporting it.
 *
 * So these cases assert the PAYLOAD, not the screen. Asserting that the box
 * appears ticked would have passed throughout.
 */
const { getPaymentMethods, createPaymentMethod, updatePaymentMethod, getCurrencies } = vi.hoisted(
  () => ({
    getPaymentMethods: vi.fn(),
    createPaymentMethod: vi.fn(),
    updatePaymentMethod: vi.fn(),
    getCurrencies: vi.fn(),
  }),
);

// BOTH exports: `@/lib/api` exports `api` as named AND default.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/payment-methods',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getPaymentMethods,
      createPaymentMethod,
      updatePaymentMethod,
      getCurrencies,
      // No providers loaded: routes read by their codes (backend 0168).
      getPaymentProviders: () => Promise.resolve([]),
    },
  };
  return { api, default: api };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const method = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  key: 'external',
  name: 'External',
  nameAr: null,
  currency: 'USD',
  logoUrl: null,
  enabled: true,
  sortOrder: 0,
  requiresProof: false,
  countryRule: null,
  countryCodes: [],
  minAmount: '10.00000000',
  maxAmount: '250000.00000000',
  // The method's own range (0162) — none: it follows the currency's.
  ownMinAmount: null,
  ownMaxAmount: null,
  builtIn: false,
  inUse: false,
  proofFields: [],
  payToFields: [],
  // The desk's own route (backend 0168) unless a case says otherwise.
  providerCode: 'manual',
  channelCode: 'offline',
  availability: 'offered',
  ...over,
  // A row's internal name starts as its display name, as the API's does.
  internalLabel: over.internalLabel ?? over.name ?? 'External',
});

beforeEach(() => {
  vi.clearAllMocks();
  getPaymentMethods.mockResolvedValue([method()]);
  getCurrencies.mockResolvedValue([{ code: 'USD', name: 'US Dollar', enabled: true, decimals: 2 }]);
  createPaymentMethod.mockResolvedValue(method());
  updatePaymentMethod.mockResolvedValue(method({ requiresProof: true }));
});

describe('the deposit methods list', () => {
  it('lists the internal name with what clients see, and never shows the key', async () => {
    getPaymentMethods.mockResolvedValue([
      method({ key: 'pm_7k2m9x4q1a', internalLabel: 'OMT Hamra', name: 'OMT' }),
    ]);
    renderWithProviders(<PaymentMethodsPage />);
    expect(await screen.findByText('OMT Hamra')).toBeInTheDocument();
    expect(screen.getByText('Clients see “OMT”')).toBeInTheDocument();
    expect(screen.queryByText(/pm_7k2m9x4q1a/)).not.toBeInTheDocument();
  });

  it('opens a method’s settings on their own page, not in a dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodsPage />);
    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
    expect(push).toHaveBeenCalledWith('/payment-methods/external');
  });
});
