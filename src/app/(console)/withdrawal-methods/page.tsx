'use client';

import { countryRuleBadge } from '@/components/payment-methods/country-rule-section';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { PaymentProvider, WithdrawalMethod } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { MethodNameCell } from '@/components/payment-methods/method-name-cell';
import { AvailabilityBadge, routeLabel } from '@/components/payment-providers/provider-labels';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Withdrawal methods — the payout rails the portal's withdraw form offers.
 *
 * The twin of Deposit methods (`/payment-methods`), and shaped like it: every
 * method listed, disabled ones included; add, edit (the key too, 0161), enable
 * and disable, and delete one nobody used. `withdrawal_payment_methods` has existed since migration 0062 and the
 * withdraw form has always read it — until now it could only be changed in the
 * database.
 *
 * ## Why disable and not delete, once used
 *
 * Every withdrawal request names the rail it was made on, and the desk has to
 * be able to read that name when it settles the request. So a used method is
 * switched off — which stops it being offered — and never removed. Only one no
 * request references can be deleted.
 */
const METHOD_PAGING = { noun: ['method', 'methods'] as [string, string] };

export default function WithdrawalMethodsPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'payments.create');
  const canEdit = hasPermission(admin, 'payments.edit');
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const router = useRouter();

  const query = useResource<WithdrawalMethod[]>(keys.withdrawalMethods.all(), (signal) =>
    api.admin.getWithdrawalMethods(signal),
  );
  // The providers, for "Paid through" and the dialog's routes (backend 0168).
  const canViewProviders = hasPermission(admin, 'payments.providers.view');
  const providers = useResource<PaymentProvider[]>(
    keys.paymentProviders.all(),
    (signal) => api.admin.getPaymentProviders(signal),
    { enabled: canViewProviders },
  );

  // A provider's page lists its methods, so a method change moves it too.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.withdrawalMethods.all() }),
      queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() }),
    ]);

  const toggleEnabled = useMutation({
    mutationFn: (method: WithdrawalMethod) =>
      api.admin.updateWithdrawalMethod(method.key, { enabled: !method.enabled }),
    onSuccess: async (_data, method) => {
      await invalidate();
      toastSuccess(
        method.enabled
          ? t('withdrawalMethods.disabledSucceeded', { name: method.internalLabel })
          : t('withdrawalMethods.enabledSucceeded', { name: method.internalLabel }),
      );
    },
    onError: (error) => toastError(error, t('withdrawalMethods.saveFailed')),
  });

  const remove = useMutation({
    mutationFn: (method: WithdrawalMethod) => api.admin.deleteWithdrawalMethod(method.key),
    onSuccess: async (_data, method) => {
      await invalidate();
      toastSuccess(t('withdrawalMethods.deleted', { name: method.internalLabel }));
    },
    onError: (error) => toastError(error, t('withdrawalMethods.deleteFailed')),
  });

  const confirmDelete = async (method: WithdrawalMethod) => {
    const ok = await confirm({
      title: t('withdrawalMethods.confirmDeleteTitle', { name: method.internalLabel }),
      description: t('withdrawalMethods.confirmDelete'),
      confirmLabel: t('withdrawalMethods.delete'),
      destructive: true,
    });
    if (ok) remove.mutate(method);
  };

  const togglingKey = toggleEnabled.isPending
    ? toggleEnabled.variables?.key
    : remove.isPending
      ? remove.variables?.key
      : undefined;

  // Settings live on their own page (owner, 1 Oct 2026), like deposit methods.
  const openCreate = () => router.push('/withdrawal-methods/new');
  const openEdit = (method: WithdrawalMethod) =>
    router.push(`/withdrawal-methods/${encodeURIComponent(method.key)}`);

  const columns: Column<WithdrawalMethod>[] = [
    {
      header: t('withdrawalMethods.colName'),
      cell: (m) => (
        <MethodNameCell
          internalLabel={m.internalLabel}
          name={m.name}
          nameAr={m.nameAr}
          logoUrl={m.logoUrl}
        />
      ),
    },
    {
      /*
       * Who pays it now (backend 0168): Rival while it is on, the desk by hand
       * when it is not — the question the approve dialog also answers.
       */
      header: t('withdrawalMethods.colRoute'),
      cell: (m) => (
        <span className="text-xs">
          {routeLabel(providers.data, m, 'payout')}
          <span className="block text-muted-foreground">
            {m.paidBy === 'provider'
              ? t('providers.paidBy.provider', {
                  provider:
                    providers.data?.find((p) => p.code === m.providerCode)?.name ?? m.providerCode,
                })
              : t('providers.paidBy.desk')}
          </span>
        </span>
      ),
    },
    {
      header: t('withdrawalMethods.colStatus'),
      /*
       * Whether clients SEE it — not just the method's own switch. "Enabled"
       * alone read as offered while its network was switched off (reported
       * 30 Sep 2026: Whish Money "Enabled" here, missing from the portal). The
       * same badge as the deposit methods page and the provider page.
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
    ...(canEdit
      ? [
          actionsColumn<WithdrawalMethod>(
            (m) => (
              <RowActions
                label={t('table.rowActions', { name: m.internalLabel })}
                busy={togglingKey === m.key}
                items={[
                  { label: t('withdrawalMethods.edit'), icon: Pencil, onSelect: () => openEdit(m) },
                  {
                    label: m.enabled
                      ? t('withdrawalMethods.disable')
                      : t('withdrawalMethods.enable'),
                    icon: m.enabled ? EyeOff : Eye,
                    separatorBefore: true,
                    onSelect: () => toggleEnabled.mutate(m),
                  },
                  // A used method shows why it cannot be deleted.
                  {
                    label: m.inUse
                      ? t('withdrawalMethods.deleteInUse')
                      : t('withdrawalMethods.delete'),
                    icon: Trash2,
                    destructive: true,
                    disabled: m.inUse,
                    onSelect: () => void confirmDelete(m),
                  },
                ]}
              />
            ),
            t('withdrawalMethods.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('withdrawalMethods.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('withdrawalMethods.subtitle')}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('withdrawalMethods.create')}
          </button>
        ) : (
          !canEdit && (
            <p className="text-xs text-muted-foreground">{t('withdrawalMethods.readOnly')}</p>
          )
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('withdrawalMethods.loading')}
        endpoints={['GET /admin/withdrawal-methods']}
        onRetry={query.refetch}
        errorMessage={t('withdrawalMethods.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('withdrawalMethods.caption')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(m) => m.key}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Banknote} message={t('withdrawalMethods.empty')} />}
          clientPagination={METHOD_PAGING}
        />
      </AsyncBoundary>
    </div>
  );
}
