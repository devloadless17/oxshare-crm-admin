'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import api from '@/lib/api';
import type { IbLevel } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { IbLevelFormModal, type IbLevelFormValues } from '@/components/ib/ib-level-form-modal';
import { IbLevelTree } from '@/components/ib/ib-level-tree';
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

  /**
   * Dragging a rung.
   *
   * One request for the whole order, because it renumbers primary keys and
   * moves partner placements with them — a per-row PATCH would let a
   * half-applied ladder exist. No optimistic update for the same reason: the
   * order shown is the order the database confirmed.
   */
  const reorder = useMutation({
    mutationFn: (order: number[]) => api.admin.reorderIbLevels(order),
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

  /*
   * The API's own refusal, verbatim. Its messages are the informative part of
   * this screen — "the enabled levels would total 110%, at most 30% is
   * available" — and a generic "something went wrong" throws away the only
   * number the operator needs.
   */
  const mutationError =
    (deleteLevel.isError && apiErrorMessage(deleteLevel.error, t('ibLevels.deleteFailed'))) ||
    (toggleEnabled.isError && apiErrorMessage(toggleEnabled.error, t('ibLevels.saveFailed'))) ||
    (reorder.isError && apiErrorMessage(reorder.error, t('ibLevels.reorderFailed'))) ||
    null;

  return (
    <div className="space-y-6">
      {/* No action button here. "Add level" lives at the foot of the chain,
          where the new rung actually appears — see IbLevelTree. */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('ibLevels.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('ibLevels.subtitle')}</p>
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
        {rows.length === 0 && !canManage ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">{t('ibLevels.empty')}</p>
          </div>
        ) : (
          <IbLevelTree
            levels={rows}
            canManage={canManage}
            reordering={reorder.isPending}
            onEdit={openEdit}
            onToggle={(level) => toggleEnabled.mutate(level)}
            onDelete={confirmDelete}
            onReorder={(order) => reorder.mutate(order)}
            onAdd={openCreate}
          />
        )}
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
