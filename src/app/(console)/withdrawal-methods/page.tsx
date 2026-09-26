'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import api from '@/lib/api';
import type { WithdrawalMethod } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { assetUrl } from '@/lib/asset-url';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
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
 * method listed, disabled ones included; add, edit, enable and disable, never
 * delete. `withdrawal_payment_methods` has existed since migration 0062 and the
 * withdraw form has always read it — until now it could only be changed in the
 * database.
 *
 * ## Why disable and not delete
 *
 * Every withdrawal request names the rail it was made on, and the desk has to
 * be able to read that name when it settles the request. So a method is
 * switched off — which stops it being offered — and never removed.
 */
const METHOD_PAGING = { noun: ['method', 'methods'] as [string, string] };

export default function WithdrawalMethodsPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'payments.create');
  const canEdit = hasPermission(admin, 'payments.edit');
  const queryClient = useQueryClient();

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
        name: values.name,
        logoUrl: values.logoUrl === '' ? undefined : values.logoUrl,
        enabled: values.enabled,
      };
      return editing
        ? api.admin.updateWithdrawalMethod(editing.key, body)
        : api.admin.createWithdrawalMethod({ ...body, key: values.key });
    },
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('withdrawalMethods.saveSucceeded', { name: values.name }));
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
          ? t('withdrawalMethods.disabledSucceeded', { name: method.name })
          : t('withdrawalMethods.enabledSucceeded', { name: method.name }),
      );
    },
    onError: (error) => toastError(error, t('withdrawalMethods.saveFailed')),
  });

  const togglingKey = toggleEnabled.isPending ? toggleEnabled.variables?.key : undefined;

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
      header: t('withdrawalMethods.colKey'),
      cell: (m) => <span className="font-mono font-semibold">{m.key}</span>,
    },
    {
      header: t('withdrawalMethods.colName'),
      cell: (m) => (
        <div className="flex items-center gap-2">
          {/* Through `assetUrl`, never raw — see the deposit methods page. */}
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
                label={t('table.rowActions', { name: m.name })}
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
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
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
