'use client';

import Link from 'next/link';
import { ChevronRight, PlugZap } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentProvider } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { EmptyState } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import {
  AvailabilityBadge,
  ProviderStatusBadge,
} from '@/components/payment-providers/provider-labels';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * System → Payment providers (backend 0168): every system that moves money —
 * the desk (built in), Rival, and each provider after them — with its state,
 * its channels and the methods running on each. "Which method runs on which
 * integration" is answered here at a glance; a provider's own page is where it
 * is set up.
 */
export default function PaymentProvidersPage() {
  const providers = useResource<PaymentProvider[]>(keys.paymentProviders.all(), (signal) =>
    api.admin.getPaymentProviders(signal),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('providers.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('providers.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={providers.status}
        label={t('providers.loading')}
        endpoints={['GET /admin/payment-providers']}
        onRetry={providers.refetch}
        errorMessage={t('providers.loadFailed')}
        error={providers.error}
      >
        {(providers.data ?? []).length === 0 ? (
          <EmptyState icon={PlugZap} message={t('providers.methodsNone')} />
        ) : (
          <ul aria-label={t('providers.caption')} className="grid gap-4 lg:grid-cols-2">
            {(providers.data ?? []).map((provider) => (
              <ProviderCard key={provider.code} provider={provider} />
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

function ProviderCard({ provider }: { provider: PaymentProvider }) {
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            {provider.name}
            {provider.builtIn && <Badge variant="outline">{t('providers.builtIn')}</Badge>}
          </h2>
          <ProviderStatusBadge provider={provider} />
        </div>
        <Link
          href={`/payment-providers/${encodeURIComponent(provider.code)}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent focus-outline"
        >
          {t('providers.manage')}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {provider.statusMessage && (
        <p className="text-xs text-muted-foreground">{provider.statusMessage}</p>
      )}
      {provider.builtIn && (
        <p className="text-xs text-muted-foreground">{t('providers.builtInNote')}</p>
      )}
      {!provider.builtIn && (
        <p className="text-xs text-muted-foreground">
          {t('providers.lastEvent')}:{' '}
          {provider.lastEventAt
            ? new Date(provider.lastEventAt).toLocaleString()
            : t('providers.never')}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-foreground">{t('providers.methods')}</h3>
        {provider.methods.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('providers.methodsNone')}</p>
        ) : (
          <ul className="space-y-1.5">
            {provider.methods.map((method) => {
              const channel = provider.channels.find(
                (c) =>
                  c.code === method.channelCode &&
                  c.direction === (method.direction === 'deposit' ? 'deposit' : 'payout'),
              );
              return (
                <li
                  key={`${method.direction}:${method.key}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span className="text-foreground">
                    <span className="font-semibold">{method.internalLabel}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {method.direction === 'deposit'
                        ? t('providers.methodDeposit')
                        : t('providers.methodPayout')}
                      {channel ? ` · ${channel.label}` : ''}
                    </span>
                  </span>
                  <AvailabilityBadge availability={method.availability} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}
