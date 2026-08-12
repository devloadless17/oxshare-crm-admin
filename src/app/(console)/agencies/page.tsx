'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { adminApi, type Agency, type Product } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { AgencyFormModal, type AgencyFormValues } from '@/components/agencies/agency-form-modal';
import { AgencyProductsModal } from '@/components/agencies/agency-products-modal';
import { t } from '@/lib/i18n';

/**
 * Agencies (وكالة) — the programmes a partner is appointed under.
 *
 * A partner belongs to exactly one agency, and their clients may open that
 * agency's products and nothing else. A client under no partner is offered
 * every enabled product, so an agency NARROWS the catalogue rather than
 * granting access to it.
 *
 * ## Closing and deleting are different
 *
 * CLOSING an agency (unticking "open") stops new applications and leaves every
 * partner appointed under it exactly where they are. That is what retiring a
 * programme means.
 *
 * DELETING is refused by the API while any partner is appointed under it,
 * because `ib_accounts.agency_id` is ON DELETE RESTRICT. Delete is for an
 * agency created by mistake.
 *
 * ## What the counts are for
 *
 * "Products" is the number this agency sells, in the warning colour when it is
 * zero — an agency selling nothing is legal and is almost always a mistake, and
 * the partners under it have clients who can open no account at all.
 */
const AGENCY_PAGING = { noun: ['agency', 'agencies'] as [string, string] };

export default function AgenciesPage() {
  const { admin } = useAdmin();
  // `settings.*` for the same reason as products — see that page's note.
  const canView = hasPermission(admin, 'settings.view');
  const canManage = hasPermission(admin, 'settings.edit');

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<Agency | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);
  const [productsFor, setProductsFor] = React.useState<Agency | undefined>(undefined);

  const query = useResource<Agency[]>(['admin', 'agencies'], () => adminApi.getAgencies());
  /*
   * The products list, for the names in the table and the picker in the modal.
   * Fetched alongside rather than inside the modal: the table renders product
   * names on every row, so it is needed either way.
   */
  const products = useResource<Product[]>(['admin', 'products'], () => adminApi.getProducts());

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });

  const saveAgency = useMutation({
    mutationFn: (values: AgencyFormValues) =>
      editing ? adminApi.updateAgency(editing.id, values) : adminApi.createAgency(values),
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('agencies.saveSucceeded', { name: values.name }));
    },
  });

  const deleteAgency = useMutation({
    mutationFn: (agency: Agency) => adminApi.deleteAgency(agency.id),
    onSuccess: async (_data, agency) => {
      await invalidate();
      toastSuccess(t('agencies.deleteSucceeded', { name: agency.name }));
    },
    onError: (error) => toastError(error, t('agencies.deleteFailed')),
  });

  const toggleEnabled = useMutation({
    mutationFn: (agency: Agency) =>
      adminApi.updateAgency(agency.id, {
        name: agency.name,
        description: agency.description,
        sortOrder: agency.sortOrder,
        enabled: !agency.enabled,
      }),
    onSuccess: async (_data, agency) => {
      await invalidate();
      toastSuccess(
        agency.enabled
          ? t('agencies.closedSucceeded', { name: agency.name })
          : t('agencies.openedSucceeded', { name: agency.name }),
      );
    },
    onError: (error) => toastError(error, t('agencies.saveFailed')),
  });

  const busyId = deleteAgency.isPending
    ? deleteAgency.variables?.id
    : toggleEnabled.isPending
      ? toggleEnabled.variables?.id
      : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveAgency.reset();
    setFormOpen(true);
  };

  const openEdit = (agency: Agency) => {
    setEditing(agency);
    saveAgency.reset();
    setFormOpen(true);
  };

  const confirmDelete = async (agency: Agency) => {
    const ok = await confirm({
      title: t('agencies.confirmDeleteTitle', { name: agency.name }),
      description: t('agencies.confirmDelete'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteAgency.mutate(agency);
  };

  const nameOf = React.useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product.name])),
    [products.data],
  );

  const columns: Column<Agency>[] = [
    {
      header: t('agencies.colName'),
      cell: (agency) => <span className="font-semibold">{agency.name}</span>,
      sortable: true,
      sortKey: 'name',
    },
    {
      /*
       * Its own column, like Products, and for the same reason: a badge that
       * appears only on the closed rows answers "which of these are open" by
       * absence, which the reader has to know to interpret.
       *
       * OPEN and CLOSED rather than active and inactive, deliberately unlike
       * Products. Closing an agency stops new APPLICATIONS and leaves every
       * partner appointed under it selling — "inactive" would suggest it had
       * stopped working, which is the one thing it does not do.
       */
      header: t('agencies.colStatus'),
      cell: (agency) =>
        agency.enabled ? (
          <span className="text-success">{t('agencies.statusOpen')}</span>
        ) : (
          <span className="text-muted-foreground">{t('agencies.statusClosed')}</span>
        ),
      sortable: true,
      sortKey: 'enabled',
    },
    {
      header: t('agencies.colDescription'),
      cell: (agency) => (
        <span className="line-clamp-2 text-muted-foreground">{agency.description ?? '—'}</span>
      ),
    },
    {
      header: t('agencies.colProducts'),
      cell: (agency) =>
        agency.productIds.length === 0 ? (
          <span className="text-warning">{t('agencies.none')}</span>
        ) : (
          /*
           * NAMES, not a count. An operator's question here is "what does this
           * agency sell", and with a handful of products the answer fits — a
           * bare number would send them into the modal to read three words.
           */
          <span className="text-muted-foreground">
            {agency.productIds
              .map((id) => nameOf.get(id))
              .filter(Boolean)
              .join(', ')}
          </span>
        ),
    },
    {
      header: t('agencies.colOrder'),
      cell: (agency) => agency.sortOrder,
      cellClassName: 'tabular text-muted-foreground',
      align: 'right',
      sortable: true,
      sortKey: 'sortOrder',
      sortType: 'number',
    },
    actionsColumn<Agency>((agency) => (
      <RowActions
        label={t('table.rowActions', { name: agency.name })}
        busy={busyId === agency.id}
        items={[
          {
            label: t('agencies.manageProducts'),
            icon: Boxes,
            onSelect: () => setProductsFor(agency),
          },
          ...(canManage
            ? [
                { label: t('agencies.edit'), icon: Pencil, onSelect: () => openEdit(agency) },
                {
                  label: agency.enabled ? t('agencies.close') : t('agencies.open'),
                  icon: Handshake,
                  onSelect: () => toggleEnabled.mutate(agency),
                },
                {
                  label: t('agencies.delete'),
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => void confirmDelete(agency),
                },
              ]
            : []),
        ]}
      />
    )),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('agencies.pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('agencies.subtitle')}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('agencies.add')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={canView ? query.status : 'forbidden'}
        label={t('agencies.loading')}
        endpoints={['GET /admin/agencies']}
        onRetry={query.refetch}
        errorMessage={apiErrorMessage(query.error, t('agencies.loadFailed'))}
        error={query.error}
        fill
      >
        <DataTable
          caption={t('agencies.pageTitle')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(agency) => agency.id}
          dimmed={query.isFetching}
          clientPagination={AGENCY_PAGING}
          fill
          empty={<EmptyState icon={Handshake} message={t('agencies.empty')} />}
        />
      </AsyncBoundary>

      <AgencyFormModal
        open={formOpen}
        agency={editing}
        saving={saveAgency.isPending}
        error={saveAgency.error}
        onSubmit={(values) => saveAgency.mutate(values)}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
      />

      {productsFor && (
        // Re-read from the query so a save refreshes the open modal; the state
        // holds only WHICH agency is open.
        <AgencyProductsModal
          agency={query.data?.find((agency) => agency.id === productsFor.id) ?? productsFor}
          products={products.data ?? []}
          canManage={canManage}
          onClose={() => setProductsFor(undefined)}
        />
      )}
    </div>
  );
}
