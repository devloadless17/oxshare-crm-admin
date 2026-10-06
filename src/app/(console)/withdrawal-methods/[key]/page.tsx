'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentProvider, WithdrawalMethod } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { WithdrawalMethodForm } from '@/components/withdrawal-methods/withdrawal-method-form';
import { useSaveWithdrawalMethod } from '@/components/withdrawal-methods/use-save-withdrawal-method';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * ONE WITHDRAWAL METHOD'S SETTINGS, as a page (owner, 1 Oct 2026): names,
 * route, logo, on/off and who can use it. `/withdrawal-methods/new` creates one.
 */
export default function WithdrawalMethodPage() {
  const params = useParams();
  const router = useRouter();
  const key = typeof params.key === 'string' ? decodeURIComponent(params.key) : '';
  const creating = key === 'new';
  const { admin } = useAdmin();

  const methods = useResource<WithdrawalMethod[]>(keys.withdrawalMethods.all(), (signal) =>
    api.admin.getWithdrawalMethods(signal),
  );
  // The routes offered need the providers; without the key, the desk's route only.
  const providers = useResource<PaymentProvider[]>(
    keys.paymentProviders.all(),
    (signal) => api.admin.getPaymentProviders(signal),
    { enabled: hasPermission(admin, 'payments.providers.view') },
  );
  const method = creating ? undefined : methods.data?.find((m) => m.key === key);
  const save = useSaveWithdrawalMethod(method?.key);
  const back = () => router.push('/withdrawal-methods');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/withdrawal-methods"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('withdrawalMethods.backToList')}
      </Link>

      <AsyncBoundary
        status={methods.status}
        label={t('withdrawalMethods.loading')}
        endpoints={['GET /admin/withdrawal-methods']}
        onRetry={methods.refetch}
        errorMessage={t('withdrawalMethods.loadFailed')}
        error={methods.error}
      >
        {!creating && !method ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {t('withdrawalMethods.notFound')}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {method ? method.internalLabel : t('withdrawalMethods.createTitle')}
            </h1>
            <WithdrawalMethodForm
              key={method?.key ?? 'new'}
              method={method}
              providers={providers.data}
              saving={save.isPending}
              error={
                save.isError
                  ? apiErrorMessage(save.error, t('withdrawalMethods.saveFailed'))
                  : undefined
              }
              fieldErrors={save.isError ? apiFieldErrors(save.error) : {}}
              onClose={back}
              onSubmit={(values) =>
                save.mutate(values, {
                  onSuccess: () => {
                    toastSuccess(
                      t('withdrawalMethods.saveSucceeded', { name: values.internalLabel }),
                    );
                    back();
                  },
                })
              }
            />
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
