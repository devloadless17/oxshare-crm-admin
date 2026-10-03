'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { adminApi, type RejectionContext, type RejectionReason } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { ArabicSubline } from '@/components/arabic-text-field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  ReasonFormModal,
  type ReasonFormValues,
} from '@/components/rejection-reasons/reason-form-modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The order the queues are listed in. Every one can be added to — partner
 * reasons included, since the API took `context: 'partner'` on create (0179).
 */
const CONTEXTS: readonly RejectionContext[] = ['kyc', 'withdrawal', 'deposit', 'partner'];

type Editing = { context: RejectionContext; reason?: RejectionReason };

/**
 * The rejection-reason catalogue (FR-ADM-03) — what a reviewer picks from when
 * turning down a verification, a withdrawal, a deposit or a partner application,
 * in English and, optionally, Arabic (0179). The client is shown the reason in
 * their language: the backend matches a decision's stored English against this
 * list to serve its Arabic, so rewording a reason here also changes which past
 * decisions find a translation.
 *
 * Reading the list needs no key; each WRITE is its own on the API — `kyc.create`,
 * `kyc.edit`, `kyc.delete` — and each control here checks the one it needs.
 */
export default function RejectionReasonsPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'kyc.create');
  const canEdit = hasPermission(admin, 'kyc.edit');
  const canDelete = hasPermission(admin, 'kyc.delete');
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<Editing | null>(null);

  const query = useResource<RejectionReason[]>(keys.rejectionReasons.all(), (signal) =>
    adminApi.getAllRejectionReasons(signal),
  );

  // The desks cache their own context's list; an edit here must reach them too.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.rejectionReasons.all() }),
      queryClient.invalidateQueries({ queryKey: keys.withdrawals.rejectionReasons() }),
      queryClient.invalidateQueries({ queryKey: keys.deposits.rejectionReasons() }),
    ]);

  const save = useMutation({
    mutationFn: ({ target, values }: { target: Editing; values: ReasonFormValues }) => {
      // `labelAr: null` CLEARS the Arabic — a blank box is a deliberate removal.
      if (target.reason) return adminApi.updateRejectionReason(target.reason.id, values);
      return adminApi.createRejectionReason({ context: target.context, ...values });
    },
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
      toastSuccess(t('reasons.saved'));
    },
    // No toast on failure: the modal stays open and shows the refusal by its fields.
  });

  const remove = useMutation({
    mutationFn: (reason: RejectionReason) => adminApi.deleteRejectionReason(reason.id),
    onSuccess: async () => {
      await invalidate();
      toastSuccess(t('reasons.deleted'));
    },
    onError: (error) => toastError(error, t('reasons.deleteFailed')),
  });

  const open = (target: Editing) => {
    save.reset();
    setEditing(target);
  };

  const confirmDelete = async (reason: RejectionReason) => {
    const ok = await confirm({
      title: t('reasons.confirmDeleteTitle', { label: reason.label }),
      description: t('reasons.confirmDeleteBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (ok) remove.mutate(reason);
  };

  const reasons = query.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-12">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('reasons.title')}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t('reasons.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('reasons.loading')}
        endpoints={['GET /admin/rejection-reasons']}
        onRetry={query.refetch}
        errorMessage={t('reasons.loadFailed')}
        error={query.error}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {CONTEXTS.map((context) => {
            const rows = reasons.filter((reason) => reason.context === context);
            const heading = t(`reasons.context.${context}`);
            const headingId = `reasons-${context}`;
            return (
              <section
                key={context}
                aria-labelledby={headingId}
                className="rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <h2 id={headingId} className="text-sm font-bold text-foreground">
                    {heading}{' '}
                    <span className="font-normal text-muted-foreground">({rows.length})</span>
                  </h2>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => open({ context })}
                      aria-label={t('reasons.addTo', { context: heading })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 px-3 text-xs font-semibold text-link hover:bg-primary/10 focus-outline"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('reasons.add')}
                    </button>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">{t('reasons.empty')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {rows.map((reason) => (
                      <li
                        key={reason.id}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1 text-sm">
                          <span className="block font-medium text-foreground">{reason.label}</span>
                          <ArabicSubline value={reason.labelAr} />
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => open({ context, reason })}
                              aria-label={t('reasons.editNamed', { label: reason.label })}
                              title={t('common.edit')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => void confirmDelete(reason)}
                              disabled={remove.isPending && remove.variables?.id === reason.id}
                              aria-label={t('reasons.deleteNamed', { label: reason.label })}
                              title={t('common.delete')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 focus-outline"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </AsyncBoundary>

      <ReasonFormModal
        open={editing !== null}
        context={editing?.context ?? 'kyc'}
        reason={editing?.reason}
        saving={save.isPending}
        error={save.isError ? apiErrorMessage(save.error, t('reasons.saveFailed')) : undefined}
        onClose={() => setEditing(null)}
        onSubmit={(values) => editing && save.mutate({ target: editing, values })}
      />
    </div>
  );
}
