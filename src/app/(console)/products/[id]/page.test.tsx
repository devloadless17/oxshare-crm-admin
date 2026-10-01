import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
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
});
