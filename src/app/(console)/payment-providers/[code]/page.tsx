'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentProvider } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import {
  AvailabilityBadge,
  ProviderStatusBadge,
  destinationLabel,
  flowLabel,
} from '@/components/payment-providers/provider-labels';
import { ProviderConnectionForm } from '@/components/payment-providers/provider-connection-form';
import { ProviderWebhookCard } from '@/components/payment-providers/provider-webhook-card';
import { ProviderEvents } from '@/components/payment-providers/provider-events';
import { ChannelSwitch } from '@/components/payment-providers/channel-switch';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * One payment provider (backend 0168): its connection (the settings its
 * adapter declares), the webhook, the channels it offers, the methods running
 * on it, the last 24 hours and what it last reported. Replaces the Rival tab
 * that sat on Settings with no link to the methods that depend on it.
 */
export default function PaymentProviderPage() {
  const params = useParams();
  const code = typeof params.code === 'string' ? params.code : '';
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'payments.providers.edit');

  const provider = useResource<PaymentProvider>(keys.paymentProviders.detail(code), (signal) =>
    api.admin.getPaymentProvider(code, signal),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <Link
        href="/payment-providers"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('providers.back')}
      </Link>

      <AsyncBoundary
        status={provider.status}
        label={t('providers.loading')}
        endpoints={['GET /admin/payment-providers/:code']}
        onRetry={provider.refetch}
        errorMessage={t('providers.loadFailed')}
        error={provider.error}
      >
        {provider.data && <ProviderDetail provider={provider.data} canManage={canManage} />}
      </AsyncBoundary>
    </div>
  );
}

function ProviderDetail({
  provider,
  canManage,
}: {
  provider: PaymentProvider;
  canManage: boolean;
}) {
  const hasWebhook = provider.settings.some((s) => s.generated);
  return (
    <>
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          {provider.name}
          {provider.builtIn && <Badge variant="outline">{t('providers.builtIn')}</Badge>}
        </h1>
        <ProviderStatusBadge provider={provider} />
        {provider.statusMessage && (
          <p className="text-sm text-muted-foreground">{provider.statusMessage}</p>
        )}
        {provider.configuredFrom === 'environment' && (
          <p className="text-sm text-warning">{t('providers.configuredFromEnv')}</p>
        )}
        {provider.builtIn && (
          <p className="text-sm text-muted-foreground">{t('providers.builtInNote')}</p>
        )}
        {!provider.builtIn && !canManage && (
          <p className="text-xs text-muted-foreground">{t('providers.readOnly')}</p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {!provider.builtIn && (
          <Section title={t('providers.connection')}>
            {provider.lastCheck && (
              <p className="text-xs text-muted-foreground">
                {t('providers.lastCheck')}: {new Date(provider.lastCheck.at).toLocaleString()} ·{' '}
                {provider.lastCheck.ok ? t('providers.checkOk') : t('providers.checkFailed')}
              </p>
            )}
            <ProviderConnectionForm
              key={provider.updatedAt ?? 'never'}
              provider={provider}
              canManage={canManage}
            />
          </Section>
        )}

        {hasWebhook && (
          <Section title={t('providers.webhook')}>
            <ProviderWebhookCard provider={provider} canManage={canManage} />
          </Section>
        )}

        <Section title={t('providers.channels')} hint={t('providers.channelsHint')}>
          <ul className="space-y-2">
            {provider.channels.map((channel) => (
              <li
                key={`${channel.direction}:${channel.code}`}
                className="rounded-lg border border-border p-3 text-xs"
              >
                <p className="font-semibold text-foreground">
                  {channel.label}
                  <span className="font-normal text-muted-foreground">
                    {' · '}
                    {channel.direction === 'deposit'
                      ? t('providers.direction.deposit')
                      : t('providers.direction.payout')}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">{flowLabel(channel)}</p>
                {destinationLabel(channel) && (
                  <p className="text-muted-foreground">{destinationLabel(channel)}</p>
                )}
                {/* What moves at the provider when it is not the wallet
                    currency, and what a hosted deposit credits (backend 0173). */}
                {channel.assetLabel && (
                  <p className="text-muted-foreground">
                    {t('providers.assetAtPar', { asset: channel.assetLabel })}
                  </p>
                )}
                {channel.creditPolicy && (
                  <p className="text-muted-foreground">
                    {t(
                      channel.creditPolicy === 'received'
                        ? 'providers.creditPolicy.received'
                        : 'providers.creditPolicy.exact',
                    )}
                  </p>
                )}
                <ChannelSwitch provider={provider} channel={channel} canManage={canManage} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('providers.methods')}>
          {provider.methods.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('providers.methodsNone')}</p>
          ) : (
            <ul className="space-y-2">
              {provider.methods.map((method) => (
                <li
                  key={`${method.direction}:${method.key}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <Link
                    href={
                      method.direction === 'deposit' ? '/payment-methods' : '/withdrawal-methods'
                    }
                    className="font-semibold text-foreground hover:underline focus-outline"
                  >
                    {method.internalLabel}
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      {method.direction === 'deposit'
                        ? t('providers.methodDeposit')
                        : t('providers.methodPayout')}
                    </span>
                  </Link>
                  <span className="flex items-center gap-1.5">
                    {method.paidBy && (
                      <span className="text-muted-foreground">
                        {method.paidBy === 'provider'
                          ? t('providers.paidBy.provider', { provider: provider.name })
                          : t('providers.paidBy.desk')}
                      </span>
                    )}
                    <AvailabilityBadge availability={method.availability} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('providers.last24h')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('providers.stat.total')} value={provider.last24h.total} />
            <Stat label={t('providers.stat.succeeded')} value={provider.last24h.succeeded} />
            <Stat label={t('providers.stat.failed')} value={provider.last24h.failed} />
            <Stat label={t('providers.stat.pending')} value={provider.last24h.pending} />
          </dl>
        </Section>
      </div>

      {!provider.builtIn && (
        <Section title={t('providers.events')} hint={t('providers.eventsHint')}>
          <ProviderEvents code={provider.code} />
        </Section>
      )}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <header className="space-y-1">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
