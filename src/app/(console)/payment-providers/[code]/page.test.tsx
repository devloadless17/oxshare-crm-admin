import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import { provider } from '@/test/payment-provider-fixture';
import PaymentProviderPage from './page';

/*
 * A provider's page is where money can be pointed somewhere else, so what is
 * asserted is the PAYLOAD: a secret is sent only when typed, a blank box keeps
 * the saved one, and only what changed goes out (backend 0168).
 */
const { getPaymentProvider, updatePaymentProvider, getPaymentProviderEvents, testPaymentProvider } =
  vi.hoisted(() => ({
    getPaymentProvider: vi.fn(),
    updatePaymentProvider: vi.fn(),
    getPaymentProviderEvents: vi.fn(),
    testPaymentProvider: vi.fn(),
  }));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getPaymentProvider,
      updatePaymentProvider,
      getPaymentProviderEvents,
      testPaymentProvider,
    },
  };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({ useParams: () => ({ code: 'rival' }) }));

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      role: 'sub_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const rival = provider({
  settings: [
    {
      name: 'baseUrl',
      label: 'API base URL',
      kind: 'url',
      required: true,
      hint: null,
      generated: false,
      value: 'https://rival.example/v1',
      isSet: true,
      fingerprint: null,
    },
    {
      name: 'apiKey',
      label: 'Company API key',
      kind: 'secret',
      required: true,
      hint: null,
      generated: false,
      value: null,
      isSet: true,
      fingerprint: null,
    },
    {
      name: 'webhookKey',
      label: 'Webhook key',
      kind: 'secret',
      required: false,
      hint: null,
      generated: true,
      value: null,
      isSet: true,
      fingerprint: 'ab12cd34',
    },
  ],
});

beforeEach(() => {
  getPaymentProvider.mockReset().mockResolvedValue(rival);
  updatePaymentProvider.mockReset().mockResolvedValue(rival);
  getPaymentProviderEvents.mockReset().mockResolvedValue([]);
  testPaymentProvider
    .mockReset()
    .mockResolvedValue({ ok: true, message: 'Connected.', checkedAt: new Date().toISOString() });
});

/** A typed secret, set or not, required or not. */
function secret(name: string, label: string, required: boolean, isSet: boolean) {
  return {
    name,
    label,
    kind: 'secret' as const,
    required,
    hint: null,
    generated: false,
    value: null,
    isSet,
    fingerprint: null,
  };
}

describe('a provider’s connection', () => {
  it('keeps the saved key when the box is left blank, and sends only what changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentProviderPage />);

    const toggle = await screen.findByRole('checkbox', { name: /switched on/i });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updatePaymentProvider).toHaveBeenCalledWith('rival', { enabled: true }),
    );
  });

  it('sends a typed secret, and never shows the generated one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaymentProviderPage />);

    await user.type(await screen.findByLabelText(/company api key/i), 'tsk_new');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updatePaymentProvider).toHaveBeenCalledWith('rival', {
        secrets: { apiKey: 'tsk_new' },
      }),
    );
    // The webhook key is rotated, never typed: only its fingerprint shows.
    expect(screen.queryByLabelText(/webhook key/i)).toBeNull();
    expect(screen.getByText('ab12cd34')).toBeInTheDocument();
  });
});

describe('Test connection', () => {
  it('is offered while an OPTIONAL secret is left blank (3pay’s webhook secret)', async () => {
    getPaymentProvider.mockResolvedValue(
      provider({
        code: 'threepay',
        name: '3pay',
        settings: [
          secret('apiSecret', 'API secret (x-api-secret)', true, true),
          secret('webhookSecret', 'Webhook secret (optional)', false, false),
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PaymentProviderPage />);

    const button = await screen.findByRole('button', { name: /test connection/i });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(testPaymentProvider).toHaveBeenCalledWith('threepay'));
  });

  it('waits for a REQUIRED secret that was never saved', async () => {
    getPaymentProvider.mockResolvedValue(
      provider({ settings: [secret('apiKey', 'Company API key', true, false)] }),
    );
    renderWithProviders(<PaymentProviderPage />);
    expect(await screen.findByRole('button', { name: /test connection/i })).toBeDisabled();
  });
});
