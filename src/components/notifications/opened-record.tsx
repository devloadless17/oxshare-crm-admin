'use client';

import * as React from 'react';
import { BellRing, SearchX, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import type { OpenedRecordState } from '@/hooks/use-open-record';

// With the component, so a desk wires both from one import.
export { useOpenedRecord } from '@/hooks/use-open-record';
import type { AdminNotificationSubjectKind } from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';
import { useMarkSubjectRead } from './use-mark-subject-read';

/**
 * The ONE record a notification opened, held above the desk's normal queue.
 *
 * Drawn with the desk's own columns and row actions, so it is decided exactly
 * as it would be from the list — same confirm dialogs, same permissions, same
 * idempotency keys. The queue below stays unfiltered: the next thing a reader
 * does after handling one item is usually the next one.
 *
 * It says what became of the record rather than going blank: a colleague who
 * approved it a minute ago shows up as the row's own state, live, because the
 * query sits under the desk's list key and moves with every refresh of it. A
 * record the reader cannot see — gone, or outside their territory, which the
 * API answers identically on purpose — reads as unavailable, never as an empty
 * queue.
 *
 * Opening it reads its notification, the rule `useMarkSubjectRead` owns — but
 * only once the record has actually been shown.
 */
export function OpenedRecord<T>({
  open,
  row,
  columns,
  rowKey,
  subjectKind,
}: {
  /** From `useOpenedRecord`: nothing is drawn while the URL opens nothing. */
  open: OpenedRecordState<unknown>;
  /** The page's only row; absent on a ready page = not visible to this reader. */
  row: T | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  subjectKind: AdminNotificationSubjectKind;
}) {
  const { query, close: onClose } = open;
  /*
   * Only the record the URL NAMES. `useResource` keeps the previous answer on
   * screen while a new key loads, so following a second notification would
   * otherwise show the FIRST record, actions live, for the length of a round
   * trip — an Approve one click from the wrong deposit.
   */
  const current = row && rowKey(row) === open.openId ? row : undefined;
  const settling =
    !open.malformed && (query.status === 'loading' || (!current && query.isFetching));
  useMarkSubjectRead(
    subjectKind,
    query.status === 'ready' ? current && rowKey(current) : undefined,
  );

  // Brought into view once it has something to show — a long page must not
  // hide the very thing the reader clicked to see.
  // Once per record, never on a later refresh of the queue under the reader.
  const ref = React.useRef<HTMLElement>(null);
  const scrolledFor = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (settling || !open.openId || scrolledFor.current === open.openId) return;
    scrolledFor.current = open.openId;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [settling, open.openId]);

  if (!open.openId) return null;

  const unavailable =
    open.malformed ||
    query.status === 'notFound' ||
    query.status === 'forbidden' ||
    (query.status === 'ready' && !current);

  return (
    <section
      ref={ref}
      aria-label={t('notifications.openedTitle')}
      className="shrink-0 overflow-hidden rounded-lg border border-primary/40 bg-primary/[0.03] shadow-sm ring-1 ring-primary/15 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
    >
      <header className="flex items-center gap-2 border-b border-primary/15 px-4 py-2">
        <BellRing className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-medium">{t('notifications.openedTitle')}</h2>
        <span className="text-xs text-muted-foreground">{t('notifications.openedHint')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ms-auto size-7"
          onClick={onClose}
          aria-label={t('notifications.openedClose')}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div>
        {settling ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            {t('notifications.openedLoading')}
          </p>
        ) : unavailable ? (
          <p
            role="status"
            className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"
          >
            <SearchX className="size-4 shrink-0" aria-hidden />
            {t('notifications.openedUnavailable')}
          </p>
        ) : current ? (
          <DataTable rows={[current]} columns={columns} rowKey={rowKey} />
        ) : (
          <p role="alert" className="flex items-center gap-3 px-4 py-3 text-sm text-destructive">
            {t('notifications.openedFailed')}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </p>
        )}
      </div>
    </section>
  );
}
