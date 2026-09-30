import { Badge } from '@/components/ui/badge';
import type {
  PaymentProvider,
  PaymentProviderChannel,
  PaymentProviderMethod,
} from '@/lib/api/admin';
import { t, type MessageKey } from '@/lib/i18n';

/*
 * The one vocabulary for payment providers (backend 0168): every screen that
 * names a provider's state, a channel or whether a method is offered reads it
 * from here, so the providers page, the method lists and the dialogs cannot
 * drift into five names for one thing.
 */

type Status = PaymentProvider['status'];

const STATUS_VARIANT: Record<Status, 'success' | 'warning' | 'destructive' | 'default'> = {
  connected: 'success',
  unverified: 'warning',
  failing: 'destructive',
  off: 'default',
  not_configured: 'default',
  sandbox_refused: 'destructive',
};

export function ProviderStatusBadge({ provider }: { provider: PaymentProvider }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={STATUS_VARIANT[provider.status]}>
        {t(`providers.status.${provider.status}` as MessageKey)}
      </Badge>
      {provider.environment === 'sandbox' && (
        <Badge variant="warning">{t('providers.sandbox')}</Badge>
      )}
    </span>
  );
}

export function flowLabel(channel: Pick<PaymentProviderChannel, 'flow'>): string {
  return t(`providers.flow.${channel.flow}` as MessageKey);
}

/** What a payout channel asks the client for; null on a deposit channel. */
export function destinationLabel(channel: PaymentProviderChannel): string | null {
  if (!channel.destinationKind) return null;
  if (channel.destinationKind === 'crypto_address' && channel.destinationNetwork) {
    return t('providers.destination.cryptoNetwork', { network: channel.destinationNetwork });
  }
  return t(`providers.destination.${channel.destinationKind}` as MessageKey);
}

const AVAILABILITY_VARIANT: Record<
  PaymentProviderMethod['availability'],
  'success' | 'warning' | 'default'
> = {
  offered: 'success',
  disabled: 'default',
  provider_off: 'warning',
  provider_not_configured: 'warning',
  // Backend 0173: its network is switched off in this direction.
  channel_off: 'warning',
};

export function AvailabilityBadge({
  availability,
}: {
  availability: PaymentProviderMethod['availability'];
}) {
  return (
    <Badge variant={AVAILABILITY_VARIANT[availability]}>
      {t(`providers.availability.${availability}` as MessageKey)}
    </Badge>
  );
}

/** "Rival · Whish": the provider and the channel a method runs on. */
export function routeLabel(
  providers: readonly PaymentProvider[] | undefined,
  route: { providerCode: string; channelCode: string },
  direction: 'deposit' | 'payout',
): string {
  const provider = providers?.find((p) => p.code === route.providerCode);
  const channel = provider?.channels.find(
    (c) => c.code === route.channelCode && c.direction === direction,
  );
  return `${provider?.name ?? route.providerCode} · ${channel?.label ?? route.channelCode}`;
}

/**
 * A provider's name where the providers list is not loaded (a desk admin may
 * not view Payment providers): its code, capitalised — `rival` → "Rival".
 */
export function providerDisplayName(code: string): string {
  return code.charAt(0).toUpperCase() + code.slice(1);
}
