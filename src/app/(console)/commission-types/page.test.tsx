import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import CommissionTypesPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbCommissionType } from '@/lib/api/admin';

/**
 * Commission types — the rate cards products are sold on (0140), and the screen
 * where a typo re-prices every product on a type.
 *
 * What these pin is the part that can silently go wrong: the amounts making
 * the round trip through a form as STRINGS, the products on a type being
 * visible before somebody deactivates it, and a read-only operator getting no
 * controls at all.
 */
const {
  getIbCommissionTypes,
  createIbCommissionType,
  updateIbCommissionType,
  deleteIbCommissionType,
} = vi.hoisted(() => ({
  getIbCommissionTypes: vi.fn(),
  createIbCommissionType: vi.fn(),
  updateIbCommissionType: vi.fn(),
  deleteIbCommissionType: vi.fn(),
}));

vi.mock('@/lib/api/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/admin')>('@/lib/api/admin');
  return {
    ...actual,
    adminApi: {
      getIbCommissionTypes,
      createIbCommissionType,
      updateIbCommissionType,
      deleteIbCommissionType,
    },
  };
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

function type(over: Partial<IbCommissionType> = {}): IbCommissionType {
  return {
    id: 'ct-1',
    name: 'Standard terms',
    description: 'The default card.',
    enabled: true,
    commissionPerLot: '10.00000000',
    rebatePerLot: '3.00000000',
    sortOrder: 0,
    productNames: ['Standard'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIbCommissionTypes.mockResolvedValue([type()]);
  createIbCommissionType.mockResolvedValue(type({ id: 'ct-2', name: 'Gold terms' }));
  updateIbCommissionType.mockResolvedValue(type());
  deleteIbCommissionType.mockResolvedValue(undefined);
});

describe('the commission types', () => {
  it('lists a type with its two amounts and the products sold on it', async () => {
    renderWithProviders(<CommissionTypesPage />);

    expect(await screen.findByText('Standard terms')).toBeInTheDocument();
    /* Exact, with the padding zeros trimmed — never rounded by a formatter. */
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.getByText('$3')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('says so plainly when none has been created yet', async () => {
    getIbCommissionTypes.mockResolvedValue([]);
    renderWithProviders(<CommissionTypesPage />);

    expect(await screen.findByText(/no commission types yet/i)).toBeInTheDocument();
  });

  it('shows an unassigned type as such rather than as blank', async () => {
    getIbCommissionTypes.mockResolvedValue([type({ productNames: [] })]);
    renderWithProviders(<CommissionTypesPage />);

    expect(await screen.findByText(/not assigned/i)).toBeInTheDocument();
  });

  /*
   * A STRING on the wire. The moment this becomes a number the eight decimals
   * stop being guaranteed, and a rate card that reads 7.5 pays 7.4999999999.
   */
  it('sends the amounts the operator typed as strings, without rounding', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommissionTypesPage />);

    await user.click(await screen.findByRole('button', { name: /add commission type/i }));
    await user.type(screen.getByPlaceholderText('Standard terms'), 'Gold terms');
    const commission = screen.getByRole('textbox', { name: /partners’ commission per lot/i });
    await user.clear(commission);
    await user.type(commission, '7.12345678');
    const rebate = screen.getByRole('textbox', { name: /client rebate per lot/i });
    await user.clear(rebate);
    await user.type(rebate, '2.5');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(createIbCommissionType).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Gold terms',
          commissionPerLot: '7.12345678',
          rebatePerLot: '2.5',
        }),
      ),
    );
    const sent = createIbCommissionType.mock.calls[0]?.[0] as
      { commissionPerLot: unknown } | undefined;
    expect(typeof sent?.commissionPerLot).toBe('string');
  });

  it('opens the edit form seeded with the stored amounts, exactly', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommissionTypesPage />);

    await user.click(await screen.findByRole('button', { name: /actions for standard terms/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(
      await screen.findByRole('textbox', { name: /partners’ commission per lot/i }),
    ).toHaveValue('10.00000000');
    expect(screen.getByRole('textbox', { name: /client rebate per lot/i })).toHaveValue(
      '3.00000000',
    );
  });

  /*
   * Deactivating stops every product on the type paying, so the products are
   * named in the confirmation before the API refuses — an informed
   * cancellation rather than a surprise.
   */
  it('names the products on a type before offering to delete it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommissionTypesPage />);

    await user.click(await screen.findByRole('button', { name: /actions for standard terms/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete commission type/i }));

    expect(await screen.findByText(/Standard is sold on it/i)).toBeInTheDocument();
  });

  /*
   * Read-only means READ-ONLY. `ib.view` without `ib.commission_types.*` is a
   * real role — an operator trusted to see the rate cards is not automatically
   * trusted to change what every product pays.
   */
  it('offers no editing to an operator who may only read', async () => {
    permissions.current = ['ib.view'];
    renderWithProviders(<CommissionTypesPage />);

    await screen.findByText('Standard terms');
    expect(screen.queryByRole('button', { name: /add commission type/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
  });
});
