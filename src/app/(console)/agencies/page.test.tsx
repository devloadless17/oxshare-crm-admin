import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    nameAr: null,
    description: 'The flagship package.',
    descriptionAr: null,
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
    nameAr: null,
    description: null,
    descriptionAr: null,
    enabled: true,
    type: 'real',
    // Required on ProductDto, so a fixture without it stops compiling — which
    // is the contract guard doing its job rather than a chore. Nothing on this
    // screen reads it.
    commissionTypeId: null,
    sortOrder: 0,
    maxAccountsPerClient: 5,
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
    permissions.current = ['agencies.view'];
    renderWithProviders(<AgenciesPage />);

    await screen.findByText('Gold Agency');
    expect(screen.queryByRole('button', { name: /add agency/i })).toBeNull();
  });
});

describe('the agency’s Arabic name and description', () => {
  it('sends the Arabic typed, trimmed, beside the English', async () => {
    createAgency.mockResolvedValue(agency({ id: 'ag-2', productIds: [] }));
    const user = userEvent.setup();
    renderWithProviders(<AgenciesPage />);
    await screen.findByText('Gold Agency');

    await user.click(screen.getByRole('button', { name: /add agency/i }));
    await user.type(await screen.findByLabelText(/^name$/i), 'Silver Agency');
    const nameAr = screen.getByLabelText('Name (Arabic)');
    expect(nameAr).toHaveAttribute('dir', 'rtl');
    expect(nameAr).toHaveAttribute('lang', 'ar');
    expect(nameAr).toHaveAttribute('maxLength', '80');
    expect(nameAr).not.toBeRequired();
    await user.type(nameAr, ' الوكالة الفضية ');
    await user.type(screen.getByLabelText('Description (Arabic)'), 'باقة للمبتدئين');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(createAgency).toHaveBeenCalled());
    expect(createAgency.mock.calls[0]?.[0]).toMatchObject({
      name: 'Silver Agency',
      nameAr: 'الوكالة الفضية',
      descriptionAr: 'باقة للمبتدئين',
    });
  });

  it('prefills the stored Arabic on edit, and sends null once it is cleared', async () => {
    getAgencies.mockResolvedValue([
      agency({ nameAr: 'الوكالة الذهبية', descriptionAr: 'الباقة الرئيسية' }),
    ]);
    updateAgency.mockResolvedValue(agency());
    const user = userEvent.setup();
    renderWithProviders(<AgenciesPage />);
    // The list shows the Arabic under the English.
    expect(await screen.findByText('الوكالة الذهبية')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /actions for gold agency/i })[0]!);
    await user.click(await screen.findByText(/^edit$/i));
    const nameAr = await screen.findByLabelText('Name (Arabic)');
    expect(nameAr).toHaveValue('الوكالة الذهبية');
    await user.clear(nameAr);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateAgency).toHaveBeenCalled());
    expect(updateAgency.mock.calls[0]?.[1]).toMatchObject({
      nameAr: null,
      descriptionAr: 'الباقة الرئيسية',
    });
  });

  it('marks an agency that has no Arabic name yet', async () => {
    renderWithProviders(<AgenciesPage />);
    await screen.findByText('Gold Agency');
    expect(screen.getByText('No Arabic')).toBeInTheDocument();
  });
});
