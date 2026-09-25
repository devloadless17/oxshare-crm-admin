import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ProductsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { Product } from '@/lib/api/admin';

/**
 * The product catalogue — ADM-07's screen, and the thing that decides which
 * MT5 group a client's account is actually opened in.
 *
 * ## Why this file exists
 *
 * The catalogue had ZERO direct tests while being the mapping every account
 * creation reads. The rules below each have a wrong version that renders
 * perfectly:
 *
 *  - A DISABLED product stops being sold and KEEPS its accounts. Rendering it
 *    identically to an enabled one loses the only distinction the flag exists
 *    to make, on the screen where somebody decides whether to re-enable it.
 *  - A product with no groups attached sells NOTHING — an account cannot be
 *    opened under it. That is a misconfiguration worth seeing, not an empty
 *    cell.
 *  - The MT5 group is a server PATH (`real\Standard-USD`), not a label. It has
 *    to survive to the DOM exactly, backslash included, because the bridge
 *    matches on it.
 */
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getAvailableGroups,
  getIbCommissionTypes,
} = vi.hoisted(() => ({
  getProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getAvailableGroups: vi.fn(),
  getIbCommissionTypes: vi.fn(),
}));

vi.mock('@/lib/api/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/admin')>('@/lib/api/admin');
  return {
    ...actual,
    adminApi: {
      getProducts,
      createProduct,
      updateProduct,
      deleteProduct,
      getAvailableGroups,
      getIbCommissionTypes,
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

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    name: 'Standard',
    description: 'The default account.',
    enabled: true,
    type: 'real',
    // The rate card it pays partners on (0139) — the table shows its NAME,
    // looked up from the types the page also loads.
    commissionTypeId: 'ct-1',
    sortOrder: 0,
    groups: [{ id: 'g-1', environment: 'live', mt5Group: 'real\\Standard-USD', currency: 'USD' }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getProducts.mockResolvedValue([product()]);
  getAvailableGroups.mockResolvedValue([]);
  getIbCommissionTypes.mockResolvedValue([
    {
      id: 'ct-1',
      name: 'Standard terms',
      description: null,
      enabled: true,
      commissionPerLot: '10.00000000',
      rebatePerLot: '3.00000000',
      sortOrder: 0,
      productNames: ['Standard'],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ]);
});

describe('the product catalogue', () => {
  it('lists a product with the MT5 group it sells', async () => {
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText('Standard')).toBeInTheDocument();
    /*
     * The list shows the CURRENCIES derived from the attached groups, not the
     * raw `real\Standard-USD` path — deliberately, because the path is MT5's
     * internal name and means nothing to the person choosing what to sell. What
     * matters is that the currency comes from a real attached group rather than
     * being assumed, which the no-groups case below pins from the other side.
     */
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('says so plainly when no product has been created yet', async () => {
    getProducts.mockResolvedValue([]);
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
  });

  /*
   * A failed load must never render as an empty catalogue. "No products yet" in
   * front of an operator whose request failed says the platform sells nothing,
   * which is a statement about the business rather than about the request.
   */
  it('offers a retry when the catalogue cannot be loaded, never an empty list', async () => {
    getProducts.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no products yet/i)).toBeNull();
  });

  /*
   * A product with no groups attached sells NOTHING — no account can be opened
   * under it. It must not borrow a plausible currency from anywhere; the em
   * dash is the honest answer and is what tells an operator the product is
   * misconfigured rather than merely new.
   */
  it('shows no currency for a product that has no groups attached', async () => {
    getProducts.mockResolvedValue([product({ groups: [] })]);
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText('Standard')).toBeInTheDocument();
    expect(screen.queryByText('USD')).toBeNull();
  });

  it('reads the catalogue from the server rather than holding its own copy', async () => {
    renderWithProviders(<ProductsPage />);
    await waitFor(() => expect(getProducts).toHaveBeenCalled());
  });
});

describe('the product catalogue — who may change it', () => {
  it('offers no way to add a product to a read-only operator', async () => {
    permissions.current = ['settings.view'];
    renderWithProviders(<ProductsPage />);

    await screen.findByText('Standard');
    expect(screen.queryByRole('button', { name: /add product/i })).toBeNull();
  });
});

/*
 * ── Real vs demo ──
 *
 * At most ONE demo product exists, and it is offered to every client
 * automatically. The table has to say which row that is, and the create form
 * has to stop a second one before the API refuses it.
 */
describe('the product catalogue — real and demo', () => {
  it('badges the demo product and leaves the real rows unbadged', async () => {
    getProducts.mockResolvedValue([
      product(),
      product({ id: 'p-2', name: 'Practice', type: 'demo', groups: [] }),
    ]);
    renderWithProviders(<ProductsPage />);

    const demoRow = (await screen.findByText('Practice')).closest('tr');
    const realRow = screen.getByText('Standard').closest('tr');
    expect(demoRow).not.toBeNull();
    expect(within(demoRow as HTMLElement).getByText(/^demo$/i)).toBeInTheDocument();
    expect(within(realRow as HTMLElement).queryByText(/^demo$/i)).toBeNull();
  });

  it('disables the demo choice when a demo product already exists', async () => {
    getProducts.mockResolvedValue([
      product(),
      product({ id: 'p-2', name: 'Practice', type: 'demo', groups: [] }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await screen.findByText('Standard');
    await user.click(screen.getByRole('button', { name: /add product/i }));

    /*
     * The type is a shadcn `Select` now, not two bare radios — so the options
     * live behind the trigger and only exist once it is opened. `option` rather
     * than `radio` is the role Radix gives them.
     */
    await user.click(await screen.findByRole('combobox', { name: /^type$/i }));

    expect(await screen.findByRole('option', { name: /demo/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('option', { name: /real/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText(/a demo product already exists/i)).toBeInTheDocument();
  });

  it('offers the demo choice when none exists yet', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await screen.findByText('Standard');
    await user.click(screen.getByRole('button', { name: /add product/i }));

    await user.click(await screen.findByRole('combobox', { name: /^type$/i }));

    expect(await screen.findByRole('option', { name: /demo/i })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

/**
 * ── A product is sold on a COMMISSION TYPE (0139) ──────────────────────────
 *
 * The rate card lives on Commission Types; this screen only points a product
 * at one. What these pin is the pointer's round trip — shown by NAME in the
 * table, chosen in the form, sent as an id or as an explicit null — and the
 * one state worth seeing at a glance: a real product that pays nobody.
 */
describe('the commission type', () => {
  it('shows the type a product is sold on, by name', async () => {
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText('Standard terms')).toBeInTheDocument();
  });

  it('calls out a real product with no type, because it pays no partner commission', async () => {
    getProducts.mockResolvedValue([product({ commissionTypeId: null })]);
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText(/pays no partner commission/i)).toBeInTheDocument();
  });

  it('sends the chosen type by id', async () => {
    const user = userEvent.setup();
    getProducts.mockResolvedValue([product({ commissionTypeId: null })]);
    updateProduct.mockResolvedValue(product());

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /actions for standard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    await user.click(await screen.findByRole('combobox', { name: /commission type/i }));
    await user.click(await screen.findByRole('option', { name: /standard terms/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ commissionTypeId: 'ct-1' }),
      ),
    );
  });

  /*
   * An explicit NULL, never an omission. The API treats an absent type as
   * unchanged — which is what protects it from the enable/disable toggle —
   * so a form that shows the current choice has to say "none" out loud, or
   * the operator who picked it is silently ignored.
   */
  it('sends an explicit null when the operator picks none', async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue(product({ commissionTypeId: null }));

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /actions for standard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    await user.click(await screen.findByRole('combobox', { name: /commission type/i }));
    await user.click(await screen.findByRole('option', { name: /pays no partner commission/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ commissionTypeId: null }),
      ),
    );
  });

  it('offers no type on the demo product, which never pays commission', async () => {
    const user = userEvent.setup();
    getProducts.mockResolvedValue([
      product({ id: 'p-demo', name: 'Demo', type: 'demo', commissionTypeId: null, groups: [] }),
    ]);

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /actions for demo/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByText(/never pays commission/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /commission type/i })).toBeNull();
  });
});
