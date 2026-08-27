'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { PauseCircle, Pencil, Percent, PlayCircle, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { IbProgram } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { t } from '@/lib/i18n';

/**
 * Commission programmes — FR-ADM-10, and the screen behind FR-IB-05/06/16.
 *
 * ## This is the ONLY catalogue of terms
 *
 * `/ib-levels` used to sit beside it, owning PLACEMENT: how deep the chain ran,
 * what each rung was called, whether new partners could be put there. Both
 * halves live here now — a programme's ladder decides how far its holder's
 * earnings reach, and its rates decide what they are paid — so there is no
 * second screen that can disagree with this one.
 *
 * ## The rates are per DEPTH, and the ladder's LENGTH is the reach
 *
 * Depth 1 is what the holder earns from their OWN clients, depth 2 from a
 * sub-partner's, and so on. The count of levels is how far that programme's
 * earnings travel, which is why the ladder column states it in words rather
 * than leaving an operator to count chips.
 *
 * Never "L1 / L2" as a bare heading: the short form reads as the RUNG a partner
 * stands on, and that is the misreading an operator would price on.
 *
 * ## Client-side paging, and why that is right HERE and nowhere else
 *
 * `GET /admin/ib-programs` returns the WHOLE catalogue in one array — it is a
 * handful of rows an operator maintains by hand, not a log that grows. So the
 * rows held ARE the dataset, paging them is a view concern, and "page 2" means
 * what it says. A server-paginated list must keep using `pagination`.
 */
const PROGRAM_PAGING = { noun: ['programme', 'programmes'] as [string, string] };

export default function IbProgramsPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'ib.programs.create');
  const canEdit = hasPermission(admin, 'ib.programs.edit');
  const canDelete = hasPermission(admin, 'ib.programs.delete');

  const queryClient = useQueryClient();
  const confirm = useConfirm();

  /* Which row's actions are mid-flight, so only that menu shows a spinner. */
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const query = useResource<IbProgram[]>(['admin', 'ib-programs'], (signal) =>
    api.admin.getIbPrograms(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ib-programs'] });

  /*
   * ── SWITCHING A PROGRAMME OFF IS AN ACTION, NOT A FIELD ──────────────────
   *
   * It was a checkbox on the form, saved alongside the rates. Those are not the
   * same kind of act: a rate edit takes effect on the next trade, and disabling
   * stops the programme paying ANYBODY and refuses new partners the moment it
   * lands. Behind one Save button they were one click, and the destructive half
   * was the silent one.
   *
   * A PUT with only `enabled` — every other field is optional on that endpoint,
   * and omitting them is what keeps this from re-sending a rate card the
   * operator may not have looked at since it was fetched.
   */
  const toggleEnabled = useMutation({
    mutationFn: (program: IbProgram) => {
      setBusyId(program.id);
      return api.admin.updateIbProgram(program.id, { enabled: !program.enabled });
    },
    onSuccess: async (_data, program) => {
      await invalidate();
      toastSuccess(
        program.enabled
          ? t('ibPrograms.disabledSucceeded', { name: program.name })
          : t('ibPrograms.enabledSucceeded', { name: program.name }),
      );
    },
    /*
     * The API's own message. `IbProgramsService.update` refuses to disable a
     * programme partners stand on and names the count — a generic failure would
     * turn that into "it did not work".
     */
    onError: (error) => toastError(error, t('ibPrograms.toggleFailed')),
    onSettled: () => setBusyId(null),
  });

  const deleteProgram = useMutation({
    mutationFn: (program: IbProgram) => {
      setBusyId(program.id);
      return api.admin.deleteIbProgram(program.id);
    },
    onSuccess: async (_data, program) => {
      await invalidate();
      toastSuccess(t('ibPrograms.deleteSucceeded', { name: program.name }));
    },
    onError: (error) => toastError(error, t('ibPrograms.deleteFailed')),
    onSettled: () => setBusyId(null),
  });

  /*
   * The partner count is in the question, because it is the whole answer.
   * "Delete Gold?" and "Delete Gold, which 14 partners are paid by?" are
   * different decisions, and the API refuses the second anyway — asking with
   * the number saves the operator finding out by being refused.
   */
  /*
   * ASKED, because the consequence is immediate and invisible on this screen.
   *
   * Disabling stops the programme paying every partner on it and refuses new
   * ones; the row goes grey and nothing else says what changed. The partner
   * count is in the question for the same reason it is in the delete one —
   * "Disable Gold?" and "Disable Gold, which 14 partners are paid by?" are
   * different decisions.
   *
   * Enabling is NOT asked. It has no victim, and a confirmation on a harmless
   * act is what teaches operators to dismiss the one that matters.
   */
  const confirmToggle = async (program: IbProgram) => {
    if (!program.enabled) {
      toggleEnabled.mutate(program);
      return;
    }

    const ok = await confirm({
      title: t('ibPrograms.confirmDisableTitle', { name: program.name }),
      description: t('ibPrograms.confirmDisable', { count: String(program.partnerCount) }),
      confirmLabel: t('ibPrograms.disable'),
      destructive: true,
    });
    if (ok) toggleEnabled.mutate(program);
  };

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

  const columns: Column<IbProgram>[] = [
    {
      header: t('ibPrograms.colName'),
      cell: (program) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{program.name}</span>
          {/* A disabled programme pays nothing and takes no new partners.
              Always shown, never inferred from a greyed row — a state you have
              to notice by its styling is one somebody misses. */}
          {!program.enabled && (
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {t('ibPrograms.disabled')}
            </span>
          )}
          {/*
            Shown ONLY when the basis is not the default (FR-IB-16).

            A badge on every row would be noise — every programme prices on
            commission and swap unless somebody deliberately changed it. A badge
            on the exception is the opposite: `spread` prices against a product
            markup that may still be 0, and a programme silently earning nothing
            is precisely what an operator needs to spot from the list rather
            than by opening each one.
          */}
          {program.revenueBasis !== 'commission_swap' && (
            <span
              title={t(`ibPrograms.basisHint_${program.revenueBasis}` as Parameters<typeof t>[0])}
              className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground"
            >
              {t(`ibPrograms.basis_${program.revenueBasis}` as Parameters<typeof t>[0])}
            </span>
          )}
        </span>
      ),
      sortable: true,
      sortKey: 'name',
    },
    {
      header: t('ibPrograms.colMode'),
      cell: (program) => t(`ibPrograms.mode_${program.mode}` as Parameters<typeof t>[0]),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'mode',
    },
    {
      header: t('ibPrograms.colLadder'),
      /* An em dash where a leg does not pay, rather than 0% — a zero is a rate
         somebody chose, and "this mode does not pay this leg" is a different
         fact. */
      cell: (program) =>
        program.mode === 'rebate_only' || program.tiers.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {program.tiers.map((tier) => (
              <span
                key={tier.depth}
                title={t('ibPrograms.tierChipTitle', {
                  depth: String(tier.depth),
                  rate: tier.rate,
                })}
                className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular"
              >
                <span className="font-semibold text-muted-foreground">L{tier.depth}</span>
                <span className="text-foreground">{tier.rate}%</span>
              </span>
            ))}
            {/* The REACH in words. A row of chips is a thing an operator has to
                count; how far the money travels is the fact they came to the
                screen for. */}
            <span className="ml-1 text-[10px] text-muted-foreground">
              {t('ibPrograms.reachShort', { count: String(program.tiers.length) })}
            </span>
          </span>
        ),
      /*
       * NOT sortable, deliberately.
       *
       * The client-side sort reads `row[sortKey]` — an actual property. A
       * ladder has no scalar to name: `tiers` is an ARRAY, and comparing it as
       * text gives `[object Object]` for every row, which is a sort that does
       * nothing while presenting a clickable header that says it did
       * something. The one ordering that would mean anything here is by REACH,
       * and the row carries no such field.
       *
       * Add it when the API does — `tierCount` on the row would make this one
       * line — rather than faking it with a comparator the table has no hook
       * for.
       */
      sortable: false,
    },
    {
      header: t('ibPrograms.colRebate'),
      align: 'right',
      cell: (program) =>
        program.mode === 'commission_only' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${program.rebateRate}%`
        ),
      cellClassName: 'tabular whitespace-nowrap',
      sortable: true,
      sortKey: 'rebateRate',
      /*
       * MONEY, not `number`. The rate is a decimal STRING (§6.1) and the
       * default text comparison sorts '100.0000' below '9.0000' — a rate table
       * that looks sorted and is not.
       */
      sortType: 'money',
    },
    {
      header: t('ibPrograms.colPartners'),
      align: 'right',
      cell: (program) => program.partnerCount,
      cellClassName: 'tabular text-muted-foreground',
      sortable: true,
      sortKey: 'partnerCount',
      sortType: 'number',
    },
    actionsColumn<IbProgram>((program) => (
      <RowActions
        label={t('table.rowActions', { name: program.name })}
        busy={busyId === program.id}
        items={[
          ...(canEdit
            ? [
                {
                  label: t('common.edit'),
                  icon: Pencil,
                  href: `/ib-programs/${program.id}/edit`,
                },
                {
                  /*
                   * DESTRUCTIVE when switching OFF, and only then. Disabling
                   * stops the programme paying anybody and refuses new
                   * partners; enabling one is an ordinary act with no victim.
                   * The same control, two very different consequences — and
                   * the styling is what says which one is about to happen.
                   */
                  label: program.enabled ? t('ibPrograms.disable') : t('ibPrograms.enable'),
                  icon: program.enabled ? PauseCircle : PlayCircle,
                  destructive: program.enabled,
                  separatorBefore: true,
                  onSelect: () => void confirmToggle(program),
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  label: t('common.delete'),
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => void confirmDelete(program),
                },
              ]
            : []),
        ]}
      />
    )),
  ];

  return (
    /*
     * `min-h-0` is load-bearing, not decoration. `DataTable fill` resolves its
     * height against the nearest bounded ancestor; without this the flex column
     * resolves to `auto` and the table quietly reverts to growing past the fold
     * — a layout bug with no error message.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('ibPrograms.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('ibPrograms.subtitle')}</p>
        </div>
        {/* A LINK, not a button: the editor is a page now, so this is an
            address — middle-clickable, bookmarkable, and back-navigable. */}
        {canCreate && (
          <Link
            href="/ib-programs/new"
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('ibPrograms.add')}
          </Link>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('ibPrograms.loading')}
        endpoints={['GET /admin/ib-programs']}
        onRetry={query.refetch}
        errorMessage={apiErrorMessage(query.error, t('ibPrograms.loadFailed'))}
        error={query.error}
        fill
      >
        <DataTable
          caption={t('ibPrograms.title')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(program) => program.id}
          dimmed={query.isFetching}
          clientPagination={PROGRAM_PAGING}
          fill
          empty={<EmptyState icon={Percent} message={t('ibPrograms.empty')} />}
        />
      </AsyncBoundary>
    </div>
  );
}
