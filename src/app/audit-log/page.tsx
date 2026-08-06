'use client';

import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';
import type { AuditEntry, AuditListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { CursorPagination } from '@/components/cursor-pagination';
import { useCursorPages } from '@/hooks/use-cursor-pages';
import { t } from '@/lib/i18n';

// D-21: append-only admin action log. Read-only view — there is deliberately
// no edit or delete anywhere in this flow.
const PAGE_SIZE = 25;

/*
 * The action list is FETCHED, not written here.
 *
 * It used to be eight hardcoded entries, written when eight was all there was.
 * The system records thirty-four, so everything added because it had
 * previously gone UNRECORDED was also unfilterable — which is to say precisely
 * the actions somebody arrives looking for: who reworded the rejection reason
 * a client was emailed, who disabled a KYC step, who repointed a download link.
 *
 * A filter that silently offers a subset is the same defect as a silently
 * ignored query parameter (R-2.5): an operator reads "no results for Rejection
 * Reason Update" as "that never happened", when the truth is they could not
 * ask. Serving the vocabulary is the same rule as the permission catalog
 * (R-4.5) — the frontend never invents a key, and a new audited action appears
 * here without a frontend release.
 */

const ACTION_STYLES: Record<string, string> = {
  'kyc.approve': 'bg-success/10 text-success border-success/20',
  'kyc.reject': 'bg-destructive/10 text-destructive border-destructive/20',
  'kyc.claim': 'bg-primary/10 text-link border-primary/20',
  'admin.invite': 'bg-info/10 text-info border-info/20',
  'admin.update': 'bg-warning/10 text-warning border-warning/20',
};

export default function AuditLogPage() {
  /*
   * Cursor navigation, not numbered pages — PLATFORM-CONVENTIONS R-2.4.
   *
   * The audit log is append-only and only grows. A trail with a gap is worse
   * than no trail, because it is believed.
   *
   * "Jump to page N" is gone because a cursor names a row rather than an
   * ordinal. Filters are the real navigation here.
   */
  const pages = useCursorPages();
  const [action, setAction] = useState('');

  /*
   * Its own resource, so a failure here degrades the FILTER rather than the
   * log. The trail is the thing somebody came for; losing it because a
   * vocabulary request failed would be the wrong trade.
   */
  const actionsQuery = useResource(['audit-actions'], (signal) =>
    api.admin.getAuditActions(signal),
  );
  const actionOptions = actionsQuery.data ?? [];

  const { status, data, error, isFetching, refetch } = useResource<AuditListResponse>(
    ['audit-log', pages.cursor ?? 'first', action],
    async (signal) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pages.cursor) params.set('cursor', pages.cursor);
      if (action) params.set('action', action);
      const res = await api.get<AuditListResponse>(`/admin/audit-log?${params}`, { signal });
      return res.data;
    },
  );

  const rows = data?.items ?? [];
  // `nextCursor`, not `total`: the server only counts on request, because
  // counting is a full scan of the filtered set (R-2.4).
  const nextCursor = data?.nextCursor ?? null;

  const columns: Column<AuditEntry>[] = [
    {
      header: t('audit.colWhen'),
      cell: (e) => new Date(e.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      /*
       * WHO, and FROM WHERE.
       *
       * The address was recorded from the first day the column existed and was
       * absent from the response DTO, so this screen could not show it — "which
       * address did this administrator approve the payout from" was answerable
       * in SQL and nowhere an operator would look. On a money system that is
       * the question asked after an incident.
       *
       * The KIND is rendered only when it is not `admin`, because every row on
       * this screen is an admin action until background jobs land — labelling
       * all of them would be noise that hides the one row that is not.
       */
      header: t('audit.colActor'),
      cell: (e) => (
        <>
          <div className="text-foreground">{e.actorEmail}</div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted-foreground">
              {e.ipAddress ?? t('audit.noIp')}
            </span>
            {e.actorKind !== 'admin' && (
              <span className="rounded border border-border px-1 text-[10px] font-semibold uppercase text-muted-foreground">
                {e.actorKind}
              </span>
            )}
          </div>
        </>
      ),
      cellClassName: 'text-foreground',
    },
    {
      header: t('audit.colAction'),
      cell: (e) => (
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono ${
            ACTION_STYLES[e.action] ?? 'bg-muted text-muted-foreground border-border'
          }`}
        >
          {e.action}
        </span>
      ),
    },
    {
      header: t('audit.colSubject'),
      cell: (e) => (
        <>
          <div className="text-xs">{e.subjectType}</div>
          <div
            className="font-mono text-[11px] text-muted-foreground max-w-[160px] truncate"
            title={e.subjectId}
          >
            {e.subjectId}
          </div>
        </>
      ),
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('audit.colDetails'),
      cell: (e) =>
        e.details ? (
          <code className="block max-w-md overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
            {JSON.stringify(e.details)}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('audit.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('audit.subtitle')}</p>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={action || 'all'}
          onValueChange={(val) => {
            pages.reset();
            setAction(val === 'all' ? '' : val);
          }}
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder={t('auditLog.filterAllActions')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('audit.allActions')}</SelectItem>
            {actionOptions.map(({ action: value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AsyncBoundary
        status={status}
        label="Loading audit log"
        endpoints={['GET /admin/audit-log?page&limit&action']}
        onRetry={refetch}
        errorMessage="Failed to load the audit log."
        error={error}
      >
        <DataTable
          caption="Admin actions, newest first"
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          dimmed={isFetching}
          empty={
            <EmptyState
              icon={ScrollText}
              message={action ? 'No entries for this action.' : 'No admin actions recorded yet.'}
            />
          }
        />
        {rows.length > 0 && (
          <div className="mt-6">
            <CursorPagination
              pageNumber={pages.pageNumber}
              pageSize={PAGE_SIZE}
              showing={rows.length}
              canGoBack={pages.canGoBack}
              canGoForward={Boolean(nextCursor)}
              onBack={pages.goBack}
              onNext={() => pages.goNext(nextCursor)}
              noun={['entry', 'entries']}
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
