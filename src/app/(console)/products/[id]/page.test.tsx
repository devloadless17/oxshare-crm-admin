import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import ProductPage from './page';

/* The full form is driven in ../page.test.tsx; this pins the page's own states. */
const route = vi.hoisted(() => ({ id: 'new' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: route.id }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/products/${route.id}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getProducts: () => Promise.resolve([]),
      getIbCommissionTypes: () => Promise.resolve([]),
      getAvailableGroups: () => Promise.resolve([]),
    },
  };
});

const permissionsOverride = vi.hoisted(() => ({ current: null as string[] | null }));
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: { id: 'a-1', permissions: permissionsOverride.current ?? ALL_PERMISSIONS },
  }),
}));

describe('a product’s settings page', () => {
  it('opens empty to add a product', async () => {
    route.id = 'new';
    renderWithProviders(<ProductPage />);
    expect(await screen.findByRole('heading', { name: /add product/i })).toBeInTheDocument();
  });

  it('says plainly when the product does not exist', async () => {
    route.id = 'missing';
    renderWithProviders(<ProductPage />);
    expect(await screen.findByText(/there is no product with this id/i)).toBeInTheDocument();
  });

  it('is closed to a reader who may only see products — the form could not save', async () => {
    route.id = 'new';
    permissionsOverride.current = ['products.view'];
    renderWithProviders(<ProductPage />);
    expect((await screen.findAllByText(/access|permission/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /add product/i })).toBeNull();
    permissionsOverride.current = null;
  });
});
