'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Percent, Plus } from 'lucide-react';
import api from '@/lib/api';
import type { IbProgram } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import {
  IbProgramFormModal,
  type IbProgramFormValues,
} from '@/components/ib/ib-program-form-modal';
import { t } from '@/lib/i18n';

/**
 * Commission programmes — FR-ADM-10, and the screen behind FR-IB-05/06/16.
 *
 * ## Why this is not the payout ladder
 *
 * `/ib-levels` owns PLACEMENT: how deep the chain runs, what each rung is
 * called, whether new partners may be put there. This owns TERMS: what a
 * partner earns, what their clients get back, and which of those legs pay.
 *
 * The distinction is the whole reason programmes exist. A ladder keys the rate
 * on the rung, so every level-1 partner is paid identically and there is
 * nowhere at all to put a client rebate — which is why `IbLevel.rateValue` is
 * still on the wire and is deliberately NOT shown anywhere on this screen.
 *
 * ## The rates are per DEPTH
 *
 * Level 1 is what the holder earns from their OWN clients; level 2 from a
 * sub-partner's. The columns are labelled that way rather than "L1 / L2",
 * because the short form reads as the rung and that is the misreading an
 * operator would price on.
 */
export default function IbProgramsPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'ib.programs.create');
  const canEdit = hasPermission(admin, 'ib.programs.edit');
  const canDelete = hasPermission(admin, 'ib.programs.delete');
  const canManage = canCreate || canEdit || canDelete;

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<IbProgram | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<IbProgram[]>(['admin', 'ib-programs'], (signal) =>
    api.admin.getIbPrograms(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ib-programs'] });

  const saveProgram = useMutation({
    mutationFn: (values: IbProgramFormValues) =>
      editing ? api.admin.updateIbProgram(editing.id, values) : api.admin.createIbProgram(values),
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('ibPrograms.saveSucceeded', { name: values.name }));
    },
    // Inline in the modal, which stays open: the API's refusal names the
    // numbers, and it has to be read where they can be corrected.
  });

  const deleteProgram = useMutation({
    mutationFn: (program: IbProgram) => api.admin.deleteIbProgram(program.id),
    onSuccess: async (_data, program) => {
      await invalidate();
      toastSuccess(t('ibPrograms.deleteSucceeded', { name: program.name }));
    },
    onError: (error) => toastError(error, t('ibPrograms.deleteFailed')),
  });

  const rows = query.data ?? [];

  const openCreate = () => {
    setEditing(undefined);
    saveProgram.reset();
    setFormOpen(true);
  };

  const openEdit = (program: IbProgram) => {
    setEditing(program);
    saveProgram.reset();
    setFormOpen(true);
  };

  /*
   * The partner count is in the question, because it is the whole answer.
   * "Delete Gold?" and "Delete Gold, which 14 partners are paid by?" are
   * different decisions, and the API refuses the second anyway — asking with
   * the number saves the operator finding out by being refused.
   */
  const confirmDelete = async (program: IbProgram) => {
    const ok = await confirm({
      title: t('ibPrograms.confirmDeleteTitle', { name: program.name }),
      description:
        program.partnerCount > 0
          ? t('ibPrograms.confirmDeleteInUse', {
              name: program.name,
              count: String(program.partnerCount),
            })
          : t('ibPrograms.confirmDelete', { name: program.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteProgram.mutate(program);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('ibPrograms.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('ibPrograms.subtitle')}</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('ibPrograms.add')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('ibPrograms.loading')}
        endpoints={['GET /admin/ib-programs']}
        onRetry={query.refetch}
        errorMessage={t('ibPrograms.loadFailed')}
        error={query.error}
      >
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Percent className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">{t('ibPrograms.empty')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/20 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('ibPrograms.colName')}</th>
                    <th className="px-4 py-3">{t('ibPrograms.colMode')}</th>
                    <th className="px-4 py-3 text-right">{t('ibPrograms.colLevel1')}</th>
                    <th className="px-4 py-3 text-right">{t('ibPrograms.colLevel2')}</th>
                    <th className="px-4 py-3 text-right">{t('ibPrograms.colRebate')}</th>
                    <th className="px-4 py-3 text-right">{t('ibPrograms.colPartners')}</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((program) => (
                    <tr key={program.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground">{program.name}</span>
                        {/* A disabled programme pays nothing and takes no new
                            partners. Always shown, never inferred from a greyed
                            row — a state you have to notice by its styling is
                            one somebody misses. */}
                        {!program.enabled && (
                          <span className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {t('ibPrograms.disabled')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t(`ibPrograms.mode_${program.mode}` as Parameters<typeof t>[0])}
                      </td>
                      {/* An em dash where a leg does not pay, rather than 0% —
                          a zero is a rate somebody chose, and "this mode does
                          not pay this leg" is a different fact. */}
                      <td className="px-4 py-3 text-right tabular">
                        {program.mode === 'rebate_only' ? '—' : `${program.level1Rate}%`}
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {program.mode === 'rebate_only' ? '—' : `${program.level2Rate}%`}
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {program.mode === 'commission_only' ? '—' : `${program.rebateRate}%`}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-muted-foreground">
                        {program.partnerCount}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEdit(program)}
                                className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold hover:bg-muted focus-outline"
                              >
                                {t('common.edit')}
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void confirmDelete(program)}
                                className="rounded-lg border border-destructive/30 px-3 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10 focus-outline"
                              >
                                {t('common.delete')}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AsyncBoundary>

      <IbProgramFormModal
        open={formOpen}
        program={editing}
        saving={saveProgram.isPending}
        error={
          saveProgram.isError
            ? apiErrorMessage(saveProgram.error, t('ibPrograms.saveFailed'))
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveProgram.mutate(values)}
      />
    </div>
  );
}
