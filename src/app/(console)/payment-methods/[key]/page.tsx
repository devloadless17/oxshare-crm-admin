'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentMethod, PaymentProvider } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { PaymentMethodForm } from '@/components/payment-methods/payment-method-form';
import { useSavePaymentMethod } from '@/components/payment-methods/use-save-payment-method';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * ONE DEPOSIT METHOD'S SETTINGS, as a page (owner, 1 Oct 2026): names and
 * route, limits, receipt and details, who can use it. `/payment-methods/new`
 * creates one. Replaces the dialog, which had grown past what a pop-up holds.
 */
export default function PaymentMethodPage() {
  const params = useParams();
  const router = useRouter();
  const key = typeof params.key === 'string' ? decodeURIComponent(params.key) : '';
  const creating = key === 'new';
  const { admin } = useAdmin();

  const methods = useResource<PaymentMethod[]>(keys.paymentMethods.all(), (signal) =>
    api.admin.getPaymentMethods(signal),
  );
  // The routes offered need the providers; without the key, the desk's route only.
  const providers = useResource<PaymentProvider[]>(
    keys.paymentProviders.all(),
    (signal) => api.admin.getPaymentProviders(signal),
    { enabled: hasPermission(admin, 'payments.providers.view') },
  );
  const method = creating ? undefined : methods.data?.find((m) => m.key === key);
  const save = useSavePaymentMethod(method?.key);
  const back = () => router.push('/payment-methods');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/payment-methods"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('paymentMethods.backToList')}
      </Link>

      <AsyncBoundary
        status={methods.status}
        label={t('paymentMethods.loading')}
        endpoints={['GET /admin/payment-methods']}
        onRetry={methods.refetch}
        errorMessage={t('paymentMethods.loadFailed')}
        error={methods.error}
      >
        {!creating && !method ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {t('paymentMethods.notFound')}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {method ? method.internalLabel : t('paymentMethods.createTitle')}
            </h1>
            <PaymentMethodForm
              key={method?.key ?? 'new'}
              method={method}
              providers={providers.data}
              saving={save.isPending}
              error={
                save.isError
                  ? apiErrorMessage(save.error, t('paymentMethods.saveFailed'))
                  : undefined
              }
              fieldErrors={save.isError ? apiFieldErrors(save.error) : {}}
              onClose={back}
              onSubmit={(values) =>
                save.mutate(values, {
                  onSuccess: () => {
                    toastSuccess(t('paymentMethods.saveSucceeded', { name: values.internalLabel }));
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
