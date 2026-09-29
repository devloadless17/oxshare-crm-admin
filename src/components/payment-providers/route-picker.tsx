'use client';

import type { PaymentProvider, PaymentProviderChannel } from '@/lib/api/admin';
import { Label } from '@/components/ui/label';
import { t, type MessageKey } from '@/lib/i18n';
import { destinationLabel, flowLabel } from './provider-labels';

export interface MethodRoute {
  providerCode: string;
  channelCode: string;
}

/** The route a new method takes when nobody picks one: the desk. */
export const DEFAULT_ROUTE: Record<'deposit' | 'payout', MethodRoute> = {
  deposit: { providerCode: 'manual', channelCode: 'offline' },
  payout: { providerCode: 'manual', channelCode: 'desk' },
};

/** The channel a route names in one direction, when the providers are known. */
export function channelOf(
  providers: readonly PaymentProvider[] | undefined,
  route: MethodRoute,
  direction: 'deposit' | 'payout',
): { provider: PaymentProvider; channel: PaymentProviderChannel } | undefined {
  const provider = providers?.find((p) => p.code === route.providerCode);
  const channel = provider?.channels.find(
    (c) => c.code === route.channelCode && c.direction === direction,
  );
  return provider && channel ? { provider, channel } : undefined;
}

/**
 * "How clients pay" (backend 0168): which provider a method runs on, and on
 * which of its channels — only the channels of this direction a method may
 * bind, so a receipt can only be asked on a deposit paid outside and a cash
 * pickup only on a payout.
 *
 * FIXED once the method exists: a new route is a new method, so every past
 * transaction keeps saying how it was paid. Without `providers` (an admin who
 * cannot view Payment providers) the desk is the only route offered.
 */
export function RoutePicker({
  id,
  direction,
  value,
  onChange,
  fixed,
  providers,
}: {
  id: string;
  direction: 'deposit' | 'payout';
  value: MethodRoute;
  onChange: (route: MethodRoute) => void;
  fixed: boolean;
  providers: readonly PaymentProvider[] | undefined;
}) {
  const options = (providers ?? []).flatMap((provider) =>
    provider.channels
      .filter((c) => c.direction === direction && c.bindable)
      .map((channel) => ({ provider, channel })),
  );
  const chosen = channelOf(providers, value, direction);
  const describe = chosen ? describeChannel(chosen.channel) : null;
  const title = direction === 'deposit' ? t('paymentMethods.route') : t('withdrawalMethods.route');
  const hint =
    direction === 'deposit' ? t('paymentMethods.routeHint') : t('withdrawalMethods.routeHint');

  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-foreground">{title}</legend>
      {fixed || options.length === 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">
            {chosen
              ? `${chosen.provider.name} · ${chosen.channel.label}`
              : `${value.providerCode} · ${value.channelCode}`}
          </p>
          {describe && <p className="text-[11px] text-muted-foreground">{describe}</p>}
          <p className="text-[11px] text-muted-foreground">
            {fixed
              ? t('paymentMethods.routeFixed')
              : direction === 'deposit'
                ? t('paymentMethods.routeDeskOnly')
                : t('withdrawalMethods.routeDeskOnly')}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="sr-only">
            {title}
          </Label>
          <select
            id={id}
            value={`${value.providerCode}:${value.channelCode}`}
            onChange={(e) => {
              const [providerCode = '', channelCode = ''] = e.target.value.split(':');
              onChange({ providerCode, channelCode });
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus-outline"
          >
            {options.map(({ provider, channel }) => (
              <option
                key={`${provider.code}:${channel.code}`}
                value={`${provider.code}:${channel.code}`}
              >
                {`${provider.name} · ${channel.label}`}
                {provider.usable
                  ? ''
                  : ` (${t(`providers.status.${provider.status}` as MessageKey)})`}
              </option>
            ))}
          </select>
          {describe && <p className="text-[11px] text-muted-foreground">{describe}</p>}
          <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
      )}
    </fieldset>
  );
}

function describeChannel(channel: PaymentProviderChannel): string {
  const destination = destinationLabel(channel);
  return destination ? `${flowLabel(channel)}. ${destination}.` : `${flowLabel(channel)}.`;
}

/** Whether a receipt can be asked on a deposit route (unknown providers: the desk's own rule). */
export function routeAcceptsReceipt(
  providers: readonly PaymentProvider[] | undefined,
  route: MethodRoute,
): boolean {
  const found = channelOf(providers, route, 'deposit');
  if (found) return found.channel.acceptsReceipt;
  return route.providerCode === 'manual' && route.channelCode === 'offline';
}
