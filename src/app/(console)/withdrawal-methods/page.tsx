'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { WithdrawalMethod } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { MethodNameCell } from '@/components/payment-methods/method-name-cell';
import {
  WithdrawalMethodFormModal,
  type WithdrawalMethodFormValues,
} from '@/components/withdrawal-methods/withdrawal-method-form-modal';
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

  const [editing, setEditing] = React.useState<WithdrawalMethod | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<WithdrawalMethod[]>(keys.withdrawalMethods.all(), (signal) =>
    api.admin.getWithdrawalMethods(signal),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: keys.withdrawalMethods.all() });

  const saveMethod = useMutation({
    mutationFn: (values: WithdrawalMethodFormValues) => {
      const body = {
        internalLabel: values.internalLabel,
        name: values.name,
        logoUrl: values.logoUrl === '' ? undefined : values.logoUrl,
        enabled: values.enabled,
      };
      // No key is ever sent: the API generates a new rail's permanent ID (0161).
      return editing
        ? api.admin.updateWithdrawalMethod(editing.key, body)
        : api.admin.createWithdrawalMethod(body);
    },
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('withdrawalMethods.saveSucceeded', { name: values.internalLabel }));
    },
    // Failures render inline in the form, which stays open.
  });

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

  const openCreate = () => {
    setEditing(undefined);
    saveMethod.reset();
    setFormOpen(true);
  };

  const openEdit = (method: WithdrawalMethod) => {
    setEditing(method);
    saveMethod.reset();
    setFormOpen(true);
  };

  const columns: Column<WithdrawalMethod>[] = [
    {
      header: t('withdrawalMethods.colName'),
      cell: (m) => (
        <MethodNameCell internalLabel={m.internalLabel} name={m.name} logoUrl={m.logoUrl} />
      ),
    },
    {
      header: t('withdrawalMethods.colStatus'),
      cell: (m) =>
        m.enabled ? (
          <span className="text-success">{t('withdrawalMethods.statusEnabled')}</span>
        ) : (
          <span className="text-muted-foreground">{t('withdrawalMethods.statusDisabled')}</span>
        ),
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
                  // `whish` is never deleted; a used method shows why it cannot be.
                  ...(!m.builtIn
                    ? [
                        {
                          label: m.inUse
                            ? t('withdrawalMethods.deleteInUse')
                            : t('withdrawalMethods.delete'),
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

      <WithdrawalMethodFormModal
        open={formOpen}
        method={editing}
        saving={saveMethod.isPending}
        error={
          saveMethod.isError
            ? apiErrorMessage(saveMethod.error, t('withdrawalMethods.saveFailed'))
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMethod.mutate(values)}
      />
    </div>
  );
}
