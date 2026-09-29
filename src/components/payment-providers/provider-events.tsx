'use client';

import { Activity } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentProviderEvent } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const OUTCOME_VARIANT: Record<string, 'success' | 'default' | 'warning' | 'destructive'> = {
  applied: 'success',
  ignored: 'default',
  rejected: 'destructive',
  failed: 'warning',
};

/**
 * What the provider reported and what the platform did about it — the
 * provider's event log (backend 0168), newest first. One row per fact: a
 * retried webhook and the poller reporting the same payment are one row.
 */
export function ProviderEvents({ code }: { code: string }) {
  const events = useResource<PaymentProviderEvent[]>(keys.paymentProviders.events(code), (signal) =>
    api.admin.getPaymentProviderEvents(code, signal),
  );

  const columns: Column<PaymentProviderEvent>[] = [
    {
      header: t('providers.col.when'),
      cell: (e) => (
        <span className="whitespace-nowrap text-xs">{new Date(e.receivedAt).toLocaleString()}</span>
      ),
    },
    {
      header: t('providers.col.event'),
      cell: (e) => (
        <span className="text-xs" title={e.providerType ?? undefined}>
          {labelOrRaw(`providers.event.${e.eventType}`, e.eventType)}
        </span>
      ),
    },
    {
      header: t('providers.col.source'),
      cell: (e) => (
        <span className="text-xs">{labelOrRaw(`providers.source.${e.source}`, e.source)}</span>
      ),
    },
    {
      header: t('providers.col.outcome'),
      cell: (e) => (
        <Badge variant={OUTCOME_VARIANT[e.outcome] ?? 'default'}>
          {labelOrRaw(`providers.outcome.${e.outcome}`, e.outcome)}
        </Badge>
      ),
    },
    {
      header: t('providers.col.details'),
      cell: (e) => <span className="text-xs text-muted-foreground">{e.reason ?? '—'}</span>,
    },
  ];

  return (
    <AsyncBoundary
      status={events.status}
      label={t('providers.eventsLoading')}
      endpoints={['GET /admin/payment-providers/:code/events']}
      onRetry={events.refetch}
      errorMessage={t('providers.eventsLoadFailed')}
      error={events.error}
    >
      <DataTable
        caption={t('providers.eventsCaption')}
        columns={columns}
        rows={events.data ?? []}
        rowKey={(e) => e.id}
        empty={<EmptyState icon={Activity} message={t('providers.eventsEmpty')} />}
      />
    </AsyncBoundary>
  );
}

/** A value the API may extend (a new event type) reads raw rather than as a missing key. */
function labelOrRaw(key: string, raw: string): string {
  const label = t(key as MessageKey);
  return label === undefined || label === key ? raw : label;
}
