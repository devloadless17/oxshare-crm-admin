import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import CurrencyPage from './page';

/* The form itself is driven in components/currencies/currency-form.test.tsx. */
const route = vi.hoisted(() => ({ code: 'new' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ code: route.code }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/currencies/${route.code}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getCurrencies: () => Promise.resolve([]) } };
  return { api, default: api };
});

describe('a currency’s settings page', () => {
  it('opens empty to add a currency', async () => {
    route.code = 'new';
    renderWithProviders(<CurrencyPage />);
    expect(await screen.findByRole('heading', { name: /add a currency/i })).toBeInTheDocument();
  });

  it('says plainly when the currency does not exist', async () => {
    route.code = 'XYZ';
    renderWithProviders(<CurrencyPage />);
    expect(await screen.findByText(/there is no currency with this code/i)).toBeInTheDocument();
  });
});
