import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ProductsPage from './page';
import ProductPage from './[id]/page';
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
  attachProductGroup,
  detachProductGroup,
} = vi.hoisted(() => ({
  getProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getAvailableGroups: vi.fn(),
  getIbCommissionTypes: vi.fn(),
  attachProductGroup: vi.fn(),
  detachProductGroup: vi.fn(),
}));

// A product's settings are a page now (owner, 1 Oct 2026): the form tests render it.
const route = vi.hoisted(() => ({ id: 'p-1', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: route.id }),
  useRouter: () => ({ push: route.push, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(),
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
      attachProductGroup,
      detachProductGroup,
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
    nameAr: null,
    description: 'The default account.',
    descriptionAr: null,
    enabled: true,
    type: 'real',
    // The rate card it pays partners on (0140) — the table shows its NAME,
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
    route.id = 'new';
    renderWithProviders(<ProductPage />);

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
    route.id = 'new';
    renderWithProviders(<ProductPage />);

    await user.click(await screen.findByRole('combobox', { name: /^type$/i }));

    expect(await screen.findByRole('option', { name: /demo/i })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

/**
 * ── A product is sold on a COMMISSION TYPE (0140) ──────────────────────────
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

    route.id = 'p-1';
    renderWithProviders(<ProductPage />);

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

    route.id = 'p-1';
    renderWithProviders(<ProductPage />);

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
    getProducts.mockResolvedValue([
      product({ id: 'p-demo', name: 'Demo', type: 'demo', commissionTypeId: null, groups: [] }),
    ]);

    route.id = 'p-demo';
    renderWithProviders(<ProductPage />);

    expect(await screen.findByText(/never pays commission/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /commission type/i })).toBeNull();
  });
});

/*
 * ATTACHING MT5 GROUPS on the product form — every path an operator can take.
 *
 * On 26 Sep 2026 attaching a group answered a bare 409 from the database. The
 * form offered a group the product could not take (a second one in a currency
 * it already had), and a save that half-succeeded could never be retried.
 */
describe('attaching MT5 groups on the product form', () => {
  const group = (name: string, currency: string, claimed = false) => ({
    name,
    currency,
    claimed,
    lastSeenAt: null,
  });

  async function openEdit(_user: ReturnType<typeof userEvent.setup>) {
    route.id = 'p-1';
    renderWithProviders(<ProductPage />);
    await screen.findByRole('combobox', { name: /choose a group/i });
  }

  async function pick(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(await screen.findByRole('combobox', { name: /choose a group/i }));
    await user.click(await screen.findByRole('option', { name }));
    await user.click(screen.getByRole('button', { name: /^attach$/i }));
  }

  beforeEach(() => {
    getAvailableGroups.mockResolvedValue([
      group('real\\Standard-USD', 'USD'),
      group('real\\Pro-USD', 'USD'),
      group('real\\Standard-EUR', 'EUR'),
      group('real\\Shared-GBP', 'GBP', true),
    ]);
    attachProductGroup.mockResolvedValue(product());
    detachProductGroup.mockResolvedValue(product({ groups: [] }));
  });

  it('offers a group another product sells, says so, and attaches it on save', async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue(product());
    await openEdit(user);

    await pick(user, /real\\Shared-GBP · GBP — also on another product/);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(attachProductGroup).toHaveBeenCalledWith('p-1', {
        environment: 'live',
        mt5Group: 'real\\Shared-GBP',
      }),
    );
    expect(detachProductGroup).not.toHaveBeenCalled();
  });

  /* The 409 the operator hit: the form no longer offers it. */
  it('will not offer a second group in a currency the product already has', async () => {
    const user = userEvent.setup();
    await openEdit(user);

    await user.click(await screen.findByRole('combobox', { name: /choose a group/i }));

    const taken = await screen.findByRole('option', { name: /real\\Pro-USD/ });
    expect(taken).toHaveAttribute('aria-disabled', 'true');
    expect(taken).toHaveTextContent('USD is already real\\Standard-USD — remove it first');
    expect(screen.getByRole('option', { name: /^real\\Standard-USD/ })).toHaveTextContent(
      'already added',
    );
    expect(screen.getByRole('option', { name: /real\\Standard-EUR/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('swaps the USD group in one edit, detaching the old one before attaching the new', async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue(product());
    await openEdit(user);

    await user.click(await screen.findByRole('button', { name: /detach this group/i }));
    await pick(user, /real\\Pro-USD/);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(attachProductGroup).toHaveBeenCalledTimes(1));
    expect(detachProductGroup).toHaveBeenCalledWith('p-1', 'g-1');
    expect(attachProductGroup).toHaveBeenCalledWith('p-1', {
      environment: 'live',
      mt5Group: 'real\\Pro-USD',
    });
    expect(detachProductGroup.mock.invocationCallOrder[0]).toBeLessThan(
      attachProductGroup.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('shows the API’s reason when an attach is refused, and keeps the page open', async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue(product());
    attachProductGroup.mockRejectedValueOnce({
      response: { status: 400, data: { message: 'MT5 does not report a group called "x".' } },
    });
    await openEdit(user);

    await pick(user, /real\\Standard-EUR/);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/MT5 does not report a group called/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  /*
   * A save that half-succeeded — the old group detached, the new one refused —
   * must be retryable. The retry reconciles against what the SERVER says the
   * product holds now, so the detached group is not detached again.
   */
  it('retries a half-finished save without detaching the same group twice', async () => {
    const user = userEvent.setup();
    // First save: the product still holds real\Standard-USD. Second: it no longer does.
    updateProduct.mockResolvedValueOnce(product()).mockResolvedValueOnce(product({ groups: [] }));
    attachProductGroup.mockRejectedValueOnce({
      response: { status: 400, data: { message: 'The trading server did not answer.' } },
    });
    await openEdit(user);

    await user.click(await screen.findByRole('button', { name: /detach this group/i }));
    await pick(user, /real\\Pro-USD/);
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/did not answer/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(attachProductGroup).toHaveBeenCalledTimes(2));
    expect(detachProductGroup).toHaveBeenCalledTimes(1);
  });
});

describe('a product’s Arabic name', () => {
  it('SENDS the Arabic name typed, trimmed', async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue(product());
    route.id = 'p-1';
    renderWithProviders(<ProductPage />);

    const nameAr = await screen.findByLabelText('Name (Arabic)');
    expect(nameAr).toHaveAttribute('dir', 'rtl');
    expect(nameAr).toHaveAttribute('lang', 'ar');
    expect(nameAr).toHaveAttribute('maxLength', '80');
    expect(nameAr).not.toBeRequired();
    await user.type(nameAr, ' قياسي ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]?.[1]).toMatchObject({ name: 'Standard', nameAr: 'قياسي' });
  });

  it('prefills the stored Arabic, and sends null once it is cleared', async () => {
    const user = userEvent.setup();
    getProducts.mockResolvedValue([product({ nameAr: 'قياسي' })]);
    updateProduct.mockResolvedValue(product());
    route.id = 'p-1';
    renderWithProviders(<ProductPage />);

    const nameAr = await screen.findByLabelText('Name (Arabic)');
    expect(nameAr).toHaveValue('قياسي');
    await user.clear(nameAr);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]?.[1]).toMatchObject({ nameAr: null });
  });

  it('SENDS the Arabic description typed, trimmed', async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue(product());
    route.id = 'p-1';
    renderWithProviders(<ProductPage />);

    const descriptionAr = await screen.findByLabelText('Description (Arabic)');
    expect(descriptionAr.tagName).toBe('TEXTAREA');
    expect(descriptionAr).toHaveAttribute('dir', 'rtl');
    expect(descriptionAr).toHaveAttribute('maxLength', '2000');
    await user.type(descriptionAr, ' الحساب الافتراضي ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]?.[1]).toMatchObject({
      description: 'The default account.',
      descriptionAr: 'الحساب الافتراضي',
    });
  });

  it('prefills the stored Arabic description, and sends null once it is cleared', async () => {
    const user = userEvent.setup();
    getProducts.mockResolvedValue([product({ descriptionAr: 'الحساب الافتراضي' })]);
    updateProduct.mockResolvedValue(product());
    route.id = 'p-1';
    renderWithProviders(<ProductPage />);

    const descriptionAr = await screen.findByLabelText('Description (Arabic)');
    expect(descriptionAr).toHaveValue('الحساب الافتراضي');
    await user.clear(descriptionAr);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]?.[1]).toMatchObject({ descriptionAr: null });
  });

  it('shows the Arabic under the English in the catalogue, or marks it missing', async () => {
    getProducts.mockResolvedValue([
      product({ nameAr: 'قياسي' }),
      product({ id: 'p-2', name: 'Pro', groups: [] }),
    ]);
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText('قياسي')).toBeInTheDocument();
    expect(screen.getByText('No Arabic')).toBeInTheDocument();
  });
});
