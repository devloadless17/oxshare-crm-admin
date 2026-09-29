'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentMethod, PaymentProvider } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { MethodNameCell } from '@/components/payment-methods/method-name-cell';
import {
  PaymentMethodFormModal,
  type PaymentMethodFormValues,
} from '@/components/payment-methods/payment-method-form-modal';
import { AvailabilityBadge, routeLabel } from '@/components/payment-providers/provider-labels';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const METHOD_PAGING = { noun: ['method', 'methods'] as [string, string] };

export default function PaymentMethodsPage() {
  const { admin } = useAdmin();
  /*
   * There is no `payments.delete`: `payments.edit` deletes only a method NO
   * transaction references (a typo, a test row). A used one is DISABLED, because
   * its deposits must keep naming it — the API refuses the delete (0161).
   */
  const canCreate = hasPermission(admin, 'payments.create');
  const canEdit = hasPermission(admin, 'payments.edit');
  const canManage = canCreate || canEdit;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<PaymentMethod | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<PaymentMethod[]>(keys.paymentMethods.all(), (signal) =>
    api.admin.getPaymentMethods(signal),
  );
  /*
   * The providers, for "Runs on" and the dialog's routes (backend 0168). Their
   * own key: an admin without it still manages methods, on the desk's route,
   * and reads a route by its codes.
   */
  const canViewProviders = hasPermission(admin, 'payments.providers.view');
  const providers = useResource<PaymentProvider[]>(
    keys.paymentProviders.all(),
    (signal) => api.admin.getPaymentProviders(signal),
    { enabled: canViewProviders },
  );

  // A provider's page lists its methods, so a method change moves it too.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.paymentMethods.all() }),
      queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() }),
    ]);

  const saveMethod = useMutation({
    mutationFn: (values: PaymentMethodFormValues) => {
      /*
       * An empty logo is OMITTED rather than sent blank. The field is nullable
       * on the wire and the API treats absent and empty differently — `''` would
       * store an empty string where "no logo" means null.
       *
       * No `sortOrder` (owner, 26 Sep 2026): the API puts a new method last and
       * leaves an edited one where it is.
       */
      const body = {
        internalLabel: values.internalLabel,
        name: values.name,
        currency: values.currency,
        logoUrl: values.logoUrl === '' ? undefined : values.logoUrl,
        enabled: values.enabled,
        /*
         * ⚠️ EVERY FIELD ON THE FORM MUST BE LISTED HERE, and nothing checks it.
         *
         * This object is built field by field on purpose — a spread would ship
         * whatever the form happens to hold — but the update DTO's fields are all
         * OPTIONAL, so a field left out is not a type error. It is a save that
         * returns 200 and changes nothing.
         *
         * That is exactly what happened to `requiresProof`: the checkbox ticked,
         * the API accepted the shape, the toast said saved, and the flag stayed
         * false — so the method never asked a client for a receipt. Reported from
         * production.
         */
        requiresProof: values.requiresProof,
        // The method's own range (0162) — null clears it back to the currency's.
        ownMinAmount: values.ownMinAmount,
        ownMaxAmount: values.ownMaxAmount,
        // The details an offline method asks for — the whole list, in order.
        proofFields: values.proofFields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required,
          enabled: field.enabled,
          hint: field.hint,
        })),
      };

      // No key is ever sent: the API generates a new method's permanent ID, and
      // an existing one is addressed by it, never changes it (backend 0161).
      if (editing) return api.admin.updatePaymentMethod(editing.key, body);
      // The route is chosen once, at creation, and fixed after (backend 0168).
      return api.admin.createPaymentMethod({
        ...body,
        providerCode: values.route.providerCode,
        channelCode: values.route.channelCode,
      });
    },
    onSuccess: async (_data, values) => {
      const name = values.internalLabel;
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
          ? t('paymentMethods.disabledSucceeded', { name: method.internalLabel })
          : t('paymentMethods.enabledSucceeded', { name: method.internalLabel }),
      );
    },
    /*
     * This toggle had NO error handling: a failed enable left the switch in its
     * old position with nothing said, which reads as the control being stuck.
     */
    onError: (error) => toastError(error, t('paymentMethods.saveFailed')),
  });

  const remove = useMutation({
    mutationFn: (method: PaymentMethod) => api.admin.deletePaymentMethod(method.key),
    onSuccess: async (_data, method) => {
      await invalidate();
      toastSuccess(t('paymentMethods.deleted', { name: method.internalLabel }));
    },
    onError: (error) => toastError(error, t('paymentMethods.deleteFailed')),
  });

  const confirmDelete = async (method: PaymentMethod) => {
    const ok = await confirm({
      title: t('paymentMethods.confirmDeleteTitle', { name: method.internalLabel }),
      description: t('paymentMethods.confirmDelete'),
      confirmLabel: t('paymentMethods.delete'),
      destructive: true,
    });
    if (ok) remove.mutate(method);
  };

  const togglingKey = toggleEnabled.isPending
    ? toggleEnabled.variables?.key
    : remove.isPending
      ? remove.variables?.key
      : undefined;

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
      header: t('paymentMethods.colName'),
      cell: (m) => (
        <MethodNameCell internalLabel={m.internalLabel} name={m.name} logoUrl={m.logoUrl} />
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
      /*
       * WHICH FLOW a method runs, stated in the list.
       *
       * It is one boolean, and it decides everything the client sees: whether
       * the deposit screen asks for a receipt, which endpoint files it, and
       * whether it queues in Approvals → Deposits. With it visible only inside
       * the edit dialog, a method that silently failed to save its flag looked
       * identical to one that saved — which is how a method sat in production
       * offering no receipt field and nobody could tell why.
       */
      header: t('paymentMethods.colFlow'),
      // "Rival · Whish", or "Manual · Paid outside the platform" (backend 0168).
      cell: (m) => (
        <span className="text-xs">
          {routeLabel(providers.data, m, 'deposit')}
          {m.requiresProof && (
            <span className="block text-muted-foreground">{t('paymentMethods.requiresProof')}</span>
          )}
        </span>
      ),
    },
    {
      header: t('paymentMethods.colStatus'),
      /*
       * Whether clients SEE it — not just the switch. Enabled on a provider that
       * is off or not set up is hidden from every client, and says so here
       * rather than only in a server log (backend 0168).
       */
      cell: (m) => <AvailabilityBadge availability={m.availability} />,
    },
    ...(canManage
      ? [
          actionsColumn<PaymentMethod>(
            (m) => (
              <RowActions
                label={t('table.rowActions', { name: m.internalLabel })}
                busy={togglingKey === m.key}
                items={[
                  { label: t('paymentMethods.edit'), icon: Pencil, onSelect: () => openEdit(m) },
                  {
                    label: m.enabled ? t('paymentMethods.disable') : t('paymentMethods.enable'),
                    icon: m.enabled ? EyeOff : Eye,
                    separatorBefore: true,
                    onSelect: () => toggleEnabled.mutate(m),
                  },
                  // A used method is shown disabled with the reason, not hidden.
                  ...(canEdit
                    ? [
                        {
                          label: m.inUse
                            ? t('paymentMethods.deleteInUse')
                            : t('paymentMethods.delete'),
                          icon: Trash2,
                          destructive: true,
                          disabled: m.inUse,
                          onSelect: () => void confirmDelete(m),
                        },
                      ]
                    : []),
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
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
        providers={providers.data}
        saving={saveMethod.isPending}
        error={
          saveMethod.isError
            ? apiErrorMessage(saveMethod.error, t('paymentMethods.saveFailed'))
            : undefined
        }
        fieldErrors={saveMethod.isError ? apiFieldErrors(saveMethod.error) : {}}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMethod.mutate(values)}
      />
    </div>
  );
}
