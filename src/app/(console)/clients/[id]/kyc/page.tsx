'use client';

import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { ClientNotFound } from '@/components/clients/profile/profile-cards';
import { KycAssistPage } from '@/components/kyc-assist/kyc-assist-page';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';

/**
 * "Complete KYC" (backend 0210): staff do a client's KYC for them — for clients
 * who cannot do it themselves. Nested under the client, so it opens with
 * `clients.view`; the API answers 403 without `kyc.assist`, shown as the
 * closed-door card, and 404 for a client this reader cannot see, shown exactly
 * as a missing one.
 */
export default function CompleteKycRoute() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const query = useResource(keys.kyc.assist(clientId), (signal) =>
    api.admin.getKycAssist(clientId, signal),
  );

  if (query.status === 'notFound') return <ClientNotFound />;
  if (query.status !== 'ready' || !query.data)
    return (
      <AsyncBoundary
        status={query.status}
        label={t('kycAssist.loading')}
        endpoints={[`GET /admin/kyc/${clientId}/assist`]}
        onRetry={query.refetch}
        errorMessage={t('kycAssist.loadFailed')}
        error={query.error}
        fill
      >
        {null}
      </AsyncBoundary>
    );

  return <KycAssistPage clientId={clientId} view={query.data} />;
}
