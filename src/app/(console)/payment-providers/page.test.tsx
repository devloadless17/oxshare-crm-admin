import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import PaymentProvidersPage from './page';
import { provider } from '@/test/payment-provider-fixture';

/*
 * The list answers "which method runs on which integration" at a glance — the
 * owner's question that started payment providers (backend 0168). So it is
 * asserted by what an operator reads: the provider, its state, and each method
 * with whether clients actually see it.
 */
const { getPaymentProviders } = vi.hoisted(() => ({ getPaymentProviders: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { getPaymentProviders } };
  return { api, default: api };
});

describe('the payment providers list', () => {
  it('names each provider, its state, and whether clients see each method on it', async () => {
    getPaymentProviders.mockResolvedValue([
      provider(),
      provider({
        code: 'manual',
        name: 'Manual',
        builtIn: true,
        enabled: true,
        status: 'connected',
        statusMessage: null,
        usable: true,
        methods: [],
        channels: [],
      }),
    ]);
    renderWithProviders(<PaymentProvidersPage />);

    expect(await screen.findByRole('heading', { name: 'Rival' })).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    // Enabled in the console but hidden from clients — said here, not in a log.
    expect(screen.getByText('Whish (Rival)')).toBeInTheDocument();
    expect(screen.getByText('Hidden: provider not set up')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /manual/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /manage/i })[0]).toHaveAttribute(
      'href',
      '/payment-providers/rival',
    );
  });
});
