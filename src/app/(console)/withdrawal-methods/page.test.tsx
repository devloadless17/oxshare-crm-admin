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
vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getWithdrawalMethods,
      createWithdrawalMethod,
      updateWithdrawalMethod,
      uploadPaymentMethodLogo,
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
    logoUrl: null,
    enabled: true,
    sortOrder: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getWithdrawalMethods.mockResolvedValue([
    method(),
    method({ key: 'bank', name: 'Bank transfer', enabled: false, sortOrder: 1 }),
  ]);
  createWithdrawalMethod.mockResolvedValue(method({ key: 'omt', name: 'OMT' }));
  updateWithdrawalMethod.mockResolvedValue(method());
});

describe('the withdrawal methods page', () => {
  it('lists every method, disabled ones included', async () => {
    renderWithProviders(<WithdrawalMethodsPage />);

    expect(await screen.findByText('Whish Money')).toBeInTheDocument();
    expect(screen.getByText('Bank transfer')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('adds a method with the key and name the operator typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodsPage />);

    await user.click(await screen.findByRole('button', { name: /add method/i }));
    await user.type(screen.getByPlaceholderText('bank_transfer'), 'omt');
    await user.type(screen.getByPlaceholderText('Bank transfer'), 'OMT');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(createWithdrawalMethod).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'omt', name: 'OMT', enabled: true }),
      ),
    );
    // No order is asked for or sent: the API puts a new method last.
    expect(createWithdrawalMethod.mock.calls[0]?.[0]).not.toHaveProperty('sortOrder');
  });

  /*
   * The console's own form parts: labelled fields, and the shared checkbox
   * (a Radix `button role="checkbox"`, not a native input) named by its label.
   */
  it('adds a disabled method through the labelled enabled checkbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodsPage />);

    await user.click(await screen.findByRole('button', { name: /add method/i }));
    await user.type(screen.getByLabelText(/^key$/i), 'omt');
    await user.type(screen.getByLabelText(/^name$/i), 'OMT');
    const enabled = screen.getByRole('checkbox', { name: /offer it to clients/i });
    expect(enabled.tagName).toBe('BUTTON');
    expect(enabled).toBeChecked();
    await user.click(enabled);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(createWithdrawalMethod).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'omt', enabled: false }),
      ),
    );
  });

  /* The key is the primary key, and every request made on the rail names it. */
  it('does not let the key of an existing method be edited', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalMethodsPage />);

    await user.click(await screen.findByRole('button', { name: /actions for whish money/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByDisplayValue('whish')).toBeDisabled();
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
