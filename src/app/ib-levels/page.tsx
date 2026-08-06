'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { IbLevel } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { IbLevelFormModal, type IbLevelFormValues } from '@/components/ib/ib-level-form-modal';
import { t } from '@/lib/i18n';

/**
 * The IB payout ladder.
 *
 * ## What the row count means
 *
 * The number of ENABLED levels is the depth of the payout chain, not a cap on
 * how many partners can exist. Two levels means a client's activity pays their
 * direct partner and that partner's parent, and stops. The banner above the
 * table says so, because "2 levels" is otherwise read as "we allow 2 partners"
 * — which is the single most likely misreading of this screen.
 *
 * ## The total is shown even though the API enforces it
 *
 * A refusal after the fact tells an operator they were wrong; a running total
 * tells them before they try. The API is still the authority — its message
 * names the room left and is surfaced verbatim — but an operator editing shares
 * should not have to submit to find out where they are.
 *
 * Only `revenue_share` levels are summed. Per-lot rates are amounts, so adding
 * them to a percentage produces a number that means nothing.
 */
export default function IbLevelsPage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'ib.manage');
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState<IbLevel | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<IbLevel[]>(['admin', 'ib-levels'], (signal) =>
    api.admin.getIbLevels(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ib-levels'] });

  const saveLevel = useMutation({
    mutationFn: (values: IbLevelFormValues) => {
      if (editing) {
        // `level` is omitted deliberately — it is the primary key and the API
        // has no field for it.
        const { level: _level, ...rest } = values;
        return api.admin.updateIbLevel(editing.level, rest);
      }
      return api.admin.createIbLevel(values);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
    },
  });

  const deleteLevel = useMutation({
    mutationFn: (level: number) => api.admin.deleteIbLevel(level),
    onSuccess: invalidate,
  });

  const toggleEnabled = useMutation({
    mutationFn: (level: IbLevel) =>
      api.admin.updateIbLevel(level.level, { enabled: !level.enabled }),
    onSuccess: invalidate,
  });

  const rows = query.data ?? [];
  const enabledShare = rows
    .filter((l) => l.enabled && l.payoutModel === 'revenue_share')
    .reduce((sum, l) => sum + Number(l.rateValue), 0);
  const depth = rows.filter((l) => l.enabled).length;

  const openCreate = () => {
    setEditing(undefined);
    saveLevel.reset();
    setFormOpen(true);
  };

  const openEdit = (level: IbLevel) => {
    setEditing(level);
    saveLevel.reset();
    setFormOpen(true);
  };

  const confirmDelete = (level: IbLevel) => {
    if (
      !window.confirm(t('ibLevels.confirmDelete', { level: String(level.level), name: level.name }))
    )
      return;
    deleteLevel.mutate(level.level);
  };

  const columns: Column<IbLevel>[] = [
    {
      header: t('ibLevels.colLevel'),
      cell: (l) => <span className="tabular font-semibold">{l.level}</span>,
    },
    { header: t('ibLevels.colName'), cell: (l) => l.name },
    {
      header: t('ibLevels.colModel'),
      cell: (l) => (
        <Badge variant="tag">
          {l.payoutModel === 'revenue_share'
            ? t('ibLevels.modelRevenueShare')
            : t('ibLevels.modelPerLot')}
        </Badge>
      ),
    },
    {
      header: t('ibLevels.colRate'),
      // The unit travels with the number, always. "70" alone means 70% under
      // one model and $70 under the other.
      cell: (l) =>
        l.payoutModel === 'revenue_share'
          ? `${trimRate(l.rateValue)}%`
          : t('ibLevels.perLotValue', { value: trimRate(l.rateValue) }),
      cellClassName: 'tabular',
    },
    {
      header: t('ibLevels.colMaxDirect'),
      cell: (l) =>
        l.maxDirectPartners === null ? (
          <span className="text-muted-foreground">{t('ibLevels.unlimited')}</span>
        ) : (
          <span className="tabular">{l.maxDirectPartners}</span>
        ),
    },
    {
      header: t('ibLevels.colStatus'),
      cell: (l) =>
        l.enabled ? (
          <span className="text-success">{t('ibLevels.statusEnabled')}</span>
        ) : (
          <span className="text-muted-foreground">{t('ibLevels.statusDisabled')}</span>
        ),
    },
    ...(canManage
      ? [
          {
            header: t('ibLevels.colActions'),
            sortable: false,
            cell: (l: IbLevel) => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(l)}
                  aria-label={t('ibLevels.editAria', { level: String(l.level) })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted focus-outline"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('ibLevels.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleEnabled.mutate(l)}
                  disabled={toggleEnabled.isPending}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-outline"
                >
                  {l.enabled ? t('ibLevels.disable') : t('ibLevels.enable')}
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(l)}
                  disabled={deleteLevel.isPending}
                  aria-label={t('ibLevels.deleteAria', { level: String(l.level) })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-outline"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('ibLevels.delete')}
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  /*
   * The API's own refusal, verbatim. Its messages are the informative part of
   * this screen — "the enabled levels would total 110%, at most 30% is
   * available" — and a generic "something went wrong" throws away the only
   * number the operator needs.
   */
  const mutationError =
    (deleteLevel.isError && apiErrorMessage(deleteLevel.error, t('ibLevels.deleteFailed'))) ||
    (toggleEnabled.isError && apiErrorMessage(toggleEnabled.error, t('ibLevels.saveFailed'))) ||
    null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('ibLevels.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('ibLevels.subtitle')}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('ibLevels.create')}
          </button>
        )}
      </div>

      {/* Depth and allocation, stated before the table. Both are read off the
          rows rather than fetched: the API has no summary endpoint and adding
          one would be a second source for a number already on screen. */}
      {query.status === 'ready' && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('ibLevels.depthLabel')}
            </p>
            <p className="mt-1 text-2xl font-bold tabular">{depth}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t('ibLevels.depthHint', { depth: String(depth) })}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('ibLevels.allocatedLabel')}
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular ${
                enabledShare > 100 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {enabledShare}%
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t('ibLevels.allocatedHint', { remaining: String(Math.max(0, 100 - enabledShare)) })}
            </p>
          </div>
        </div>
      )}

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
        label={t('ibLevels.loading')}
        endpoints={['GET /admin/ib-levels']}
        onRetry={query.refetch}
        errorMessage={t('ibLevels.loadFailed')}
        error={query.error}
      >
        <DataTable
          caption={t('ibLevels.caption')}
          columns={columns}
          rows={rows}
          rowKey={(l) => String(l.level)}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Layers} message={t('ibLevels.empty')} />}
        />
      </AsyncBoundary>

      <IbLevelFormModal
        open={formOpen}
        level={editing}
        saving={saveLevel.isPending}
        error={
          saveLevel.isError ? apiErrorMessage(saveLevel.error, t('ibLevels.saveFailed')) : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveLevel.mutate(values)}
      />
    </div>
  );
}

/**
 * `70.0000` reads as `70`, `2.5000` as `2.5`.
 *
 * Display only. The value stays the API's string everywhere else — this never
 * feeds back into a request, because trimming and re-sending would send a
 * different string than the one stored.
 */
function trimRate(value: string): string {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
