'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { adminApi, type IbCommissionType, type Product } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ProductFormModal, type ProductFormValues } from '@/components/products/product-form-modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * What the broker sells.
 *
 * A product is the sellable thing a client recognises — "Standard", "ECN" — and
 * the MT5 groups behind it are what an account is actually opened in. A group
 * fixes one currency and one environment and an account points at exactly one,
 * so a product spans SEVERAL groups — any number, in any currencies (0146). That is
 * why the groups are their own modal rather than a column.
 *
 * ## Disable and delete are different operations
 *
 * DISABLE stops the product being offered and leaves every open account
 * trading. That is what "we no longer sell Standard" means on a platform where
 * clients hold positions in it.
 *
 * DELETE removes the row, and the API refuses while any agency still sells it —
 * naming the agencies, because a foreign-key violation reaches an operator as a
 * 500 with a constraint name in it. In practice delete is for a product added
 * by mistake and never used.
 *
 * ## A product with no groups is shown, not hidden
 *
 * It is the normal state between creating a product and configuring it, and it
 * is also a product nobody can open. The count column says `0` in the warning
 * colour rather than leaving an operator to find out from the portal.
 */
const PRODUCT_PAGING = { noun: ['product', 'products'] as [string, string] };

export default function ProductsPage() {
  const { admin } = useAdmin();
  /*
   * `settings.*`, not a key of their own.
   *
   * Products are commercial configuration of the same class as the download
   * links and the trading terms. Minting `products.edit` would mean a migration
   * granting it to everyone who already holds `settings.edit` — and the last
   * time this codebase added catalogue keys without one, every role edit failed
   * with "you cannot grant permissions you do not hold".
   */
  const canView = hasPermission(admin, 'settings.view');
  const canManage = hasPermission(admin, 'settings.edit');

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<Product | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<Product[]>(keys.products.all(), () => adminApi.getProducts());
  /*
   * The rate cards, for the names in the table and the picker in the modal
   * (0140). Fetched alongside rather than inside the modal: the table renders a
   * type name on every real row, so it is needed either way.
   */
  const commissionTypes = useResource<IbCommissionType[]>(keys.ibCommissionTypes.all(), (signal) =>
    adminApi.getIbCommissionTypes(signal),
  );
  const typeById = React.useMemo(
    () => new Map((commissionTypes.data ?? []).map((type) => [type.id, type])),
    [commissionTypes.data],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.products.all() });

  /**
   * Save the product AND reconcile its groups.
   *
   * ## Not atomic, and it says so rather than pretending
   *
   * The API has no endpoint that takes a product and its groups together —
   * attaching validates each group against the live MT5 server, one request
   * each — so this is a write followed by N more. A group that fails to attach
   * leaves the product saved and the rest of its groups attached, which is why
   * the failure is reported with the group named rather than as "save failed".
   *
   * Detaching happens BEFORE attaching, so an edit that removes a group and adds
   * another leaves the product in its final state even if the attach is refused.
   *
   * ## Reconciled against the SERVER's groups, never the ones the form opened with
   *
   * The create/update answer carries the product's groups as the database has
   * them right now, and that is what the wanted list is compared with. The form's
   * opening copy goes stale the moment a save half-succeeds: a detach that went
   * through before an attach was refused would be detached AGAIN on the retry,
   * and the retry would fail with "That group is not attached" every time until
   * the dialog was closed.
   */
  const saveProduct = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      /*
       * `groups` is stripped rather than passed through. The product DTO has no
       * such field and the API runs `forbidNonWhitelisted`, so sending it fails
       * the whole save with "property groups should not exist" instead of being
       * ignored — the groups travel on their own endpoints below.
       */
      const { groups: wantedGroups, ...product } = values;

      /*
       * `type` travels on CREATE only. It is fixed at creation and the API
       * refuses a differing value on update — omitting it entirely cannot
       * conflict, where echoing a stale one could.
       */
      const { type: _type, ...withoutType } = product;
      const saved = editing
        ? await adminApi.updateProduct(editing.id, withoutType)
        : await adminApi.createProduct(product);

      // MT5 group paths match case-insensitively, as they do on the server.
      const key = (mt5Group: string) => mt5Group.toLowerCase();
      const current = saved.groups;
      const wanted = new Set(wantedGroups.map((group) => key(group.mt5Group)));
      const present = new Set(current.map((group) => key(group.mt5Group)));

      for (const group of current) {
        if (!wanted.has(key(group.mt5Group))) {
          await adminApi.detachProductGroup(saved.id, group.id);
        }
      }

      for (const group of wantedGroups) {
        if (present.has(key(group.mt5Group))) continue;
        await adminApi.attachProductGroup(saved.id, {
          environment: group.environment,
          mt5Group: group.mt5Group,
        });
      }

      return saved;
    },
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: keys.products.availableGroups() });
      toastSuccess(t('products.saveSucceeded', { name: values.name }));
    },
    // Inline in the modal, which stays open — the refusals here name the field,
    // or the group MT5 would not accept. The table is refreshed all the same:
    // a save that half-succeeded changed real rows, and the list must show them.
    onError: () => invalidate(),
  });

  const deleteProduct = useMutation({
    mutationFn: (product: Product) => adminApi.deleteProduct(product.id),
    onSuccess: async (_data, product) => {
      await invalidate();
      toastSuccess(t('products.deleteSucceeded', { name: product.name }));
    },
    // A toast, and the API's own sentence: it names the agencies still selling
    // the product and points at disabling instead.
    onError: (error) => toastError(error, t('products.deleteFailed')),
  });

  const toggleEnabled = useMutation({
    mutationFn: (product: Product) =>
      adminApi.updateProduct(product.id, {
        name: product.name,
        description: product.description,
        sortOrder: product.sortOrder,
        enabled: !product.enabled,
      }),
    onSuccess: async (_data, product) => {
      await invalidate();
      /*
       * States the NEW state rather than the action. `!product.enabled` is what
       * was just written, and echoing it back is the half an operator scanning
       * a long list actually needs.
       */
      toastSuccess(
        product.enabled
          ? t('products.disabledSucceeded', { name: product.name })
          : t('products.enabledSucceeded', { name: product.name }),
      );
    },
    onError: (error) => toastError(error, t('products.saveFailed')),
  });

  /*
   * WHICH product is mid-mutation, not merely that one is. Read from
   * `variables` — the argument passed to the running `mutate` — rather than
   * tracked in state, which would be a second copy of something React Query
   * already knows and could drift from it.
   */
  const busyId = deleteProduct.isPending
    ? deleteProduct.variables?.id
    : toggleEnabled.isPending
      ? toggleEnabled.variables?.id
      : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveProduct.reset();
    setFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    saveProduct.reset();
    setFormOpen(true);
  };

  const confirmDelete = async (product: Product) => {
    const ok = await confirm({
      title: t('products.confirmDeleteTitle', { name: product.name }),
      description: t('products.confirmDelete'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteProduct.mutate(product);
  };

  const columns: Column<Product>[] = [
    {
      header: t('products.colName'),
      cell: (product) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold">{product.name}</span>
          {/* Only the demo product is badged — it is the exception, and a
              "real" badge on every other row would label the normal case. */}
          {product.type === 'demo' && <Badge variant="tag">{t('products.typeDemo')}</Badge>}
        </span>
      ),
      sortable: true,
      sortKey: 'name',
    },
    {
      /*
       * Its own column rather than a badge beside the name.
       *
       * "Which of these are we actually selling" is a question asked of the
       * whole table at once, and a badge that appears only on the disabled rows
       * answers it by absence — the reader has to know that a row with nothing
       * on it means yes. A column states both states in the same place, and
       * sorts.
       */
      header: t('products.colStatus'),
      cell: (product) =>
        product.enabled ? (
          <span className="text-success">{t('products.statusActive')}</span>
        ) : (
          <span className="text-muted-foreground">{t('products.statusInactive')}</span>
        ),
      sortable: true,
      sortKey: 'enabled',
    },
    {
      header: t('products.colDescription'),
      cell: (product) => (
        <span className="line-clamp-2 text-muted-foreground">{product.description ?? '—'}</span>
      ),
    },
    {
      header: t('products.colGroups'),
      cell: (product) => (
        /*
         * A COUNT with the environments behind it, rather than the paths. Four
         * MT5 group paths do not fit a cell and are unreadable side by side;
         * "2 · live, demo" answers the question the table is scanned for, and
         * the modal has the detail.
         */
        <span className={product.groups.length === 0 ? 'text-warning' : ''}>
          {product.groups.length}
          {product.groups.length > 0 && (
            <span className="text-muted-foreground">
              {' · '}
              {[...new Set(product.groups.map((group) => group.environment))].join(', ')}
            </span>
          )}
        </span>
      ),
      align: 'center',
    },
    {
      header: t('products.colCurrencies'),
      cell: (product) => {
        const currencies = [...new Set(product.groups.map((group) => group.currency))].filter(
          Boolean,
        );
        return (
          <span className="text-muted-foreground">
            {currencies.length > 0 ? currencies.join(', ') : '—'}
          </span>
        );
      },
    },
    {
      /*
       * The rate card this product pays partners on (0140) — by NAME, because
       * "what does Standard pay" is the question the table is scanned for, and
       * an id answers nobody. A real product with no type is called out: it
       * pays no partner commission, which is legal and worth seeing.
       */
      header: t('products.colCommissionType'),
      cell: (product) => {
        if (product.type === 'demo') return <span className="text-muted-foreground">—</span>;
        if (product.commissionTypeId === null) {
          return <span className="text-warning">{t('products.commissionTypeNone')}</span>;
        }
        const type = typeById.get(product.commissionTypeId);
        return (
          <span className={type?.enabled === false ? 'text-warning' : ''}>
            {type?.name ?? '—'}
            {type?.enabled === false && (
              <span className="text-muted-foreground">
                {' · '}
                {t('products.commissionTypeInactive')}
              </span>
            )}
          </span>
        );
      },
    },
    {
      header: t('products.colOrder'),
      cell: (product) => product.sortOrder,
      cellClassName: 'tabular text-muted-foreground',
      align: 'right',
      sortable: true,
      sortKey: 'sortOrder',
      sortType: 'number',
    },
    actionsColumn<Product>((product) => (
      <RowActions
        label={t('table.rowActions', { name: product.name })}
        busy={busyId === product.id}
        items={[
          ...(canManage
            ? [
                { label: t('products.edit'), icon: Pencil, onSelect: () => openEdit(product) },
                {
                  label: product.enabled ? t('products.disable') : t('products.enable'),
                  icon: Boxes,
                  onSelect: () => toggleEnabled.mutate(product),
                },
                {
                  label: t('products.delete'),
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => void confirmDelete(product),
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
          <h1 className="text-2xl font-bold tracking-tight">{t('products.pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('products.subtitle')}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('products.add')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={canView ? query.status : 'forbidden'}
        label={t('products.loading')}
        endpoints={['GET /admin/products']}
        onRetry={query.refetch}
        errorMessage={t('products.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          caption={t('products.pageTitle')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(product) => product.id}
          dimmed={query.isFetching}
          clientPagination={PRODUCT_PAGING}
          fill
          empty={<EmptyState icon={Boxes} message={t('products.empty')} />}
        />
      </AsyncBoundary>

      <ProductFormModal
        open={formOpen}
        product={editing}
        demoTaken={(query.data ?? []).some(
          (product) => product.type === 'demo' && product.id !== editing?.id,
        )}
        commissionTypes={commissionTypes.data ?? []}
        saving={saveProduct.isPending}
        error={saveProduct.error}
        onSubmit={(values) => saveProduct.mutate(values)}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
      />
    </div>
  );
}
