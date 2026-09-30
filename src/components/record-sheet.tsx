'use client';

import * as React from 'react';
import { SearchX } from 'lucide-react';
import type { Column } from '@/components/data-table';
import type { RowAction } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMarkSubjectRead } from '@/components/notifications/use-mark-subject-read';
import type { OpenedRecordState } from '@/hooks/use-open-record';
import type { AdminNotificationSubjectKind } from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';

// With the panel, so a desk wires both from one import.
export { useOpenedRecord } from '@/hooks/use-open-record';

/**
 * A record's detail panel — the one shape every desk opens a record in.
 *
 * World-class consoles share one rule: every record has a detail view, and a
 * notification is just a link to it. So a task's link (`?open=<id>`), a click
 * on a row and a pasted URL all open THIS, over the desk's normal queue, with
 * the open row marked in the list beneath.
 *
 * It is BUILT from what the desk already defines, never a second copy of it:
 *
 *  - the body is the desk's own columns — every field the desk lists, as a
 *    label and its value, drawn by the very cell renderer the table uses;
 *  - the footer is the desk's own row actions as real buttons — the same
 *    permissions, confirm dialogs and idempotency keys as the row menu.
 *
 * A desk therefore cannot show a field in its table and forget it here, or
 * offer an action in its menu that the panel lacks. That is what retires the
 * class of "the notification landed somewhere half-built".
 *
 * Integrity rules it keeps: it shows ONLY the record the URL names (the cache
 * may still hold the previous one — its Approve must never be one click away),
 * a missing, out-of-territory or malformed id reads "not available", and the
 * record's task is read only once the record is actually on screen.
 */
export function RecordSheet<T>({
  open,
  row,
  rowKey,
  subjectKind,
  title,
  status,
  callout,
  omit = [],
  extraFields,
  columns,
  actions,
  extraActions,
}: {
  /** From `useOpenedRecord`: closed while the URL opens nothing. */
  open: OpenedRecordState<unknown>;
  /** The desk's list asked for that one id; absent on a ready page = not visible. */
  row: T | undefined;
  rowKey: (row: T) => string;
  /** Which notification subject this record is, for "opening it reads its task". */
  subjectKind: AdminNotificationSubjectKind | ((row: T) => AdminNotificationSubjectKind);
  /** "Deposit · $11.11" — what the record IS, in the reader's words. */
  title: (row: T) => string;
  /** The record's state, beside the title — the first thing the reader looks for. */
  status?: (row: T) => React.ReactNode;
  /**
   * What the record's outcome SAYS — a refusal reason, a provider's note, why
   * it needs attention — above the details, where it is read first.
   */
  callout?: (row: T) => React.ReactNode;
  /** Column headers already said by the title or status, left out of the list. */
  omit?: string[];
  /**
   * Fields too long for a table cell but part of the record — an applicant's
   * motivation, who decided and when. Listed after the columns; an empty value
   * is left out rather than shown as a dash.
   */
  extraFields?: (row: T) => Array<{ label: string; value: React.ReactNode }>;
  /** The desk's table columns; the actions column (`sticky: 'end'`) is left out. */
  columns: Column<T>[];
  /** The desk's row actions — the same list its row menu shows. */
  actions: (row: T) => RowAction[];
  /** Anything the desk keeps outside its menu (e.g. a retry button). */
  extraActions?: (row: T) => React.ReactNode;
}) {
  const { query } = open;
  // The record last open — still known while the panel animates out, when the
  // URL has already dropped it.
  const openRow = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (open.openId) openRow.current = open.openId;
  }, [open.openId]);
  const current = row && rowKey(row) === open.openId ? row : undefined;
  const settling =
    !open.malformed && (query.status === 'loading' || (!current && query.isFetching));
  const unavailable =
    open.malformed ||
    query.status === 'notFound' ||
    query.status === 'forbidden' ||
    (query.status === 'ready' && !current && !settling);

  const kind = current
    ? typeof subjectKind === 'function'
      ? subjectKind(current)
      : subjectKind
    : 'transaction';
  useMarkSubjectRead(kind, query.status === 'ready' && current ? rowKey(current) : undefined);

  const fields = columns.filter(
    (column) => column.sticky !== 'end' && !omit.includes(column.header),
  );
  const items = current ? actions(current) : [];
  const listed = current
    ? [
        ...fields.map((column) => ({ label: column.header, value: column.cell(current) })),
        ...(extraFields?.(current) ?? []).filter(
          (field) => field.value !== null && field.value !== undefined && field.value !== '',
        ),
      ]
    : [];

  return (
    <Sheet open={Boolean(open.openId)} onOpenChange={(next) => !next && open.close()}>
      <SheetContent
        className="sm:max-w-xl"
        aria-describedby={undefined}
        // Focus goes back to the record's row, so a keyboard reader keeps their
        // place in the queue. A panel opened by a link has no trigger, and Radix
        // would otherwise drop focus on the page body.
        onCloseAutoFocus={(event) => {
          const row = openRow.current
            ? document.querySelector<HTMLElement>(
                `tr[data-row-key="${CSS.escape(openRow.current)}"]`,
              )
            : null;
          if (row) {
            event.preventDefault();
            row.focus();
          }
        }}
      >
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SheetTitle className="text-lg">
              {current ? title(current) : t('records.title')}
            </SheetTitle>
            {current && status?.(current)}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4" aria-busy={settling || undefined}>
          {settling ? (
            <div role="status" className="space-y-4">
              <span className="sr-only">{t('records.loading')}</span>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="grid grid-cols-[8rem_1fr] gap-4">
                  <div className="h-3 animate-pulse rounded bg-muted" />
                  <div className="h-3 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : unavailable ? (
            <div role="status" className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <SearchX className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">{t('records.unavailableTitle')}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {t('records.unavailableBody')}
              </p>
            </div>
          ) : current ? (
            <>
              {callout?.(current)}
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-[minmax(7rem,32%)_1fr]">
                {listed.map((field) => (
                  <React.Fragment key={field.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:pt-0.5">
                      {field.label}
                    </dt>
                    <dd className="-mt-3 min-w-0 whitespace-pre-line break-words sm:mt-0 [&_.truncate]:whitespace-normal [&_[class*='max-w-']]:max-w-none">
                      {field.value}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </>
          ) : (
            <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-destructive">{t('records.loadFailed')}</p>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          )}
        </div>

        {current && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
            {extraActions?.(current)}
            {items.length === 0 && !extraActions ? (
              <p className="me-auto text-xs text-muted-foreground">{t('records.noActions')}</p>
            ) : null}
            {/* Destructive first (leftmost), the primary action last — where the
                eye ends and the thumb rests. */}
            {[...items]
              .sort((a, b) => Number(Boolean(b.destructive)) - Number(Boolean(a.destructive)))
              .map((item, index, sorted) => {
                const Icon = item.icon;
                const primary = index === sorted.length - 1 && !item.destructive;
                return (
                  <Button
                    key={item.label}
                    size="sm"
                    variant={primary ? 'default' : 'outline'}
                    className={
                      item.destructive
                        ? 'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
                        : undefined
                    }
                    disabled={item.disabled}
                    onClick={item.onSelect}
                    {...(item.href ? { asChild: true } : {})}
                  >
                    {item.href ? (
                      <a href={item.href}>
                        {Icon && <Icon aria-hidden />}
                        {item.label}
                      </a>
                    ) : (
                      <>
                        {Icon && <Icon aria-hidden />}
                        {item.label}
                      </>
                    )}
                  </Button>
                );
              })}
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A highlighted note above a record's details — its outcome, in words. */
export function RecordCallout({
  tone,
  label,
  children,
}: {
  tone: 'destructive' | 'warning' | 'info';
  label: string;
  children: React.ReactNode;
}) {
  const tones = {
    destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    info: 'border-info/30 bg-info/5 text-info',
  } as const;
  return (
    <div className={`mb-5 rounded-lg border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-foreground">{children}</p>
    </div>
  );
}
