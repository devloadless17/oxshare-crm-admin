'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { Currency } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import {
  CurrencyFormModal,
  type CurrencyFormValues,
} from '@/components/currencies/currency-form-modal';
import { t } from '@/lib/i18n';

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
export default function CurrenciesPage() {
  const { admin } = useAdmin();
  // Currencies are operator configuration of the same class as the download
  // links and the brand name, so they share `settings.*` rather than minting a
  // key every existing role would lack. See the backend controller.
  const canManage = hasPermission(admin, 'settings.manage');
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState<Currency | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<Currency[]>(['admin', 'currencies'], (signal) =>
    api.admin.getCurrencies(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'currencies'] });

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
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
    },
  });

  const deleteCurrency = useMutation({
    mutationFn: (code: string) => api.admin.deleteCurrency(code),
    onSuccess: invalidate,
  });

  const setDefault = useMutation({
    mutationFn: (code: string) => api.admin.updateCurrency(code, { isDefault: true }),
    onSuccess: invalidate,
  });

  const toggleEnabled = useMutation({
    mutationFn: (currency: Currency) =>
      api.admin.updateCurrency(currency.code, { enabled: !currency.enabled }),
    onSuccess: invalidate,
  });

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

  const confirmDelete = (currency: Currency) => {
    // Names the consequence and the alternative, rather than asking "are you
    // sure" about an operation the API may well refuse.
    if (!window.confirm(t('currencies.confirmDelete', { code: currency.code }))) return;
    deleteCurrency.mutate(currency.code);
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
          {
            header: t('currencies.colActions'),
            sortable: false,
            cell: (c: Currency) => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  aria-label={t('currencies.editAria', { code: c.code })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted focus-outline"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('currencies.edit')}
                </button>

                {/*
                  Disabling the DEFAULT is refused by the API — the platform
                  would have no currency to open a new client's wallet in. The
                  control is hidden rather than shown-and-refused because,
                  unlike delete, the reason is structural and permanent: it
                  never becomes possible without first moving the default.
                */}
                {!c.isDefault && (
                  <button
                    type="button"
                    onClick={() => toggleEnabled.mutate(c)}
                    disabled={toggleEnabled.isPending}
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-outline"
                  >
                    {c.enabled ? t('currencies.disable') : t('currencies.enable')}
                  </button>
                )}

                {/* Only an ENABLED currency can become the default: the default
                    must be usable, and the API enforces the same pairing. */}
                {!c.isDefault && c.enabled && (
                  <button
                    type="button"
                    onClick={() => setDefault.mutate(c.code)}
                    disabled={setDefault.isPending}
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-outline"
                  >
                    {t('currencies.makeDefault')}
                  </button>
                )}

                {!c.isDefault && (
                  <button
                    type="button"
                    onClick={() => confirmDelete(c)}
                    disabled={deleteCurrency.isPending}
                    aria-label={t('currencies.deleteAria', { code: c.code })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-outline"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('currencies.delete')}
                  </button>
                )}
              </div>
            ),
          },
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
  const mutationError =
    (deleteCurrency.isError &&
      apiErrorMessage(deleteCurrency.error, t('currencies.deleteFailed'))) ||
    (setDefault.isError && apiErrorMessage(setDefault.error, t('currencies.saveFailed'))) ||
    (toggleEnabled.isError && apiErrorMessage(toggleEnabled.error, t('currencies.saveFailed'))) ||
    null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('currencies.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('currencies.subtitle')}</p>
        </div>
        {canManage && (
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

      {mutationError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {mutationError}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('currencies.loading')}
        endpoints={['GET /admin/currencies']}
        onRetry={query.refetch}
        errorMessage={t('currencies.loadFailed')}
        error={query.error}
      >
        <DataTable
          caption={t('currencies.caption')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(c) => c.code}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Coins} message={t('currencies.empty')} />}
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
