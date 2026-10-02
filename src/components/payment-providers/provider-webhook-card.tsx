'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentProvider, RotatedProviderSecret } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/loader';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { CopyBlock, ReadonlyRow } from './copy-controls';
import { BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './provider-connection-form';

/**
 * Where a provider delivers its events, and the key it signs them with.
 *
 * The key is OURS and GENERATED: shown in plaintext exactly once, in the modal,
 * then only by fingerprint. The operator pastes it with the address into the
 * provider's dashboard. Rendered only for a provider that declares a generated
 * secret.
 */
export function ProviderWebhookCard({
  provider,
  canManage,
}: {
  provider: PaymentProvider;
  canManage: boolean;
}) {
  const key = provider.settings.find((s) => s.generated);
  const [minted, setMinted] = React.useState<RotatedProviderSecret | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const rotate = useMutation({
    mutationFn: (name: string) => api.admin.rotatePaymentProviderSecret(provider.code, name),
    onSuccess: (result) => {
      setError(null);
      setMinted(result);
      void queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() });
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('providers.rotateFailed'))),
  });

  if (!key) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('providers.webhookHint', { provider: provider.name })}
      </p>
      <ReadonlyRow
        label={t('providers.webhookEndpoint')}
        value={provider.webhookEndpoint ?? t('providers.webhookEndpointUnset')}
        copyable={provider.webhookEndpoint !== null}
      />
      <ReadonlyRow
        label={t('providers.fingerprint')}
        value={key.fingerprint ?? t('providers.keyNone')}
        copyable={false}
      />
      <ReadonlyRow
        label={t('providers.lastEvent')}
        value={
          provider.lastEventAt
            ? new Date(provider.lastEventAt).toLocaleString()
            : t('providers.never')
        }
        copyable={false}
      />
      {canManage && (
        <>
          <button
            type="button"
            disabled={rotate.isPending}
            onClick={() => rotate.mutate(key.name)}
            className={SECONDARY_BUTTON_CLASS}
          >
            {rotate.isPending ? (
              <Spinner />
            ) : (
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{key.isSet ? t('providers.rotate') : t('providers.generate')}</span>
          </button>
          {key.isSet && <p className="text-xs text-warning">{t('providers.rotateWarning')}</p>}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Closing this is the last time the key exists outside the provider's
          dashboard and the encrypted row. */}
      <Modal
        busy={rotate.isPending}
        open={minted !== null}
        onClose={() => setMinted(null)}
        title={t('providers.mintedTitle')}
        description={t('providers.mintedDescription')}
      >
        {minted && (
          <div className="space-y-3">
            <CopyBlock label={t('providers.mintedKey')} value={minted.secret} />
            {minted.webhookEndpoint && (
              <CopyBlock label={t('providers.webhookEndpoint')} value={minted.webhookEndpoint} />
            )}
            <button type="button" onClick={() => setMinted(null)} className={BUTTON_CLASS}>
              {t('providers.mintedDone')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
