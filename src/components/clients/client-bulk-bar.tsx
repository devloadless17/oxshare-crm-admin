'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Tag, TagsIcon, X } from 'lucide-react';
import api from '@/lib/api';
import type { BulkClientFilter, BulkTagResult, ClientTagWithCount } from '@/lib/api/admin';
import { newIdempotencyKey } from '@/lib/api/client';
import { apiErrorCode, apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import { ChipInput } from '@/components/ui/chip-input';
import { ExportButton } from '@/components/export-button';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

type BulkMode = 'add' | 'remove' | 'replace';

/**
 * The clients list's bulk actions (Slice 3) — the buyer's old CRM: select many,
 * tag many. Rendered inside the table's selection bar.
 *
 * Two targets, never mixed:
 *   - the PICKED rows (at most a page);
 *   - "all N matching" — every client the current filter matches, sent as the
 *     filter plus the count the reader was shown, so the server refuses
 *     (409 BULK_TARGET_CHANGED) rather than act on clients nobody counted.
 *
 * Every rule is the server's: territory (picked rows outside it are skipped
 * and counted), the "this hands N clients to another desk" question (409
 * TAG_CHANGE_LEAVES_SCOPE, asked here, then resent confirmed), no country tags.
 * One idempotency key per intended change, reused by its confirm and retries.
 */
export function ClientBulkBar({
  selectedIds,
  pageCount,
  total,
  filter,
  exportFilters,
  tags,
  onDone,
}: {
  selectedIds: string[];
  /** Rows on this page — "select all matching" is offered once they are all picked. */
  pageCount: number;
  /** Clients the filter matches, as the list reported it. */
  total: number;
  filter: BulkClientFilter;
  /** The page's own export filters, for "export all matching". */
  exportFilters: URLSearchParams;
  tags: readonly ClientTagWithCount[];
  onDone: () => void;
}) {
  const [allMatching, setAllMatching] = React.useState(false);
  const [mode, setMode] = React.useState<BulkMode | null>(null);
  const whole = selectedIds.length >= pageCount && total > pageCount;
  const count = allMatching ? total : selectedIds.length;

  const selectedExport = React.useMemo(
    () => (allMatching ? exportFilters : new URLSearchParams({ ids: selectedIds.join(',') })),
    [allMatching, exportFilters, selectedIds],
  );

  return (
    <>
      {whole && !allMatching && (
        <button
          type="button"
          onClick={() => setAllMatching(true)}
          className="rounded px-2 py-1 font-semibold underline-offset-2 hover:underline"
        >
          {t('bulk.selectAllMatching', { count: total })}
        </button>
      )}
      {allMatching && (
        <span className="inline-flex items-center gap-1 font-semibold">
          {t('bulk.allMatchingSelected', { count: total })}
          <button
            type="button"
            onClick={() => setAllMatching(false)}
            aria-label={t('bulk.onlyThisPage')}
            className="rounded p-0.5 hover:bg-primary/20"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      )}
      <BarButton icon={Tag} label={t('bulk.addTags')} onClick={() => setMode('add')} />
      <BarButton icon={TagsIcon} label={t('bulk.removeTags')} onClick={() => setMode('remove')} />
      <BarButton
        icon={ArrowRightLeft}
        label={t('bulk.replaceTag')}
        onClick={() => setMode('replace')}
      />
      <ExportButton resource="clients" filters={selectedExport} label={t('bulk.export')} />
      {mode && (
        <BulkTagDialog
          mode={mode}
          count={count}
          target={
            allMatching
              ? { filter, expectedCount: total }
              : { ids: selectedIds.map((id) => Number(id)) }
          }
          tags={tags}
          onClose={() => setMode(null)}
          onDone={() => {
            setMode(null);
            setAllMatching(false);
            onDone();
          }}
        />
      )}
    </>
  );
}

function BarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-1 font-medium transition-colors hover:bg-primary/20"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

function BulkTagDialog({
  mode,
  count,
  target,
  tags,
  onClose,
  onDone,
}: {
  mode: BulkMode;
  count: number;
  target: { ids?: number[]; filter?: BulkClientFilter; expectedCount?: number };
  tags: readonly ClientTagWithCount[];
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [first, setFirst] = React.useState<string[]>([]);
  const [second, setSecond] = React.useState<string[]>([]);
  /** ONE key per intended change: its confirm and its retries reuse it. */
  const [key, setKey] = React.useState(newIdempotencyKey);
  const [leaving, setLeaving] = React.useState<number | null>(null);
  const [moved, setMoved] = React.useState<number | null>(null);
  const [expected, setExpected] = React.useState(target.expectedCount);

  // Country tags are derived from the client's country: never offered.
  const options = tags
    .filter((tag) => !tag.countryCode)
    .map((tag) => ({ value: tag.id, label: tag.label }));
  const add = mode === 'add' ? first : mode === 'replace' ? second : [];
  const remove = mode === 'remove' || mode === 'replace' ? first : [];
  const ready = mode === 'replace' ? first.length > 0 && second.length > 0 : first.length > 0;

  const run = useMutation({
    mutationFn: (confirmLeavesScope: boolean) =>
      api.admin.bulkTags(
        {
          target: target.filter ? { filter: target.filter, expectedCount: expected } : target,
          add,
          remove,
          confirmLeavesScope,
        },
        key,
      ),
    onSuccess: async (result: BulkTagResult) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients.all() });
      await queryClient.invalidateQueries({ queryKey: keys.tags.all() });
      toastSuccess(
        t('bulk.done', { changed: result.changed, matched: result.matched }) +
          (result.skippedOutOfScope > 0
            ? ` ${t('bulk.skipped', { count: result.skippedOutOfScope })}`
            : ''),
      );
      onDone();
    },
    onError: (error) => {
      const code = apiErrorCode(error);
      const n = Number(apiFieldErrors(error).count ?? 0);
      if (code === 'TAG_CHANGE_LEAVES_SCOPE') setLeaving(n);
      if (code === 'BULK_TARGET_CHANGED') {
        // A different set: a different change, so a fresh key.
        setMoved(n);
        setExpected(n);
        setKey(newIdempotencyKey());
      }
    },
  });

  const otherError =
    run.isError &&
    !['TAG_CHANGE_LEAVES_SCOPE', 'BULK_TARGET_CHANGED'].includes(apiErrorCode(run.error) ?? '')
      ? apiErrorMessage(run.error, t('bulk.failed'))
      : undefined;

  return (
    <Modal
      open
      busy={run.isPending}
      onClose={onClose}
      title={t(`bulk.title.${mode}`, { count: moved ?? count })}
    >
      <div className="space-y-4">
        <div>
          <span className="text-xs font-semibold">
            {mode === 'replace' ? t('bulk.replaceFrom') : t('bulk.tagsLabel')}
          </span>
          <div className="mt-1">
            <ChipInput
              value={first}
              onChange={setFirst}
              options={options}
              ariaLabel={t('bulk.tagsLabel')}
            />
          </div>
        </div>
        {mode === 'replace' && (
          <div>
            <span className="text-xs font-semibold">{t('bulk.replaceTo')}</span>
            <div className="mt-1">
              <ChipInput
                value={second}
                onChange={setSecond}
                options={options}
                ariaLabel={t('bulk.replaceTo')}
              />
            </div>
          </div>
        )}
        {moved !== null && (
          <p
            className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning"
            role="alert"
          >
            {t('bulk.targetChanged', { count: moved })}
          </p>
        )}
        {leaving !== null && (
          <p
            className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning"
            role="alert"
          >
            {t('bulk.leavesScope', { count: leaving })}
          </p>
        )}
        {otherError && (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
            role="alert"
          >
            {otherError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
          >
            {t('bulk.cancel')}
          </button>
          <button
            type="button"
            disabled={!ready || run.isPending}
            onClick={() => run.mutate(leaving !== null)}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {leaving !== null
              ? t('bulk.handOver', { count: leaving })
              : t('bulk.apply', { count: moved ?? count })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
