'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Eye, EyeOff, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { Currency } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { Badge } from '@/components/ui/badge';
import {
  CurrencyFormModal,
  type CurrencyFormValues,
} from '@/components/currencies/currency-form-modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * What money this platform can hold.
 *
 * These used to be a Postgres enum, which made adding a currency a migration
 * plus a release plus somebody who writes SQL — so in practice the set never
 * changed and the product could not follow the business. This screen is the
 * other half of moving them into a table.
 *
 * ## Two operations that look similar and are not
 *
 * DISABLE stops the platform offering a currency: no new wallets open in it and
 * no new deposits are accepted, while every existing balance stays readable and
 * spendable. That is what "we no longer offer EUR" actually means on a system
 * holding client money.
 *
 * DELETE removes the row, and the API allows it only when no wallet exists in
 * it — the foreign keys are ON DELETE RESTRICT because balances and append-only
 * ledger history depend on the row. In practice this is for a currency added by
 * mistake and never used.
 *
 * The table shows the wallet-bearing state through that refusal rather than
 * pre-emptively hiding the button: the API's 409 explains exactly why, with a
 * count, and an explanation beats a disabled control with no reason on it.
 *
 * ## The default is a radio, not a checkbox
 *
 * Exactly one currency is the default, enforced by a partial unique index. It
 * is what a brand-new client's first wallet opens in, so the platform must
 * always have one — the API refuses to clear the flag and only ever MOVES it.
 */
/*
 * This endpoint returns its whole list, so the rows held ARE the dataset and
 * paging them locally is a view concern. It gives the screen the same footer as
 * the server-paginated tables rather than the inert bar it drew before.
 */
const CURRENCY_PAGING = { noun: ['currency', 'currencies'] as [string, string] };

export default function CurrenciesPage() {
  const { admin } = useAdmin();
  // Currencies are operator configuration of the same class as the download
  // links and the brand name, so they share `settings.*` rather than minting a
  // key every existing role would lack. See the backend controller.
  /*
   * THREE keys, not one — and no longer borrowed from `settings.*`.
   *
   * Currencies lived under `settings.manage`, which meant the grant that let
   * somebody change the support email also let them DELETE a currency. They are
   * their own module now, and create/edit/delete are separate: a `manage` key
   * that bundles all three is how "may configure currencies" quietly became
   * "may delete the one every wallet is denominated in".
   */
  const canCreate = hasPermission(admin, 'currencies.create');
  const canEdit = hasPermission(admin, 'currencies.edit');
  const canDelete = hasPermission(admin, 'currencies.delete');
  // The row menu is drawn when ANY of its entries would be, and each entry
  // checks its own key below.
  const canManage = canEdit || canDelete;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<Currency | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<Currency[]>(keys.currencies.all(), (signal) =>
    api.admin.getCurrencies(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.currencies.all() });

  const saveCurrency = useMutation({
    mutationFn: (values: CurrencyFormValues) => {
      if (editing) {
        /*
         * `code` is deliberately not sent on update — it is the primary key and
         * the API has no field for it. Sending `isDefault: false` is also
         * withheld when it is already false, because the API refuses an
         * explicit un-defaulting (a platform must always have one) and there is
         * no reason to make an unchanged checkbox trigger that refusal.
         */
        const { code: _code, isDefault, ...rest } = values;
        return api.admin.updateCurrency(editing.code, {
          ...rest,
          ...(isDefault ? { isDefault: true } : {}),
        });
      }
      return api.admin.createCurrency(values);
    },
    onSuccess: async (_data, values) => {
      // `editing` is cleared below, so the code is read BEFORE that — on an
      // update the form has no `code` field at all (it is the primary key).
      const code = editing?.code ?? values.code;
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('currencies.saveSucceeded', { code }));
    },
    // Inline in the modal, which stays open — see the note above `deleteCurrency`.
  });

  const deleteCurrency = useMutation({
    mutationFn: (code: string) => api.admin.deleteCurrency(code),
    onSuccess: async (_data, code) => {
      await invalidate();
      toastSuccess(t('currencies.deleteSucceeded', { code }));
    },
    onError: (error) => toastError(error, t('currencies.deleteFailed')),
  });

  const setDefault = useMutation({
    mutationFn: (code: string) => api.admin.updateCurrency(code, { isDefault: true }),
    onSuccess: async (_data, code) => {
      await invalidate();
      toastSuccess(t('currencies.defaultSucceeded', { code }));
    },
    onError: (error) => toastError(error, t('currencies.saveFailed')),
  });

  const toggleEnabled = useMutation({
    mutationFn: (currency: Currency) =>
      api.admin.updateCurrency(currency.code, { enabled: !currency.enabled }),
    onSuccess: async (_data, currency) => {
      await invalidate();
      /*
       * States the NEW state, not the action. `!currency.enabled` is what was
       * just written — echoing "disabled" after a click on "Disable" is the
       * confirmation, and it is the half an operator scanning a long list
       * actually needs.
       */
      toastSuccess(
        currency.enabled
          ? t('currencies.disabledSucceeded', { code: currency.code })
          : t('currencies.enabledSucceeded', { code: currency.code }),
      );
    },
    onError: (error) => toastError(error, t('currencies.saveFailed')),
  });

  /*
   * WHICH currency is mid-mutation, not merely THAT one is.
   *
   * Three different mutations act on a row, so the busy row is whichever one is
   * in flight. Read from `variables` — the argument passed to the running
   * `mutate` — rather than tracked in state, which would be a second copy of
   * something React Query already knows and could drift from it. Note the two
   * shapes: `toggleEnabled` takes the row, the other two take the code.
   */
  const busyCode = deleteCurrency.isPending
    ? deleteCurrency.variables
    : setDefault.isPending
      ? setDefault.variables
      : toggleEnabled.isPending
        ? toggleEnabled.variables?.code
        : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveCurrency.reset();
    setFormOpen(true);
  };

  const openEdit = (currency: Currency) => {
    setEditing(currency);
    saveCurrency.reset();
    setFormOpen(true);
  };

  const confirmDelete = async (currency: Currency) => {
    // Names the consequence and the alternative, rather than asking "are you
    // sure" about an operation the API may well refuse.
    const ok = await confirm({
      title: t('currencies.confirmDeleteTitle', { code: currency.code }),
      description: t('currencies.confirmDelete', { code: currency.code }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteCurrency.mutate(currency.code);
  };

  const columns: Column<Currency>[] = [
    {
      header: t('currencies.colCode'),
      cell: (c) => (
        <span className="flex items-center gap-2">
          <span className="font-mono font-semibold">{c.code}</span>
          {c.isDefault && <Badge variant="tag">{t('currencies.defaultBadge')}</Badge>}
        </span>
      ),
    },
    { header: t('currencies.colName'), cell: (c) => c.name },
    {
      header: t('currencies.colSymbol'),
      cell: (c) => c.symbol,
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('currencies.colDecimals'),
      cell: (c) => c.decimals,
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      header: t('currencies.colOrder'),
      cell: (c) => c.sortOrder,
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      header: t('currencies.colStatus'),
      cell: (c) =>
        c.enabled ? (
          <span className="text-success">{t('currencies.statusEnabled')}</span>
        ) : (
          <span className="text-muted-foreground">{t('currencies.statusDisabled')}</span>
        ),
    },
    ...(canManage
      ? [
          actionsColumn<Currency>(
            (c) => (
              <RowActions
                label={t('table.rowActions', { name: c.code })}
                busy={busyCode === c.code}
                items={[
                  { label: t('currencies.edit'), icon: Pencil, onSelect: () => openEdit(c) },

                  /*
                   * Every entry below is withheld for the DEFAULT currency, and
                   * withheld rather than disabled. The reasons are structural
                   * and permanent, not transient: the platform must always have
                   * a usable default to open a new client's first wallet in, so
                   * the default can be neither disabled, nor re-defaulted, nor
                   * deleted until the default has first been MOVED. A disabled
                   * control that can never become enabled from this row is
                   * worse than its absence.
                   */
                  ...(c.isDefault
                    ? []
                    : [
                        {
                          label: c.enabled ? t('currencies.disable') : t('currencies.enable'),
                          icon: c.enabled ? EyeOff : Eye,
                          onSelect: () => toggleEnabled.mutate(c),
                        },
                        // Only an ENABLED currency can become the default: the
                        // default must be usable, and the API enforces the pairing.
                        ...(c.enabled
                          ? [
                              {
                                label: t('currencies.makeDefault'),
                                icon: Star,
                                onSelect: () => setDefault.mutate(c.code),
                              },
                            ]
                          : []),
                        {
                          label: t('currencies.delete'),
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => void confirmDelete(c),
                        },
                      ]),
                ]}
              />
            ),
            t('currencies.colActions'),
          ),
        ]
      : []),
  ];

  /*
   * Every failing mutation surfaces the API's OWN message.
   *
   * The refusals here are the informative part of the screen — "EUR has 12
   * wallets and cannot be deleted", "the default cannot be disabled" — and a
   * generic "something went wrong" would throw away the only explanation the
   * operator is going to get.
   */
  /*
   * The row actions report through TOASTS now, not a banner above the table.
   *
   * The API's own refusal is still what an operator reads — `toastError` prefers
   * `error.response.data.message` and falls back only when there is none, so
   * "cannot delete: 3 wallets hold this currency" survives intact. What changed
   * is WHERE: a banner at the top of the page is far from the row that was
   * clicked, stays after the operator has moved on, and stacks badly when a
   * second action fails. The form modal keeps its inline error, because it stays
   * open and the refusal has to be read where the field can be fixed.
   */

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('currencies.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('currencies.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton resource="currencies" disabled={(query.data ?? []).length === 0} />
          {/* `canCreate`, not the row-actions union: an operator who may edit a
              currency but not add one should not be offered "New currency". */}
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('currencies.create')}
            </button>
          )}
        </div>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('currencies.loading')}
        endpoints={['GET /admin/currencies']}
        onRetry={query.refetch}
        errorMessage={t('currencies.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('currencies.caption')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(c) => c.code}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Coins} message={t('currencies.empty')} />}
          clientPagination={CURRENCY_PAGING}
        />
      </AsyncBoundary>

      <CurrencyFormModal
        open={formOpen}
        currency={editing}
        saving={saveCurrency.isPending}
        error={
          saveCurrency.isError
            ? apiErrorMessage(saveCurrency.error, t('currencies.saveFailed'))
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveCurrency.mutate(values)}
      />
    </div>
  );
}
