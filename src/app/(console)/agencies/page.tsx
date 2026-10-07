'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { adminApi, type Agency, type Product } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { AgencyFormModal, type AgencyFormValues } from '@/components/agencies/agency-form-modal';
import { ArabicSubline } from '@/components/arabic-text-field';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

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
  // Its own keys, like products — see that page's note.
  const canView = hasPermission(admin, 'agencies.view');
  const canCreate = hasPermission(admin, 'agencies.create');
  const canEdit = hasPermission(admin, 'agencies.edit');
  const canDelete = hasPermission(admin, 'agencies.delete');

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<Agency | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<Agency[]>(keys.agencies.all(), () => adminApi.getAgencies());
  /*
   * The products list, for the names in the table and the picker in the modal.
   * Fetched alongside rather than inside the modal: the table renders product
   * names on every row, so it is needed either way.
   */
  const products = useResource<Product[]>(keys.products.all(), () => adminApi.getProducts());

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.agencies.all() });

  /**
   * Save the agency AND the products it sells.
   *
   * Two requests, because the API keeps them apart: `agency.products_set`
   * records the product names before and after in the audit log, which is the
   * entry somebody comes looking for when a partner's clients can suddenly
   * open something new. Folding it into the agency PUT would bury that change
   * inside a rename.
   *
   * The second request is skipped when the set has not moved, so editing a
   * description does not write an audit row claiming the products changed.
   */
  const saveAgency = useMutation({
    mutationFn: async (values: AgencyFormValues) => {
      /*
       * `productIds` is stripped rather than passed through.
       *
       * The form carries it because the operator edits it here, but the agency
       * DTO does not have the field and the API runs `forbidNonWhitelisted` —
       * so sending it fails the whole save with "property productIds should not
       * exist" rather than being ignored. That strictness is the right default;
       * this is the call site that has to respect it.
       */
      const { productIds, ...agency } = values;

      const saved = editing
        ? await adminApi.updateAgency(editing.id, agency)
        : await adminApi.createAgency(agency);

      const before = editing?.productIds ?? [];
      const moved =
        productIds.length !== before.length || productIds.some((id) => !before.includes(id));

      if (moved) await adminApi.setAgencyProducts(saved.id, productIds);
      return saved;
    },
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
      cell: (agency) => (
        <span className="flex flex-col">
          <span className="font-semibold">{agency.name}</span>
          <ArabicSubline value={agency.nameAr} />
        </span>
      ),
      sortable: true,
      sortKey: 'name',
    },
    {
      /*
       * Its own column, like Products, and for the same reason: a badge that
       * appears only on the inactive rows answers "which of these are live" by
       * absence, which the reader has to already know to interpret.
       *
       * ACTIVE and INACTIVE, the same words as Products. An earlier version
       * read Open and Closed here, on the grounds that this flag stops new
       * APPLICATIONS and leaves every partner appointed under it still selling
       * — which remains true, and is what the checkbox's own hint says. Two
       * status vocabularies across two adjacent screens cost more than the
       * nuance was worth.
       */
      header: t('agencies.colStatus'),
      cell: (agency) =>
        agency.enabled ? (
          <span className="text-success">{t('agencies.statusActive')}</span>
        ) : (
          <span className="text-muted-foreground">{t('agencies.statusInactive')}</span>
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
    actionsColumn<Agency>((agency) => (
      <RowActions
        label={t('table.rowActions', { name: agency.name })}
        busy={busyId === agency.id}
        items={[
          // Each action on the key its endpoint enforces (Oct 2026 audit).
          ...(canEdit
            ? [
                { label: t('agencies.edit'), icon: Pencil, onSelect: () => openEdit(agency) },
                {
                  label: agency.enabled ? t('agencies.close') : t('agencies.open'),
                  icon: Handshake,
                  onSelect: () => toggleEnabled.mutate(agency),
                },
              ]
            : []),
          ...(canDelete
            ? [
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('agencies.pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('agencies.subtitle')}</p>
        </div>
        {canCreate && (
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
        errorMessage={t('agencies.loadFailed')}
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
        /*
         * Real products only. The demo product is offered to every client
         * automatically, and the API refuses to put it on an agency — a
         * checkbox that always errors is worse than no checkbox.
         */
        products={(products.data ?? []).filter((product) => product.type === 'real')}
        saving={saveAgency.isPending}
        error={saveAgency.error}
        onSubmit={(values) => saveAgency.mutate(values)}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
      />
    </div>
  );
}
