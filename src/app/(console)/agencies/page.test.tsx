import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import AgenciesPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { Agency, Product } from '@/lib/api/admin';

/**
 * Agencies — ADM-11's third screen, and the object a partner is appointed under.
 *
 * An agency (وكالة) is the package a partner sells: it decides which products
 * they may introduce clients to. It is asked for at approval, so a wrong or
 * missing agency here becomes a wrong appointment there.
 *
 * The rule this file most exists for: a DISABLED agency stops taking
 * applications and KEEPS its partners. Those are different things, and a screen
 * that renders both states alike loses the distinction on exactly the screen
 * where somebody decides whether to reopen it.
 */
const { getAgencies, getProducts, createAgency, updateAgency, deleteAgency, setAgencyProducts } =
  vi.hoisted(() => ({
    getAgencies: vi.fn(),
    getProducts: vi.fn(),
    createAgency: vi.fn(),
    updateAgency: vi.fn(),
    deleteAgency: vi.fn(),
    setAgencyProducts: vi.fn(),
  }));

vi.mock('@/lib/api/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/admin')>('@/lib/api/admin');
  return {
    ...actual,
    adminApi: {
      getAgencies,
      getProducts,
      createAgency,
      updateAgency,
      deleteAgency,
      setAgencyProducts,
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

function agency(over: Partial<Agency> = {}): Agency {
  return {
    id: 'ag-1',
    name: 'Gold Agency',
    description: 'The flagship package.',
    enabled: true,
    sortOrder: 0,
    // The products this agency sells. Required — the row renders their count,
    // and omitting it is what made the whole screen throw rather than render.
    productIds: ['p-1'],
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    name: 'Standard',
    description: null,
    enabled: true,
    sortOrder: 0,
    groups: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getAgencies.mockResolvedValue([agency()]);
  getProducts.mockResolvedValue([product()]);
});

describe('the agency list', () => {
  it('lists an agency by the name a partner will be appointed under', async () => {
    renderWithProviders(<AgenciesPage />);
    expect(await screen.findByText('Gold Agency')).toBeInTheDocument();
  });

  it('says so plainly when none has been created yet', async () => {
    getAgencies.mockResolvedValue([]);
    renderWithProviders(<AgenciesPage />);

    expect(await screen.findByText(/no agencies yet/i)).toBeInTheDocument();
  });

  /*
   * Never an empty success state on failure. An operator about to approve a
   * partner reads this screen to pick their agency; "none exist" when the
   * request merely failed is how somebody approves without one.
   */
  it('offers a retry when the list cannot be loaded, never an empty list', async () => {
    getAgencies.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<AgenciesPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no agencies yet/i)).toBeNull();
  });

  it('reads both agencies and the products they may sell', async () => {
    renderWithProviders(<AgenciesPage />);
    await waitFor(() => expect(getAgencies).toHaveBeenCalled());
    await waitFor(() => expect(getProducts).toHaveBeenCalled());
  });
});

describe('the agency list — who may change it', () => {
  it('offers no way to add an agency to a read-only operator', async () => {
    permissions.current = ['settings.view'];
    renderWithProviders(<AgenciesPage />);

    await screen.findByText('Gold Agency');
    expect(screen.queryByRole('button', { name: /add agency/i })).toBeNull();
  });
});
