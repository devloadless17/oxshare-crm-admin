'use client';

import { Suspense } from 'react';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';
import type { AuditEntry, AuditListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { PageLoader } from '@/components/ui/loader';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { pageParam } from '@/lib/page-param';
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

/*
 * `useSearchParams()` requires a Suspense boundary at prerender or
 * `npm run build` fails — and `next dev` does NOT, so CI is where you find out.
 * Same shape as `clients/page.tsx`.
 */
export default function AuditLogPage() {
  return (
    <Suspense fallback={<PageLoader label={t('audit.title')} />}>
      <AuditLogPageContent />
    </Suspense>
  );
}

function AuditLogPageContent() {
  /*
   * Numbered pages, with the page and the action filter both in the URL.
   *
   * The append-only argument for a cursor still holds — a trail with a gap is
   * worse than no trail, because it is believed. What it did not survive is
   * what an investigation actually needs: "page 12 of the log, filtered to
   * kyc.reject" has to be a link somebody can paste into a ticket, and a
   * cursor held in component state cannot be one. The log also only ever grows
   * at the END, so a reader walking backwards through history is not stepping
   * over rows being inserted ahead of them.
   *
   * THIS SCREEN HAS NO COLUMN SORTING, and that is not an omission: the
   * endpoint hardcodes `ORDER BY created_at DESC, id DESC` and accepts no
   * `sort` parameter at all. Every column below is therefore explicitly
   * `sortable: false` — see the note on the columns.
   */
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  const action = url.get('action');

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
    ['audit-log', page, action],
    async (signal) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (action) params.set('action', action);
      const res = await api.get<AuditListResponse>(`/admin/audit-log?${params}`, { signal });
      return res.data;
    },
  );

  const rows = data?.items ?? [];
  // `AuditListResponseDto.total` is unconditional — this endpoint counts on
  // every request rather than behind a `withTotal` flag, so the numbered pager
  // has the number it needs without asking for it.
  const total = data?.total ?? 0;

  /*
   * EVERY column here is explicitly `sortable: false`.
   *
   * DataTable treats a column as sortable unless told otherwise — it derives a
   * sort key from the header text when none is given — so silence would turn
   * all five of these into sort buttons. `GET /admin/audit-log` accepts no
   * `sort` parameter and orders by `created_at DESC, id DESC` in the store, so
   * a header that appeared to sort could only ever have reordered the 25 rows
   * on screen and presented that as the trail.
   *
   * When the endpoint gains a sort allowlist, this is the file to change:
   * mirror the allowlist as a `sortableBy()` helper the way `client-columns.tsx`
   * does, rather than marking columns sortable one at a time.
   */
  const columns: Column<AuditEntry>[] = [
    {
      header: t('audit.colWhen'),
      sortable: false,
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
      sortable: false,
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
      sortable: false,
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
      sortable: false,
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
      sortable: false,
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
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('audit.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('audit.subtitle')}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Select
          value={action || 'all'}
          onValueChange={(val) => {
            // Filter and page written together, so narrowing the log always
            // lands on page one rather than past the end of the new result set.
            url.set({ action: val === 'all' ? undefined : val, page: undefined });
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
        fill
      >
        <DataTable
          fill
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
          /*
           * The pager belongs to the TABLE FRAME, not to the page below it.
           *
           * It used to be a sibling rendered under the table, which in fill mode
           * would put it below a scroll region that owns the remaining height —
           * i.e. off screen. Same props, same values; DataTable renders it in
           * the footer, outside the row scroll, so it is always reachable. The
           * old `rows.length > 0` guard is not lost: an empty result renders the
           * `empty` state instead of the table, footer included.
           */
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            noun: ['entry', 'entries'],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
