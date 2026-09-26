'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { Leverage } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import {
  LeverageFormModal,
  type LeverageFormValues,
} from '@/components/leverages/leverage-form-modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The leverage ladder a client may open an account on.
 *
 * ## Why this is a screen and not a field on Settings
 *
 * It WAS a field: a comma-separated text box on Settings → Trading, holding
 * `50,100,200,500`. That could say what the ladder is and nothing else. An
 * operator withdrawing 500:1 for a regulatory change could only delete it from
 * the string — which is indistinguishable from never having offered it, and
 * says nothing about the accounts already trading at it.
 *
 * A rung has a lifecycle, so it gets a row: enable, disable, reorder, and a
 * refusal to delete one somebody is standing on. That is the same argument
 * currencies and the IB levels already settled, and this screen is deliberately
 * shaped like theirs.
 *
 * ## Disabling is the normal way to withdraw one
 *
 * Deleting is refused while any trading account is open at the ratio, and the
 * API says so in those words. Disabling takes it off the client's menu and
 * leaves those accounts trading — which is what an operator almost always
 * means. The row menu puts disable first for that reason, with delete behind a
 * separator and a confirmation.
 */
export default function LeveragesPage() {
  const { admin } = useAdmin();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  /*
   * Four keys, not one. `create`, `edit` and `delete` are separate grants on
   * the API, so a role holding only `leverages.edit` can withdraw a rung
   * without being able to remove one — and the controls follow, rather than
   * offering an action the API will refuse.
   */
  const canCreate = hasPermission(admin, 'leverages.create');
  const canEdit = hasPermission(admin, 'leverages.edit');
  const canDelete = hasPermission(admin, 'leverages.delete');
  const canManage = canCreate || canEdit || canDelete;

  const query = useResource(keys.leverages.all(), (signal) => api.admin.getLeverages(signal));

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Leverage | null>(null);
  const [formError, setFormError] = React.useState<string | undefined>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.leverages.all() });

  const save = useMutation({
    mutationFn: (values: LeverageFormValues) =>
      editing
        ? api.admin.updateLeverage(editing.ratio, {
            label: values.label || undefined,
            enabled: values.enabled,
          })
        : api.admin.createLeverage({
            ratio: values.ratio,
            label: values.label || undefined,
            enabled: values.enabled,
          }),
    onSuccess: async () => {
      await invalidate();
      setFormOpen(false);
      setFormError(undefined);
      toastSuccess(editing ? t('leverages.updated') : t('leverages.created'));
    },
    /*
     * Inline in the modal, which stays OPEN. The refusals here are the
     * informative part — "500:1 is already on the ladder", "this is the only
     * leverage on offer" — and closing the form would throw away both the
     * explanation and what the operator had typed.
     */
    onError: (error) => setFormError(apiErrorMessage(error, t('leverages.saveFailed'))),
  });

  const toggleEnabled = useMutation({
    mutationFn: (row: Leverage) => api.admin.updateLeverage(row.ratio, { enabled: !row.enabled }),
    onSuccess: async (_data, row) => {
      await invalidate();
      toastSuccess(row.enabled ? t('leverages.disabled') : t('leverages.enabled'));
    },
    // The API's OWN message: refusing to disable the last enabled rung explains
    // itself far better than a generic failure could.
    onError: (error) => toastError(error, t('leverages.saveFailed')),
  });

  const remove = useMutation({
    mutationFn: (ratio: number) => api.admin.deleteLeverage(ratio),
    onSuccess: async () => {
      await invalidate();
      toastSuccess(t('leverages.deleted'));
    },
    onError: (error) => toastError(error, t('leverages.deleteFailed')),
  });

  const confirmDelete = async (row: Leverage) => {
    const ok = await confirm({
      title: t('leverages.confirmDeleteTitle', { ratio: String(row.ratio) }),
      description: t('leverages.confirmDelete'),
      confirmLabel: t('leverages.delete'),
      destructive: true,
    });
    if (ok) remove.mutate(row.ratio);
  };

  const rows = query.data ?? [];

  const columns: Column<Leverage>[] = [
    {
      header: t('leverages.colRatio'),
      cell: (row) => (
        <span className="font-mono text-sm font-semibold">
          {/* `1:500`, the way it is written on a trading platform — the stored
              value is the 500. */}
          1:{row.ratio}
        </span>
      ),
    },
    {
      header: t('leverages.colLabel'),
      cell: (row) =>
        row.label ? (
          <span className="text-sm">{row.label}</span>
        ) : (
          /* Not an absence to apologise for: with no label the client is shown
             `1:<ratio>`, which is what every screen did before labels existed. */
          <span className="text-xs text-muted-foreground">
            {t('leverages.labelDefault', { ratio: String(row.ratio) })}
          </span>
        ),
    },
    {
      header: t('leverages.colStatus'),
      cell: (row) =>
        row.enabled ? (
          <Badge variant="success">{t('leverages.statusOffered')}</Badge>
        ) : (
          /*
           * "Withdrawn", not "Disabled". The distinction the CSV could not make
           * is the whole reason this table exists — accounts opened at this
           * ratio are still trading on it.
           */
          <Badge variant="warning">{t('leverages.statusWithdrawn')}</Badge>
        ),
    },
    ...(canManage
      ? [
          actionsColumn<Leverage>(
            (row) => (
              <RowActions
                busy={toggleEnabled.isPending || remove.isPending}
                label={t('leverages.actionsFor', { ratio: String(row.ratio) })}
                items={[
                  ...(canEdit
                    ? [
                        {
                          label: t('leverages.edit'),
                          icon: Pencil,
                          onSelect: () => {
                            setEditing(row);
                            setFormError(undefined);
                            setFormOpen(true);
                          },
                        },
                        {
                          // Withdrawing is an EDIT, not a delete — it takes the
                          // rung off the menu and leaves accounts trading on it.
                          label: row.enabled ? t('leverages.disable') : t('leverages.enable'),
                          icon: row.enabled ? EyeOff : Eye,
                          onSelect: () => toggleEnabled.mutate(row),
                        },
                      ]
                    : []),
                  ...(canDelete
                    ? [
                        {
                          label: t('leverages.delete'),
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: canEdit,
                          onSelect: () => void confirmDelete(row),
                        },
                      ]
                    : []),
                ]}
              />
            ),
            t('leverages.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('leverages.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('leverages.subtitle')}</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(undefined);
              setFormOpen(true);
            }}
            className="focus-outline inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leverages.add')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('leverages.loading')}
        endpoints={['GET /admin/leverages']}
        onRetry={query.refetch}
        errorMessage={t('leverages.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.ratio)}
          fill
          loading={query.status === 'loading'}
          empty={<EmptyState icon={Gauge} message={t('leverages.empty')} />}
        />
      </AsyncBoundary>

      <LeverageFormModal
        /*
         * KEYED on the subject, so switching rows remounts the form and its
         * fields re-seed from the new rung — see the component's note on why
         * that is not done with an effect.
         */
        key={editing ? `edit-${editing.ratio}` : 'add'}
        open={formOpen}
        editing={
          editing
            ? {
                ratio: editing.ratio,
                label: editing.label ?? '',
                enabled: editing.enabled,
              }
            : null
        }
        saving={save.isPending}
        error={formError}
        onClose={() => {
          setFormOpen(false);
          setFormError(undefined);
        }}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
