import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
vi.mock('@/lib/api', () => {
  const api = {
    admin: { getPaymentMethods, createPaymentMethod, updatePaymentMethod, getCurrencies },
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
  currency: 'USD',
  logoUrl: null,
  enabled: true,
  sortOrder: 0,
  requiresProof: false,
  minAmount: '10.00000000',
  maxAmount: '250000.00000000',
  // The method's own range (0162) — none: it follows the currency's.
  ownMinAmount: null,
  ownMaxAmount: null,
  builtIn: false,
  inUse: false,
  proofFields: [],
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

describe('marking a payment method as paid outside the platform', () => {
  it('SENDS the flag when the box is ticked on an existing method', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodsPage />);

    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const box = await screen.findByRole('checkbox', { name: /paid outside the platform/i });
    await user.click(box);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    /*
     * The assertion that matters: the flag is IN THE PAYLOAD. A save that omits
     * it answers 200 and changes nothing, which is indistinguishable from
     * success on screen.
     */
    await waitFor(() =>
      expect(updatePaymentMethod).toHaveBeenCalledWith(
        'external',
        expect.objectContaining({ requiresProof: true }),
      ),
    );
  });

  it('keeps the flag OFF when the box is left alone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodsPage />);

    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
    await user.click(await screen.findByRole('button', { name: /^save$/i }));

    // Explicit `false`, not absent: an omitted field leaves whatever was there,
    // so "unticked" has to be sent to be able to turn one back off.
    await waitFor(() =>
      expect(updatePaymentMethod).toHaveBeenCalledWith(
        'external',
        expect.objectContaining({ requiresProof: false }),
      ),
    );
  });

  it('shows an existing offline method as already ticked', async () => {
    const user = userEvent.setup();
    getPaymentMethods.mockResolvedValue([method({ requiresProof: true })]);
    renderWithProviders(<PaymentMethodsPage />);

    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    // Otherwise an operator opening the form sees it unticked, saves something
    // unrelated, and silently turns the flag off.
    expect(await screen.findByRole('checkbox')).toBeChecked();
  });
});

describe('the internal name stands in for the key (0161)', () => {
  it('SENDS the internal name the admin typed, and never a key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodsPage />);
    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const label = await screen.findByRole('textbox', { name: /internal name/i });
    await user.clear(label);
    await user.type(label, 'OMT Hamra');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updatePaymentMethod).toHaveBeenCalledWith(
        'external',
        expect.objectContaining({ internalLabel: 'OMT Hamra', name: 'External' }),
      ),
    );
    expect(updatePaymentMethod.mock.calls[0]?.[1]).not.toHaveProperty('key');
  });

  it('lists the internal name with what clients see, and never shows the key', async () => {
    getPaymentMethods.mockResolvedValue([
      method({ key: 'pm_7k2m9x4q1a', internalLabel: 'OMT Hamra', name: 'OMT' }),
    ]);
    renderWithProviders(<PaymentMethodsPage />);
    expect(await screen.findByText('OMT Hamra')).toBeInTheDocument();
    expect(screen.getByText('Clients see “OMT”')).toBeInTheDocument();
    expect(screen.queryByText(/pm_7k2m9x4q1a/)).not.toBeInTheDocument();
  });
});

describe('the details an offline method asks for (backend 0163)', () => {
  it('SENDS the details the admin set up — named, required and shown', async () => {
    getPaymentMethods.mockResolvedValue([method({ requiresProof: true })]);
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodsPage />);
    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    await user.click(await screen.findByRole('button', { name: /add a detail/i }));
    await user.type(screen.getByRole('textbox', { name: /detail name/i }), 'Transfer code');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // In the payload, or the save answers 200 and asks clients nothing.
    await waitFor(() =>
      expect(updatePaymentMethod).toHaveBeenCalledWith(
        'external',
        expect.objectContaining({
          proofFields: [
            expect.objectContaining({
              id: expect.stringMatching(/^f_[0-9a-z]{10}$/),
              label: 'Transfer code',
              type: 'text',
              required: true,
              enabled: true,
            }),
          ],
        }),
      ),
    );
  });

  it('asks nothing of a method that takes payment through a hosted page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodsPage />);
    await screen.findByText('External');
    await user.click(screen.getByRole('button', { name: /external/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
    await screen.findByRole('checkbox', { name: /paid outside the platform/i });
    expect(screen.queryByRole('button', { name: /add a detail/i })).toBeNull();
  });
});
