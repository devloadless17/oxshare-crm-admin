'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentMethod } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { assetUrl } from '@/lib/asset-url';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import {
  PaymentMethodFormModal,
  type PaymentMethodFormValues,
} from '@/components/payment-methods/payment-method-form-modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const METHOD_PAGING = { noun: ['method', 'methods'] as [string, string] };

export default function PaymentMethodsPage() {
  const { admin } = useAdmin();
  /*
   * There is no `payments.delete`: a method is DISABLED rather than removed,
   * because deleting one would orphan every deposit that used it (0043). So the
   * split is create and edit only, and the enable/disable toggle is an EDIT.
   */
  const canCreate = hasPermission(admin, 'payments.create');
  const canEdit = hasPermission(admin, 'payments.edit');
  const canManage = canCreate || canEdit;
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState<PaymentMethod | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<PaymentMethod[]>(keys.paymentMethods.all(), (signal) =>
    api.admin.getPaymentMethods(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.paymentMethods.all() });

  const saveMethod = useMutation({
    mutationFn: (values: PaymentMethodFormValues) => {
      /*
       * An empty logo is OMITTED rather than sent blank. The field is nullable
       * on the wire and the API treats absent and empty differently — `''` would
       * store an empty string where "no logo" means null.
       *
       * `sortOrder` is carried through rather than asked for: it is not on the
       * form, but dropping it from the payload would blank an existing method's
       * presentation order on the next edit.
       */
      const body = {
        name: values.name,
        currency: values.currency,
        logoUrl: values.logoUrl === '' ? undefined : values.logoUrl,
        enabled: values.enabled,
        sortOrder: values.sortOrder,
      };

      if (editing) {
        return api.admin.updatePaymentMethod(editing.key, body);
      }
      return api.admin.createPaymentMethod({ ...body, key: values.key });
    },
    onSuccess: async (_data, values) => {
      // Read before `editing` is cleared: `key` is the primary key and an
      // update's payload omits it.
      const name = editing?.name ?? values.name;
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('paymentMethods.saveSucceeded', { name }));
    },
    // Inline in the form modal, which stays open on failure.
  });

  const toggleEnabled = useMutation({
    mutationFn: (method: PaymentMethod) =>
      api.admin.updatePaymentMethod(method.key, { enabled: !method.enabled }),
    onSuccess: async (_data, method) => {
      await invalidate();
      /*
       * The NEW state — `method.enabled` is the value before the write, so the
       * branch reads inverted. This is the toggle that decides whether clients
       * can deposit through a provider at all, so the confirmation says which
       * way it went rather than only that something happened.
       */
      toastSuccess(
        method.enabled
          ? t('paymentMethods.disabledSucceeded', { name: method.name })
          : t('paymentMethods.enabledSucceeded', { name: method.name }),
      );
    },
    /*
     * This toggle had NO error handling: a failed enable left the switch in its
     * old position with nothing said, which reads as the control being stuck.
     */
    onError: (error) => toastError(error, t('paymentMethods.saveFailed')),
  });

  const togglingKey = toggleEnabled.isPending ? toggleEnabled.variables?.key : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveMethod.reset();
    setFormOpen(true);
  };

  const openEdit = (method: PaymentMethod) => {
    setEditing(method);
    saveMethod.reset();
    setFormOpen(true);
  };

  const columns: Column<PaymentMethod>[] = [
    {
      header: t('paymentMethods.colKey'),
      cell: (m) => <span className="font-mono font-semibold">{m.key}</span>,
    },
    {
      header: t('paymentMethods.colName'),
      cell: (m) => (
        <div className="flex items-center gap-2">
          {/*
            Through `assetUrl`, NEVER the stored value raw. The API returns
            `/v1/uploads/…`, which the browser resolves against THIS app's origin
            — where no `/v1` route exists — so a raw src 404'd on every uploaded
            logo while the upload itself reported success.
          */}
          {/*
            FIXED HEIGHT, AUTO WIDTH — not a square.

            A payment brand mark is usually a WORDMARK: the Whish logo is
            123×27, a 4.5:1 ratio. Constrained to `h-5 w-5`, `object-contain`
            honoured the ratio by shrinking it to 20×4.5px — a legible logo
            rendered as an unreadable sliver, which looks like a broken file.
            Height is what should be uniform down a column of rows; width
            follows the artwork, capped so a very wide mark cannot push the name
            out of the row.
          */}
          {assetUrl(m.logoUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(m.logoUrl)}
              alt=""
              aria-hidden="true"
              className="h-5 w-auto max-w-20 shrink-0 rounded object-contain"
            />
          )}
          <span>{m.name}</span>
        </div>
      ),
    },
    /*
     * What a deposit through this method is denominated in, and therefore which
     * wallet the client's money lands in. On the table because it is the one
     * property of a method that is invisible until it is wrong — a crypto method
     * created as USD looks identical here to one created as USDT.
     */
    {
      header: t('paymentMethods.colCurrency'),
      cell: (m) => <span className="font-mono">{m.currency}</span>,
    },
    {
      header: t('paymentMethods.colStatus'),
      cell: (m) =>
        m.enabled ? (
          <span className="text-success">{t('paymentMethods.statusEnabled')}</span>
        ) : (
          <span className="text-muted-foreground">{t('paymentMethods.statusDisabled')}</span>
        ),
    },
    ...(canManage
      ? [
          actionsColumn<PaymentMethod>(
            (m) => (
              <RowActions
                label={t('table.rowActions', { name: m.name })}
                busy={togglingKey === m.key}
                items={[
                  { label: t('paymentMethods.edit'), icon: Pencil, onSelect: () => openEdit(m) },
                  {
                    label: m.enabled ? t('paymentMethods.disable') : t('paymentMethods.enable'),
                    icon: m.enabled ? EyeOff : Eye,
                    separatorBefore: true,
                    onSelect: () => toggleEnabled.mutate(m),
                  },
                ]}
              />
            ),
            t('paymentMethods.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('paymentMethods.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('paymentMethods.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton resource="payment-methods" disabled={(query.data ?? []).length === 0} />
          {canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('paymentMethods.create')}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">{t('paymentMethods.readOnly')}</p>
          )}
        </div>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('paymentMethods.loading')}
        endpoints={['GET /admin/payment-methods']}
        onRetry={query.refetch}
        errorMessage={t('paymentMethods.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('paymentMethods.caption')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(m) => m.key}
          dimmed={query.isFetching}
          empty={<EmptyState icon={CreditCard} message={t('paymentMethods.empty')} />}
          clientPagination={METHOD_PAGING}
        />
      </AsyncBoundary>

      <PaymentMethodFormModal
        open={formOpen}
        method={editing}
        saving={saveMethod.isPending}
        error={
          saveMethod.isError
            ? apiErrorMessage(saveMethod.error, t('paymentMethods.saveFailed'))
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMethod.mutate(values)}
      />
    </div>
  );
}
