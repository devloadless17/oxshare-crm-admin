'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import { adminApi, type IbCommissionType } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import {
  CommissionTypeFormModal,
  type CommissionTypeFormValues,
} from '@/components/commission-types/commission-type-form-modal';
import { formatDecimal } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Commission types — the rate cards products are sold on (0140).
 *
 * A type is two amounts per standard lot: the partners' commission and the
 * client's rebate. A product points at one, and each rung of the commission
 * ladder takes a percentage of it. So this screen and the levels screen
 * decide every payout between them, and neither has to know about the other:
 * the type says what a lot is worth, the level says what share of it a
 * partner takes.
 *
 * ## Deactivating and deleting are different, and both are refused in use
 *
 * A deactivated type pays nobody on the products sold on it, so the API
 * refuses while any product is — silently stopping every partner on those
 * products is not a thing a row action should be able to do. Delete is
 * refused for the same reason, and again once the type has priced a payout:
 * the record of what was paid has to stay explicable.
 *
 * ## The products are on the row
 *
 * "Which products are on this type" is the question asked before touching
 * any number on it, so the names are in the table rather than behind a click.
 */
const TYPE_PAGING = { noun: ['commission type', 'commission types'] as [string, string] };

export default function CommissionTypesPage() {
  const { admin } = useAdmin();
  const canView = hasPermission(admin, 'ib.commission_types.view');
  const canCreate = hasPermission(admin, 'ib.commission_types.create');
  const canEdit = hasPermission(admin, 'ib.commission_types.edit');
  const canDelete = hasPermission(admin, 'ib.commission_types.delete');

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<IbCommissionType | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<IbCommissionType[]>(keys.ibCommissionTypes.all(), (signal) =>
    adminApi.getIbCommissionTypes(signal),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: keys.ibCommissionTypes.all() });

  const saveType = useMutation({
    mutationFn: async (values: CommissionTypeFormValues) =>
      editing
        ? adminApi.updateIbCommissionType(editing.id, {
            name: values.name,
            description: values.description,
            commissionPerLot: values.commissionPerLot,
            rebatePerLot: values.rebatePerLot,
            excludedPaths: values.excludedPaths,
            excludedSymbols: values.excludedSymbols,
          })
        : adminApi.createIbCommissionType(values),
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('commissionTypes.saveSucceeded', { name: values.name }));
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: (type: IbCommissionType) =>
      adminApi.updateIbCommissionType(type.id, { enabled: !type.enabled }),
    onSuccess: async (_data, type) => {
      await invalidate();
      toastSuccess(
        type.enabled
          ? t('commissionTypes.disabledSucceeded', { name: type.name })
          : t('commissionTypes.enabledSucceeded', { name: type.name }),
      );
    },
    /* The API refuses to deactivate a type products are sold on and names
       them. Surfaced verbatim — the names are the part an operator acts on. */
    onError: (error) => toastError(error, t('commissionTypes.toggleFailed')),
  });

  const deleteType = useMutation({
    mutationFn: (type: IbCommissionType) => adminApi.deleteIbCommissionType(type.id),
    onSuccess: async (_data, type) => {
      await invalidate();
      toastSuccess(t('commissionTypes.deleteSucceeded', { name: type.name }));
    },
    onError: (error) => toastError(error, t('commissionTypes.deleteFailed')),
  });

  const busyId = deleteType.isPending
    ? deleteType.variables?.id
    : toggleEnabled.isPending
      ? toggleEnabled.variables?.id
      : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveType.reset();
    setFormOpen(true);
  };

  const openEdit = (type: IbCommissionType) => {
    setEditing(type);
    saveType.reset();
    setFormOpen(true);
  };

  const confirmDelete = async (type: IbCommissionType) => {
    const ok = await confirm({
      title: t('commissionTypes.confirmDeleteTitle', { name: type.name }),
      /*
       * The product names are in the question, because they are the whole
       * answer: the API refuses this while any product is on the type, so
       * asking with the names turns a refusal into an informed cancellation.
       */
      description:
        type.productNames.length > 0
          ? t('commissionTypes.confirmDeleteAssigned', {
              products: type.productNames.join(', '),
              count: String(type.productNames.length),
            })
          : t('commissionTypes.confirmDelete'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteType.mutate(type);
  };

  const columns: Column<IbCommissionType>[] = [
    {
      header: t('commissionTypes.colName'),
      cell: (type) => <span className="font-semibold">{type.name}</span>,
      sortable: true,
      sortKey: 'name',
    },
    {
      header: t('commissionTypes.colStatus'),
      cell: (type) =>
        type.enabled ? (
          <span className="text-success">{t('commissionTypes.statusActive')}</span>
        ) : (
          <span className="text-muted-foreground">{t('commissionTypes.statusInactive')}</span>
        ),
      sortable: true,
      sortKey: 'enabled',
    },
    {
      header: t('commissionTypes.colCommission'),
      /*
       * Rendered through `formatDecimal`, which keeps the value EXACT and only
       * trims the zeros the column pads with — never through a number
       * formatter, which could round a figure the form wrote precisely.
       */
      cell: (type) => `$${formatDecimal(type.commissionPerLot)}`,
      cellClassName: 'tabular',
      align: 'right',
      sortable: true,
      sortKey: 'commissionPerLot',
      sortType: 'number',
    },
    {
      header: t('commissionTypes.colRebate'),
      cell: (type) => `$${formatDecimal(type.rebatePerLot)}`,
      cellClassName: 'tabular',
      align: 'right',
      sortable: true,
      sortKey: 'rebatePerLot',
      sortType: 'number',
    },
    {
      header: t('commissionTypes.colProducts'),
      cell: (type) =>
        type.productNames.length === 0 ? (
          <span className="text-muted-foreground">{t('commissionTypes.noProducts')}</span>
        ) : (
          /* NAMES, not a count — "what is on this type" is the question here. */
          <span className="text-muted-foreground">{type.productNames.join(', ')}</span>
        ),
    },
    {
      header: t('commissionTypes.colDescription'),
      cell: (type) => (
        <span className="line-clamp-2 text-muted-foreground">{type.description ?? '—'}</span>
      ),
    },
    actionsColumn<IbCommissionType>((type) => (
      <RowActions
        label={t('table.rowActions', { name: type.name })}
        busy={busyId === type.id}
        items={[
          ...(canEdit
            ? [
                { label: t('commissionTypes.edit'), icon: Pencil, onSelect: () => openEdit(type) },
                {
                  label: type.enabled ? t('commissionTypes.disable') : t('commissionTypes.enable'),
                  icon: type.enabled ? PauseCircle : PlayCircle,
                  onSelect: () => toggleEnabled.mutate(type),
                  /* Deactivating stops every product on it paying. */
                  destructive: type.enabled,
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  label: t('commissionTypes.delete'),
                  icon: Trash2,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => void confirmDelete(type),
                },
              ]
            : []),
        ]}
      />
    )),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('commissionTypes.pageTitle')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('commissionTypes.subtitle')}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
          >
            <BadgePercent className="h-4 w-4" aria-hidden="true" />
            {t('commissionTypes.add')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={canView ? query.status : 'forbidden'}
        label={t('commissionTypes.loading')}
        endpoints={['GET /admin/ib-commission-types']}
        onRetry={query.refetch}
        errorMessage={t('commissionTypes.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          caption={t('commissionTypes.pageTitle')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(type) => type.id}
          dimmed={query.isFetching}
          clientPagination={TYPE_PAGING}
          fill
          empty={<EmptyState icon={BadgePercent} message={t('commissionTypes.empty')} />}
        />
      </AsyncBoundary>

      <CommissionTypeFormModal
        open={formOpen}
        type={editing}
        saving={saveType.isPending}
        error={saveType.error}
        onSubmit={(values) => saveType.mutate(values)}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
      />
    </div>
  );
}
