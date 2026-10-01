'use client';

import { countryRuleBadge } from '@/components/payment-methods/country-rule-section';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentMethod, PaymentProvider } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { MethodNameCell } from '@/components/payment-methods/method-name-cell';
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

  const router = useRouter();

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

  // Settings live on their own page (owner, 1 Oct 2026): too much for a dialog.
  const openCreate = () => router.push('/payment-methods/new');
  const openEdit = (method: PaymentMethod) =>
    router.push(`/payment-methods/${encodeURIComponent(method.key)}`);

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
      cell: (m) => {
        // A country rule (backend 0178) narrows who sees it — said beside "Offered".
        const rule = countryRuleBadge(m.countryRule, m.countryCodes);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <AvailabilityBadge availability={m.availability} />
            {rule && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {rule}
              </span>
            )}
          </div>
        );
      },
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
    </div>
  );
}
