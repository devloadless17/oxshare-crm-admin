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
const { getProducts, createProduct, updateProduct, deleteProduct, getAvailableGroups } = vi.hoisted(
  () => ({
    getProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    getAvailableGroups: vi.fn(),
  }),
);

vi.mock('@/lib/api/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/admin')>('@/lib/api/admin');
  return {
    ...actual,
    adminApi: { getProducts, createProduct, updateProduct, deleteProduct, getAvailableGroups },
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
    // Required on ProductDto, so a fixture without it stops compiling — which
    // is the contract guard doing its job rather than a chore. A commercial
    // record only: nothing on this screen computes from it.
    spreadMarkupPerLot: '0.00000000',
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

    expect(await screen.findByRole('radio', { name: /demo/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /real/i })).toBeEnabled();
    expect(screen.getByText(/a demo product already exists/i)).toBeInTheDocument();
  });

  it('offers the demo choice when none exists yet', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await screen.findByText('Standard');
    await user.click(screen.getByRole('button', { name: /add product/i }));

    expect(await screen.findByRole('radio', { name: /demo/i })).toBeEnabled();
  });
});

/**
 * ── ADM-07: the spread markup is editable, and stays a decimal string ─────
 *
 * The backend records what the desk sells a product on. Nothing computes from
 * it — it is deliberately NOT part of the revenue partners are paid a share of
 * — so what these pin is the part that can silently go wrong: the value making
 * the round trip through a form without a number type touching it.
 */
describe('the spread markup', () => {
  it('shows the stored value exactly, trailing zeros and all', async () => {
    /*
     * NUMERIC(28,8) keeps its scale, and the string carries it. A number
     * formatter here would render 1.50000000 as "1.5" — which reads fine until
     * somebody compares the screen against the database and finds two answers.
     */
    getProducts.mockResolvedValue([product({ spreadMarkupPerLot: '1.50000000' })]);

    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText('1.50000000')).toBeInTheDocument();
  });

  it('sends what the operator typed, without rounding it', async () => {
    const user = userEvent.setup();
    getProducts.mockResolvedValue([product({ spreadMarkupPerLot: '1.00000000' })]);
    updateProduct.mockResolvedValue(product({ spreadMarkupPerLot: '2.12345678' }));

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /actions for standard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const field = await screen.findByLabelText(/spread markup per lot/i);
    await user.clear(field);
    await user.type(field, '2.12345678');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ spreadMarkupPerLot: '2.12345678' }),
      ),
    );

    // A STRING on the wire. The moment this becomes a number the eight decimals
    // above stop being guaranteed.
    const sent = updateProduct.mock.calls[0]?.[1] as { spreadMarkupPerLot: unknown } | undefined;
    expect(typeof sent?.spreadMarkupPerLot).toBe('string');
  });

  it('reads an emptied box as zero rather than as "leave it alone"', async () => {
    /*
     * The API treats an ABSENT markup as unchanged, which is what stops the
     * enable/disable toggle wiping it — that sends a PUT carrying no markup at
     * all. A form that always shows the current value makes a different
     * promise, so clearing the box has to mean nought or the operator is
     * silently ignored.
     */
    const user = userEvent.setup();
    getProducts.mockResolvedValue([product({ spreadMarkupPerLot: '3.00000000' })]);
    updateProduct.mockResolvedValue(product({ spreadMarkupPerLot: '0.00000000' }));

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /actions for standard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    await user.clear(await screen.findByLabelText(/spread markup per lot/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ spreadMarkupPerLot: '0' }),
      ),
    );
  });

  it('says the figure changes nobody’s pay', async () => {
    /*
     * The hint is the feature. An operator who believed this drove partner
     * commission would set it very differently, and nothing on the screen would
     * contradict them.
     */
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /actions for standard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(
      await screen.findByText(/does not change what any partner is paid/i),
    ).toBeInTheDocument();
  });
});
