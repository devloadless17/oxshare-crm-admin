import type { PaymentProvider } from '@/lib/api/admin';

/** A payment provider as the API returns it (backend 0168): Rival, not set up. */
export function provider(over: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    code: 'rival',
    name: 'Rival',
    builtIn: false,
    enabled: false,
    environment: 'live',
    status: 'not_configured',
    statusMessage: 'Missing: API base URL, Company API key.',
    usable: false,
    configuredFrom: null,
    lastEventAt: null,
    lastCheck: null,
    webhookEndpoint: 'https://api.example/v1/payments/rival/webhook',
    settings: [],
    channels: [
      {
        code: 'whish',
        direction: 'deposit',
        label: 'Whish',
        flow: 'redirect',
        bindable: true,
        currencies: null,
        destinationKind: null,
        destinationNetwork: null,
        destinationLabel: null,
        acceptsReceipt: false,
      },
    ],
    methods: [
      {
        key: 'whish',
        internalLabel: 'Whish (Rival)',
        name: 'Whish Money',
        direction: 'deposit',
        channelCode: 'whish',
        enabled: true,
        availability: 'provider_not_configured',
        paidBy: null,
      },
    ],
    last24h: { total: 0, succeeded: 0, failed: 0, pending: 0 },
    updatedAt: null,
    ...over,
  };
}
