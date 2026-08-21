'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import Decimal from 'decimal.js';
import api from '@/lib/api';
import type { IbLevel } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
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
  /*
   * `ib.manage` split into per-verb keys. The tree draws Add, Edit, Delete,
   * reorder and the enable toggle off this one flag, so it is the union — each
   * control the tree renders is still refused by the API independently.
   */
  const canCreate = hasPermission(admin, 'ib.levels.create');
  const canEdit = hasPermission(admin, 'ib.levels.edit');
  const canDelete = hasPermission(admin, 'ib.levels.delete');
  const canManage = canCreate || canEdit || canDelete;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

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
    onSuccess: async (_data, values) => {
      // Read before `editing` is cleared — on an update the form omits `level`
      // entirely, because it is the primary key.
      const level = String(editing?.level ?? values.level);
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('ibLevels.saveSucceeded', { level }));
    },
    // Inline in the modal, which stays open — see the note above the return.
  });

  const deleteLevel = useMutation({
    mutationFn: (level: number) => api.admin.deleteIbLevel(level),
    onSuccess: async (_data, level) => {
      await invalidate();
      toastSuccess(t('ibLevels.deleteSucceeded', { level: String(level) }));
    },
    onError: (error) => toastError(error, t('ibLevels.deleteFailed')),
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
    onSuccess: async () => {
      await invalidate();
      toastSuccess(t('ibLevels.reorderSucceeded'));
    },
    onError: (error) => toastError(error, t('ibLevels.reorderFailed')),
  });

  const toggleEnabled = useMutation({
    mutationFn: (level: IbLevel) =>
      api.admin.updateIbLevel(level.level, { enabled: !level.enabled }),
    onSuccess: async (_data, level) => {
      await invalidate();
      /*
       * The NEW state, not the verb that was clicked. `level.enabled` is the
       * value BEFORE the write, so the branch reads inverted on purpose —
       * toggling an enabled level disables it.
       */
      toastSuccess(
        level.enabled
          ? t('ibLevels.disabledSucceeded', { level: String(level.level) })
          : t('ibLevels.enabledSucceeded', { level: String(level.level) }),
      );
    },
    onError: (error) => toastError(error, t('ibLevels.saveFailed')),
  });

  const rows = query.data ?? [];
  // EVERY enabled rung counts toward the 100% total now. The filter used to
  // exclude per-lot levels, which took no share of the pool; the column is gone
  // and so is the exclusion, matching `assertShareFits` on the API.
  /*
   * Summed through decimal.js, NOT with `+` on `Number(rateValue)`.
   *
   * These are the percentages a partner is paid by, and the float version was
   * wrong in a way that showed on screen: a perfectly ordinary three-rung
   * ladder of 27.6000 / 39.4286 / 32.9714 sums to 100.00000000000001 in
   * floating point. That rendered as `100.00000000000001%` in the header AND
   * tripped the `> 100` branch below, painting a correctly configured ladder
   * red and telling the operator they had over-allocated the broker's revenue.
   * The mirror case, 26.5400 / 37.9143 / 35.5457, reads 99.99999999999999.
   *
   * `rateValue` is a decimal STRING for exactly this reason (§6.1) and stays
   * one until it is rendered.
   */
  const enabledShareDecimal = rows
    .filter((l) => l.enabled)
    .reduce((sum, l) => sum.plus(new Decimal(l.rateValue)), new Decimal(0));
  const enabledShare = enabledShareDecimal.toString();
  const overAllocated = enabledShareDecimal.greaterThan(100);
  const remainingShare = Decimal.max(new Decimal(100).minus(enabledShareDecimal), 0).toString();
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

  const confirmDelete = async (level: IbLevel) => {
    const ok = await confirm({
      title: t('ibLevels.confirmDeleteTitle', {
        level: String(level.level),
        name: level.name,
      }),
      description: t('ibLevels.confirmDelete', {
        level: String(level.level),
        name: level.name,
      }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteLevel.mutate(level.level);
  };

  /*
   * The API's own refusal, verbatim. Its messages are the informative part of
   * this screen — "the enabled levels would total 110%, at most 30% is
   * available" — and a generic "something went wrong" throws away the only
   * number the operator needs.
   */
  /*
   * The row actions report through TOASTS now, not a banner above the table.
   *
   * The API's own refusal is still what an operator reads — `toastError` prefers
   * `error.response.data.message` and falls back only when there is none, so
   * "the enabled levels would total 110%, at most 30% is available" survives
   * intact. What changed is WHERE: a banner at the top of the page is far from
   * the rung that was clicked, stays after the operator has moved on, and stacks
   * badly when a second action fails. The form modal keeps its inline error,
   * because it stays open and the refusal has to be read where the share can be
   * corrected.
   */

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
                overAllocated ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {enabledShare}%
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t('ibLevels.allocatedHint', { remaining: remainingShare })}
            </p>
          </div>
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
            onDelete={(level) => void confirmDelete(level)}
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
