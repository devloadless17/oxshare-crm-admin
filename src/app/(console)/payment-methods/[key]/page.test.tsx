import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import PaymentMethodPage from './page';
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
// The settings page reads its method from the URL (owner, 1 Oct 2026: a page, not a dialog).
vi.mock('next/navigation', () => ({
  useParams: () => ({ key: 'external' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/payment-methods/external',
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

describe('marking a payment method as paid outside the platform', () => {
  it('SENDS the flag when the box is ticked on an existing method', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodPage />);

    const box = await screen.findByRole('checkbox', { name: /ask for a receipt/i });
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
    renderWithProviders(<PaymentMethodPage />);
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
    getPaymentMethods.mockResolvedValue([method({ requiresProof: true })]);
    renderWithProviders(<PaymentMethodPage />);

    // Otherwise an operator opening the form sees it unticked, saves something
    // unrelated, and silently turns the flag off.
    expect(await screen.findByRole('checkbox')).toBeChecked();
  });
});

describe('the internal name stands in for the key (0161)', () => {
  it('SENDS the internal name the admin typed, and never a key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodPage />);

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
});

describe('the details an offline method asks for (backend 0163)', () => {
  it('SENDS the details the admin set up — named, required and shown', async () => {
    getPaymentMethods.mockResolvedValue([method({ requiresProof: true })]);
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodPage />);

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
    renderWithProviders(<PaymentMethodPage />);
    await screen.findByRole('checkbox', { name: /ask for a receipt/i });
    expect(screen.queryByRole('button', { name: /add a detail/i })).toBeNull();
  });

  /*
   * A receipt belongs to a deposit paid OUTSIDE the platform (backend 0168). A
   * method on Rival's hosted page is settled by Rival, so the dialog does not
   * offer the box at all — the API would refuse it anyway.
   */
  it('offers no receipt on a method Rival settles', async () => {
    getPaymentMethods.mockResolvedValue([
      method({ providerCode: 'rival', channelCode: 'whish', name: 'Whish' }),
    ]);
    renderWithProviders(<PaymentMethodPage />);
    await screen.findByText(/fixed when the method was created/i);
    expect(screen.queryByRole('checkbox', { name: /ask for a receipt/i })).toBeNull();
  });
});

describe('the Arabic a client reads (name and proof details)', () => {
  it('SENDS the Arabic name and each detail’s Arabic label and hint, trimmed', async () => {
    getPaymentMethods.mockResolvedValue([method({ requiresProof: true })]);
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodPage />);

    const nameAr = await screen.findByRole('textbox', { name: 'Name (Arabic)' });
    expect(nameAr).toHaveAttribute('dir', 'rtl');
    expect(nameAr).toHaveAttribute('lang', 'ar');
    expect(nameAr).toHaveAttribute('maxLength', '80');
    await user.type(nameAr, ' خارجي ');

    await user.click(screen.getByRole('button', { name: /add a detail/i }));
    await user.type(screen.getByRole('textbox', { name: /detail name/i }), 'Transfer code');
    const labelAr = screen.getByRole('textbox', { name: 'Label (Arabic)' });
    expect(labelAr).toHaveAttribute('dir', 'rtl');
    expect(labelAr).toHaveAttribute('maxLength', '60');
    expect(screen.getByRole('textbox', { name: 'Hint (Arabic)' })).toHaveAttribute(
      'maxLength',
      '160',
    );
    await user.type(labelAr, 'رمز التحويل ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updatePaymentMethod).toHaveBeenCalled());
    expect(updatePaymentMethod.mock.calls[0]?.[1]).toMatchObject({
      nameAr: 'خارجي',
      proofFields: [{ label: 'Transfer code', labelAr: 'رمز التحويل', hintAr: null }],
    });
  });

  it('prefills the stored Arabic, and sends null once it is cleared', async () => {
    getPaymentMethods.mockResolvedValue([method({ nameAr: 'خارجي' })]);
    const user = userEvent.setup();
    renderWithProviders(<PaymentMethodPage />);

    const nameAr = await screen.findByRole('textbox', { name: 'Name (Arabic)' });
    expect(nameAr).toHaveValue('خارجي');
    await user.clear(nameAr);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updatePaymentMethod).toHaveBeenCalled());
    expect(updatePaymentMethod.mock.calls[0]?.[1]).toMatchObject({ nameAr: null });
  });
});
