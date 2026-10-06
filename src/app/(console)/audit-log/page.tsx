'use client';

import { Suspense } from 'react';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';
import type { AuditEntry, AuditListResponse, AuditSortKey } from '@/lib/api/admin';
import { AUDIT_SORT_KEYS } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { UrlSearchInput } from '@/components/url-search-input';
import { DateRangePicker, PeriodWiden } from '@/components/date-range-picker';
import { useDateRange } from '@/hooks/use-date-range';
import { AsyncBoundary } from '@/components/async-boundary';
import { ExportButton } from '@/components/export-button';
import { MaskedChip } from '@/components/masked-value';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { PageLoader } from '@/components/ui/loader';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { PortalIdTag } from '@/components/clients/client-identity';

// D-21: append-only admin action log. Read-only view — there is deliberately
// no edit or delete anywhere in this flow.

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: AuditSortKey) => ({ sortable: true as const, sortKey: key });

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
   * THE SORT IS NOW REAL, and it is server-side.
   *
   * This screen used to have no column sorting at all, and that was correct at
   * the time: the endpoint hardcoded `ORDER BY created_at DESC, id DESC` and
   * accepted no `sort` parameter, so every column said `sortable: false`. The
   * endpoint has since grown an `AUDIT_SORT_COLUMNS` allowlist of three keys,
   * and those three columns now order the whole trail rather than the
   * twenty-five rows on screen — which on an investigation screen is the
   * difference between "the first time this admin did this" and "the first time
   * on this page".
   */
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  /*
   * The rows-per-page selector, in the URL beside the page number.
   *
   * It rendered and did nothing: the pager drew the control but no
   * `onPageSizeChange` was passed and the limit was a constant. `limitParam`
   * clamps to the four sizes the pager offers, so a hand-edited `?limit=5000`
   * cannot become a request the API rejects — it caps at 100.
   */
  const pageSize = limitParam(url.get('limit'));
  const action = url.get('action');
  /*
   * The SUBJECT TYPE filter, honoured from the URL though no control offers it.
   *
   * `GET /admin/audit-log` declares `subjectType` as a query parameter and the
   * store filters on it, but this screen renders no picker for it — there is no
   * endpoint serving the vocabulary of subject types the way
   * `/admin/audit-log/actions` serves the action list, and inventing a
   * hardcoded one is the exact defect the action filter was rebuilt to remove.
   * Reading it here means a link that names one resolves to the segment it
   * names rather than silently widening to the whole trail.
   */
  const subjectType = url.get('subjectType');

  /*
   * THE TWO QUESTIONS AN INVESTIGATION STARTS FROM, which this screen could not
   * ask until now: "what did this administrator do" and "what has been done to
   * this client". Both filters existed on `GET /admin/audit-log` — `actorId`
   * had been accepted by the store since it was written and passed by no route
   * — and the only controls here were two CATEGORY pickers, so the way to
   * answer either was to page an append-only table that grows forever.
   *
   * `subjectId` and `actorId` are read from the URL and offered by no control,
   * the same shape as `subjectType` above: a client profile links here with
   * `?subjectId=<their id>`, which is what makes "everything that has happened
   * to this person" a place an operator can go. The typed control is `q`,
   * because the actor's EMAIL is what the table displays and therefore what an
   * investigator has in front of them.
   */
  const subjectId = url.get('subjectId');
  const actorId = url.get('actorId');
  const q = useDebounced(url.get('q').trim());
  /*
   * The period opens on TODAY. "Everything that happened to this person" (a
   * profile's `subjectId` link) or "everything this admin did" (`actorId`) is
   * an investigation, and opens on All time so it starts complete.
   */
  const period = useDateRange(url, subjectId || actorId ? 'all' : 'today');

  /*
   * Checked against the allowlist rather than cast to it. A stale bookmark or a
   * hand-edited URL carrying `?sort=details` would otherwise reach the endpoint
   * and come back a 400 — R-2.5 makes an unrecognised sort an error, never a
   * silent fallback — so an unrecognised key is simply not a sort.
   */
  const sortKey = AUDIT_SORT_KEYS.find((allowed) => allowed === url.sort.key);

  /*
   * Its own resource, so a failure here degrades the FILTER rather than the
   * log. The trail is the thing somebody came for; losing it because a
   * vocabulary request failed would be the wrong trade.
   */
  const actionsQuery = useResource(keys.auditLog.actions(), (signal) =>
    api.admin.getAuditActions(signal),
  );
  const actionOptions = actionsQuery.data ?? [];

  /*
   * Every parameter that shapes the request is in the KEY as well as the query
   * string. A parameter missing from the key makes React Query serve the
   * previous ordering's cached page under the new sort — which on an audit
   * trail is a screen showing rows that do not match what the header claims.
   */
  const { status, data, error, isFetching, refetch } = useResource<AuditListResponse>(
    keys.auditLog.list([
      page,
      pageSize,
      action,
      subjectId,
      actorId,
      q,
      subjectType,
      sortKey,
      sortKey ? url.sort.order : null,
      period.range.from ?? null,
      period.range.to ?? null,
    ]),
    async (signal) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (action) params.set('action', action);
      if (subjectType) params.set('subjectType', subjectType);
      if (subjectId) params.set('subjectId', subjectId);
      if (actorId) params.set('actorId', actorId);
      if (q) params.set('q', q);
      if (period.range.from) params.set('from', period.range.from);
      if (period.range.to) params.set('to', period.range.to);
      // Both halves or neither — `order` alone describes an ordering of no
      // column, and the API is entitled to reject it.
      if (sortKey) {
        params.set('sort', sortKey);
        params.set('order', url.sort.order);
      }
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
   * The SAME two filters the list sends, and never its paging.
   *
   * `GET /admin/audit-log/export` takes `action` and `subjectType` and nothing
   * else, which is exactly this screen's filter set — so "export what I am
   * looking at" reuses the list's own query language rather than inventing a
   * second one that can drift from it.
   *
   * The export is deliberately NOT the rows in memory: those are one page of
   * 25, and a file quietly containing 25 of four thousand rows is discovered
   * during an audit rather than here. The endpoint reads every matching row —
   * which it did not until 11 Sep 2026, when `AuditLogStore.findAll` was found
   * clamping the exporter's 1,000-row batch to MAX_PAGE_SIZE, so the CSV
   * stopped at 100 rows on a table holding 1,600 and the truncation notice was
   * unreachable. That was the whole value of this control, absent.
   */
  const exportFilters = new URLSearchParams();
  if (action) exportFilters.set('action', action);
  if (subjectType) exportFilters.set('subjectType', subjectType);
  /*
   * The investigation filters go into the EXPORT too, and that is the point of
   * the paragraph above: an export that quietly widened back to the whole trail
   * would be handed to a compliance review as evidence of something it does not
   * show. `GET /admin/audit-log/export` accepts all five, so the file is the
   * screen.
   */
  if (subjectId) exportFilters.set('subjectId', subjectId);
  if (actorId) exportFilters.set('actorId', actorId);
  if (q) exportFilters.set('q', q);
  if (period.range.from) exportFilters.set('from', period.range.from);
  if (period.range.to) exportFilters.set('to', period.range.to);

  /*
   * THREE of these sort, and the other two say explicitly that they do not.
   *
   * DataTable treats a column as sortable unless told otherwise — it derives a
   * sort key from the header text when none is given — so silence on the last
   * two would turn them into sort buttons on keys the endpoint has never heard
   * of. R-2.5 makes an unrecognised sort a 400 rather than a silent fallback, so
   * that is an error page rather than a wrong order.
   *
   * `sortableBy` takes an `AuditSortKey`, so the allowlist is enforced at
   * compile time here rather than by reading this comment.
   */
  const columns: Column<AuditEntry>[] = [
    {
      header: t('audit.colWhen'),
      /*
       * The trail's own default ordering, now reachable in both directions.
       *
       * Ascending is the useful one and is why this is worth sorting at all:
       * the log is newest-first, so the FIRST time something happened — which
       * is what an investigation is usually looking for — was previously on the
       * last page of however many there were.
       */
      ...sortableBy('createdAt'),
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
      /*
       * Sorts by the actor's EMAIL, which is the key the endpoint orders on.
       * The cell also renders the IP address and the actor kind; neither is a
       * sort key, and grouping one administrator's actions together is the
       * reason to sort this column at all.
       */
      ...sortableBy('actorEmail'),
      cell: (e) => (
        <>
          {/*
           * Absent means MASKED, not empty. `actor_email` is NOT NULL, so the
           * only way it can be missing is `maskAuditRow` removing it — which it
           * does for a CLIENT actor when this reader may not see client
           * addresses. Rendering nothing would read as "this actor has no
           * email", which is the exact misreading MaskedValue exists to stop.
           */}
          <div className="flex min-w-0 items-baseline gap-1.5 text-foreground">
            {e.actorEmail === undefined ? <MaskedChip /> : e.actorEmail}
            {/* A client actor is named by Portal ID too — the one identifier a
                role never hides, so a masked email still leaves a name. */}
            {e.actorPortalId !== null && <PortalIdTag id={e.actorPortalId} linked />}
          </div>
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
      ...sortableBy('action'),
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
      /*
       * NOT sortable — neither `subjectType` nor `subjectId` is in
       * `AUDIT_SORT_COLUMNS`. `subjectType` is accepted as a FILTER and reads
       * like an obvious sort key, which is exactly why it is called out here:
       * the two parameter lists are different, and sending it as a sort would
       * be a 400 rather than a fallback.
       */
      sortable: false,
      cell: (e) => (
        <>
          <div className="text-xs">{e.subjectType}</div>
          {/*
            A subject that IS a client is named by Portal ID — the server says
            which (`subjectPortalId`), from the clients table rather than from
            a list of types. Any other record keeps its own id, with the client
            it concerns (if any) named beneath it.
          */}
          {e.subjectPortalId !== null ? (
            <PortalIdTag id={e.subjectPortalId} linked />
          ) : (
            <>
              <div
                className="font-mono text-[11px] text-muted-foreground max-w-[160px] truncate"
                title={e.subjectId}
              >
                {e.subjectId}
              </div>
              {e.clientPortalId !== null && (
                <div className="text-[11px] text-muted-foreground">
                  {t('audit.subjectClient')} <PortalIdTag id={e.clientPortalId} linked />
                </div>
              )}
            </>
          )}
        </>
      ),
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('audit.colDetails'),
      // NOT sortable — `details` is a JSON blob, so there is no ordering of it
      // the endpoint could honour and no key for one in the allowlist.
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
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('audit.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('audit.subtitle')}</p>
        </div>
        {/*
          The audit log is the one screen an export is least optional on: it is
          the record a compliance review asks for, and it is read by people who
          cannot be handed a database. The endpoint has been served and
          permission-gated on `audit.view` — the same key this screen needs —
          for as long as the screen has existed, and no control ever offered it.
          `export-button.tsx` states the rule this violated: a built endpoint
          that no button reaches drifts out of the UI, and nobody notices.
          In the HEADER, on the right, like every page's actions (29 Sep 2026).
        */}
        <div className="flex shrink-0 items-center gap-2">
          <ExportButton resource="audit-log" filters={exportFilters} disabled={total === 0} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <UrlSearchInput
          value={url.get('q')}
          label={t('audit.filterActor')}
          placeholder={t('audit.filterActorPlaceholder')}
          title={t('audit.filterActorHint')}
          // Filter and page written together, so narrowing always lands on page
          // one rather than past the end of the new result set.
          onChange={(next) => url.set({ q: next || undefined, page: undefined })}
        />

        <Select
          value={action || 'all'}
          onValueChange={(val) => {
            // Filter and page written together, so narrowing the log always
            // lands on page one rather than past the end of the new result set.
            url.set({ action: val === 'all' ? undefined : val, page: undefined });
          }}
        >
          <SelectTrigger className="h-9 w-48" aria-label={t('auditLog.filterByAction')}>
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

        <DateRangePicker
          choice={period.choice}
          custom={period.custom}
          defaultChoice={period.defaultChoice}
          onChange={period.set}
        />
      </div>

      <AsyncBoundary
        status={status}
        label="Loading audit log"
        endpoints={['GET /admin/audit-log?page&limit&action&subjectType&sort&order']}
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
              action={<PeriodWiden choice={period.choice} onChange={period.set} />}
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
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * Server-side, which is what makes these headers honest. Passing this
           * also switches DataTable out of its client-side path, so the three
           * sortable columns order the whole trail rather than the page.
           *
           * The page is dropped with the sort: reordering renumbers every page,
           * so positions 26–50 under the new ordering are not the entries that
           * were there under the old. `key` is `null` on the third click — the
           * cycle back to unsorted — and both params leave the URL together,
           * which returns the trail to its own `created_at DESC` default rather
           * than to a guess this screen substituted.
           */
          onSortChange={(key, order) => {
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined });
          }}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            // The size and the page are written together, and the page is
            // dropped: page 4 at 25 a page is past the end at 100 a page, which
            // renders as an empty table and reads as an empty trail.
            onPageSizeChange: (size) =>
              url.set({
                limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              }),
            noun: ['entry', 'entries'],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
