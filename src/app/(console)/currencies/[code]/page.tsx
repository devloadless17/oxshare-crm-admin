'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import api from '@/lib/api';
import type { Currency } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { CurrencyForm, type CurrencyFormValues } from '@/components/currencies/currency-form';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * ONE CURRENCY'S SETTINGS, as a page (owner, 1 Oct 2026): its name, decimals and
 * money limits. `/currencies/new` adds one.
 */
export default function CurrencyPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const code = typeof params.code === 'string' ? decodeURIComponent(params.code) : '';
  const creating = code === 'new';

  const currencies = useResource<Currency[]>(keys.currencies.all(), (signal) =>
    api.admin.getCurrencies(signal),
  );
  const currency = creating ? undefined : currencies.data?.find((c) => c.code === code);
  const back = () => router.push('/currencies');

  const save = useMutation({
    mutationFn: (values: CurrencyFormValues) => {
      if (currency) {
        /*
         * `code` is never sent on update — it is the primary key. `isDefault:
         * false` is withheld too: the API refuses an explicit un-defaulting (a
         * platform always has one), and an unchanged box must not trigger it.
         */
        const { code: _code, isDefault, ...rest } = values;
        return api.admin.updateCurrency(currency.code, {
          ...rest,
          ...(isDefault ? { isDefault: true } : {}),
        });
      }
      return api.admin.createCurrency(values);
    },
    onSuccess: async (_data, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.currencies.all() });
      toastSuccess(t('currencies.saveSucceeded', { code: currency?.code ?? values.code }));
      back();
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/currencies"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('currencies.backToList')}
      </Link>

      <AsyncBoundary
        status={currencies.status}
        label={t('currencies.loading')}
        endpoints={['GET /admin/currencies']}
        onRetry={currencies.refetch}
        errorMessage={t('currencies.loadFailed')}
        error={currencies.error}
      >
        {!creating && !currency ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {t('currencies.notFound')}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {currency ? `${currency.code} · ${currency.name}` : t('currencies.createTitle')}
            </h1>
            <CurrencyForm
              key={currency?.code ?? 'new'}
              currency={currency}
              saving={save.isPending}
              error={
                save.isError ? apiErrorMessage(save.error, t('currencies.saveFailed')) : undefined
              }
              fieldErrors={save.isError ? apiFieldErrors(save.error) : {}}
              onClose={back}
              onSubmit={(values) => save.mutate(values)}
            />
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
