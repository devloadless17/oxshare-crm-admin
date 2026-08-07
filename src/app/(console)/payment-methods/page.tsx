'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { Currency, PaymentMethod, PaymentMethodKind } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  PaymentMethodFormModal,
  type PaymentMethodFormValues,
} from '@/components/payment-methods/payment-method-form-modal';
import { t, type MessageKey } from '@/lib/i18n';

const KIND_LABELS: Record<PaymentMethodKind, MessageKey> = {
  manual: 'paymentMethods.kindManual',
  gateway: 'paymentMethods.kindGateway',
  crypto: 'paymentMethods.kindCrypto',
};

/**
 * How clients can send money in.
 *
 * ## "Enabled" is not the same as "offered"
 *
 * A method with no `payTo` is never shown to a client — the backend's
 * `listAvailable` filters on it — regardless of what `enabled` says. That makes
 * a half-configured method the quiet failure this screen exists to catch: it
 * sits in the list looking finished, marked Enabled, and no deposit can ever be
 * made through it. Nobody goes looking for the cause, because nothing is
 * visibly wrong.
 *
 * So the flag is on the row, in the Status column, next to the word that
 * contradicts it. An operator scanning the table sees which methods are real.
 *
 * ## Delete versus disable
 *
 * DISABLE stops new deposits while leaving every transaction that used the
 * method readable — that is what "we no longer take Whish" means on a system
 * that has to keep the history of what it took.
 *
 * DELETE removes the row, and the API allows it only when nothing references
 * it. Its refusal names the alternative ("Disable it instead"), so it is
 * surfaced verbatim rather than replaced with a generic failure — the same rule
 * the currencies screen follows for its 409.
 */
/*
 * This endpoint returns its whole list, so the rows held ARE the dataset and
 * paging them locally is a view concern. It gives the screen the same footer as
 * the server-paginated tables rather than the inert bar it drew before.
 */
const METHOD_PAGING = { noun: ['method', 'methods'] as [string, string] };

export default function PaymentMethodsPage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'payments.manage');
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState<PaymentMethod | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<PaymentMethod | null>(null);

  const query = useResource<PaymentMethod[]>(['admin', 'payment-methods'], (signal) =>
    api.admin.getPaymentMethods(signal),
  );

  /*
   * The currency list, for the form's picker. Loaded with the page rather than
   * on modal open: it is small, React Query caches it across every open, and
   * the alternative is a select that is empty for the first moment it is
   * visible — on a field where an empty list reads as "no currencies exist".
   */
  const currenciesQuery = useResource<Currency[]>(['admin', 'currencies'], (signal) =>
    api.admin.getCurrencies(signal),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'payment-methods'] });

  const saveMethod = useMutation({
    mutationFn: (values: PaymentMethodFormValues) => {
      /*
       * An empty optional string is OMITTED rather than sent blank.
       *
       * These fields are nullable on the wire and the API treats absent and
       * empty differently — sending `payTo: ''` writes an empty account rather
       * than leaving the field unset, and an empty `minAmount` is not a limit
       * of zero. `undefined` is the only value that means "no limit".
       */
      const optional = (value: string) => (value === '' ? undefined : value);
      const body = {
        name: values.name,
        kind: values.kind,
        currency: values.currency,
        logoUrl: optional(values.logoUrl),
        instructions: optional(values.instructions),
        payTo: optional(values.payTo),
        minAmount: optional(values.minAmount),
        maxAmount: optional(values.maxAmount),
        enabled: values.enabled,
        sortOrder: values.sortOrder,
      };

      if (editing) {
        // `key` is not sent: it is the machine key stored transactions
        // reference, and the update DTO has no field for it.
        return api.admin.updatePaymentMethod(editing.key, body);
      }
      return api.admin.createPaymentMethod({ ...body, key: values.key });
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
    },
  });

  const deleteMethod = useMutation({
    mutationFn: (key: string) => api.admin.deletePaymentMethod(key),
    onSuccess: async () => {
      setDeleting(null);
      await invalidate();
    },
  });

  /*
   * WHICH method is deleting, not merely THAT one is.
   *
   * `deleteMethod.variables` is the key passed to the in-flight `mutate`, so the
   * spinner lands on the row being acted on rather than on every row at once.
   * Read from React Query rather than tracked in state — `deleting` holds the
   * row the DIALOG is about, which is not the same thing: it stays set while the
   * API refuses the delete and the dialog is held open to say so.
   */
  const deletingKey = deleteMethod.isPending ? deleteMethod.variables : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveMethod.reset();
    setFormOpen(true);
  };

  const openEdit = (method: PaymentMethod) => {
    setEditing(method);
    saveMethod.reset();
    setFormOpen(true);
  };

  const columns: Column<PaymentMethod>[] = [
    {
      header: t('paymentMethods.colKey'),
      cell: (m) => <span className="font-mono font-semibold">{m.key}</span>,
    },
    {
      header: t('paymentMethods.colName'),
      cell: (m) => (
        <div className="flex items-center gap-2">
          {/* The logo is decorative — the name beside it carries the meaning,
              so it is hidden from assistive technology rather than given a
              duplicate label. A plain <img>: these are operator-supplied URLs
              on arbitrary hosts, which next/image would have to be configured
              per domain to accept. */}
          {m.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.logoUrl}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 rounded object-contain"
            />
          )}
          <span>{m.name}</span>
        </div>
      ),
    },
    {
      header: t('paymentMethods.colKind'),
      cell: (m) => <span className="text-xs text-muted-foreground">{t(KIND_LABELS[m.kind])}</span>,
    },
    {
      header: t('paymentMethods.colCurrency'),
      cell: (m) => <span className="font-mono text-xs">{m.currency}</span>,
    },
    {
      header: t('paymentMethods.colLimits'),
      /*
       * Limits are rendered VERBATIM, not through formatMoney.
       *
       * They are the exact bounds the API compares a client's deposit against,
       * so a display that rounds would show a limit the system does not
       * enforce. `sortable: false` for the same reason the withdrawals amount
       * column is: these are decimal strings, and the ordering they suggest
       * would cover this page only.
       */
      sortable: false,
      cell: (m) => {
        const { minAmount: min, maxAmount: max } = m;
        if (!min && !max) {
          return (
            <span className="text-xs text-muted-foreground">{t('paymentMethods.noLimits')}</span>
          );
        }
        const text =
          min && max
            ? t('paymentMethods.minMax', { min, max })
            : min
              ? t('paymentMethods.minOnly', { min })
              : t('paymentMethods.maxOnly', { max: max ?? '' });
        return <span className="font-mono text-xs tabular">{text}</span>;
      },
    },
    {
      header: t('paymentMethods.colStatus'),
      cell: (m) => (
        <div className="space-y-1">
          {m.enabled ? (
            <span className="text-success">{t('paymentMethods.statusEnabled')}</span>
          ) : (
            <span className="text-muted-foreground">{t('paymentMethods.statusDisabled')}</span>
          )}
          {/*
            The half-configured case, stated on the row.
            Enabled-but-unreachable is invisible everywhere else in the system,
            and this is the only screen where somebody could notice it.
          */}
          {!m.payTo && (
            <div
              className="flex items-start gap-1.5 text-[11px] font-semibold text-warning"
              title={t('paymentMethods.notOfferedWhy')}
            >
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t('paymentMethods.notOffered')}</span>
            </div>
          )}
        </div>
      ),
    },
    ...(canManage
      ? [
          actionsColumn<PaymentMethod>(
            (m) => (
              <RowActions
                label={t('table.rowActions', { name: m.name })}
                busy={deletingKey === m.key}
                items={[
                  { label: t('paymentMethods.edit'), icon: Pencil, onSelect: () => openEdit(m) },
                  {
                    label: t('paymentMethods.delete'),
                    icon: Trash2,
                    destructive: true,
                    separatorBefore: true,
                    /*
                     * `reset()` before opening: the dialog renders the API's
                     * last refusal, and without this a previous method's "12
                     * transactions reference this" would be sitting in the
                     * dialog the moment it opens for a different row.
                     */
                    onSelect: () => {
                      deleteMethod.reset();
                      setDeleting(m);
                    },
                  },
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
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('paymentMethods.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('paymentMethods.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton resource="payment-methods" disabled={(query.data ?? []).length === 0} />
          {/* The read-only note stays in the create button's place: without it a
              restricted admin sees a table with no controls and no reason. */}
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

      <PaymentMethodFormModal
        open={formOpen}
        method={editing}
        currencies={currenciesQuery.data ?? []}
        saving={saveMethod.isPending}
        error={
          saveMethod.isError
            ? apiErrorMessage(saveMethod.error, t('paymentMethods.saveFailed'))
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMethod.mutate(values)}
      />

      {/* Owned by the PAGE, not the row — a per-row dialog unmounts
          mid-transition when the list refetches after a successful delete. */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('paymentMethods.confirmDeleteTitle', { name: deleting?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('paymentMethods.confirmDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>

          {/*
            The API's own refusal, verbatim and INSIDE the dialog.
            "12 transactions reference this method; disable it instead" names
            both the cause and the way out — and rendering it on the page behind
            an open dialog would put the explanation somewhere the operator
            cannot see while they are still deciding.
          */}
          {deleteMethod.isError && (
            <p className="text-xs font-semibold text-destructive" role="alert">
              {apiErrorMessage(deleteMethod.error, t('paymentMethods.deleteFailed'))}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // The dialog closes itself on action, but the API may refuse
                // this — and the refusal is the informative part. Held open by
                // preventing the default close, so the error lands where the
                // operator is looking rather than behind them.
                e.preventDefault();
                if (deleting) deleteMethod.mutate(deleting.key);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMethod.isPending ? t('paymentMethods.saving') : t('paymentMethods.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
