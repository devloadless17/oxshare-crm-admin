'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { components } from '@/lib/api/types.gen';
import { ChevronRight, FileCheck } from 'lucide-react';
import api from '@/lib/api';
import { QueueToolbar } from '@/components/queue-toolbar';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { CopyableId } from '@/components/copyable-id';
import { ExportButton } from '@/components/export-button';
import { useDebounced } from '@/hooks/use-debounced';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { KYC_SORT_KEYS, type KycSortKey } from '@/lib/api/admin';
import { t } from '@/lib/i18n';
import { PermittedLink } from '@/components/permitted-link';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';
import { kycStatusColor, kycStatusLabel } from '@/lib/kyc-status';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { limitParam, pageParam } from '@/lib/page-param';
import { PageLoader } from '@/components/ui/loader';
import { keys } from '@/lib/query-keys';
import { waitingLabel } from '@/lib/waiting';

/*
 * The local `KycStatus` union that sat here is gone — a fourth hand-written
 * copy of the backend enum. `lib/kyc-status.ts` exports `KYC_STATUSES` and the
 * type derived from it, and nothing on this screen needs to name the union
 * directly any more.
 */

/**
 * Aliases, not hand-written copies — R-1.1.
 *
 * Both of these were declared by hand beside a generated schema that already
 * described them (`KycSubmissionDto`, `KycListResponseDto`). A hand-written
 * shape removes the only mechanism that turns backend drift into a compile
 * error, and it does so silently: the page keeps building against a description
 * of an API that has moved.
 */
type KycRow = components['schemas']['KycSubmissionDto'];

/*
 * The label and the colour come from `lib/kyc-status.ts`.
 *
 * This file used to own a hardcoded `STATUS_LABELS` and a `STATUS_COLORS` map —
 * two of the five places that described the same six statuses. Relabelling
 * `submitted` here left the client list, the dashboard and the review detail
 * still saying "Submitted", which is the bug that made this refactor worth
 * doing rather than the tidy-up it looks like.
 *
 * The `Submitted` DATE column keeps its own name — that one really does mean
 * when, and is not part of this vocabulary.
 */

/**
 * PENDING FIRST, and it is the default — see `filter` below.
 *
 * The tab order follows the work: what is waiting, what is being looked at,
 * then the decided ones, with All last as the escape hatch. It used to lead
 * with All, which is the one tab nobody working the queue wants first.
 */
const FILTERS: Array<{ value: string; label: string }> = [
  /*
   * `in_progress` FIRST, because it is the earliest state and the only one
   * where nobody is waiting on us.
   *
   * A client who opened the wizard and stopped sits here, and the queue had no
   * tab for them at all — so the one cohort worth chasing (they started, and
   * something stopped them) was invisible unless an operator picked "All" and
   * read the badges. It is a different question from the rest of this screen,
   * which is why it reads as its own tab rather than being folded into Pending:
   * those are submissions waiting on a REVIEWER.
   */
  /*
   * FIRST, because it is what the dashboard tile and the sidebar badge count
   * and therefore what an operator arrives here holding. It is a SET, not a
   * column value — the API resolves `needs_review` to submitted +
   * under_review (see kyc.store.ts).
   */
  /*
   * ⚠️ The real statuses take their word from `kycStatusLabel`, not from a
   * label of their own.
   *
   * These six were a FOURTH copy of the same vocabulary — after the client
   * list's and the dashboard funnel's were both deleted for drifting, which
   * `messages.ts` records in two places. It drifted here too: the tabs said
   * "Pending" and "Under Review" while the status pill on the row beside them
   * said "Awaiting review" and "In review" for the same submission.
   *
   * Only the two entries that are NOT statuses keep a label: `needs_review` is
   * a SET (submitted + under_review, resolved by the API), and `''` is the
   * absence of a filter.
   */
  { value: 'needs_review', label: t('kycReview.filterNeedsReview') },
  { value: 'in_progress', label: kycStatusLabel('in_progress') },
  { value: 'submitted', label: kycStatusLabel('submitted') },
  { value: 'under_review', label: kycStatusLabel('under_review') },
  { value: 'approved', label: kycStatusLabel('approved') },
  { value: 'rejected', label: kycStatusLabel('rejected') },
  { value: '', label: t('kycReview.filterAll') },
];

type KycListResponse = components['schemas']['KycListResponseDto'];

/**
 * When a waiting submission starts reading as a problem rather than a queue.
 *
 * An ASSUMPTION, not a specification — no document states an SLA for KYC
 * review. The client portal already tells clients "this usually takes 1–2
 * business days", so anything past that is already outside what they were
 * promised, and 3 leaves a day of slack before it is called out.
 */
const STALE_AFTER_DAYS = 3;

/**
 * Whole days a submission has been waiting for a decision, or `null` if it is
 * not waiting for one.
 *
 * Only `submitted` and `under_review` are waiting: a client still filling in
 * their details is not queued, and a decided one is not waiting.
 */
function daysWaiting(row: KycRow): number | null {
  if (row.status !== 'submitted' && row.status !== 'under_review') return null;
  if (!row.submittedAt) return null;
  const elapsed = Date.now() - new Date(row.submittedAt).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: KycSortKey) => ({
  sortable: true as const,
  sortKey: key,
});

/** The queue opens on PENDING; `?status=all` is how "every status" is spelled. */
const DEFAULT_STATUS = 'submitted';
const ALL_STATUSES = 'all';

/*
 * `useSearchParams()` requires a Suspense boundary at prerender, exactly as the
 * other queues wrap themselves. Same shape as transactions/page.tsx.
 */
export default function AdminKycPage() {
  return (
    <Suspense fallback={<PageLoader label={t('kyc.loadingQueue')} />}>
      <KycQueue />
    </Suspense>
  );
}

function KycQueue() {
  const router = useRouter();
  const { admin } = useAdmin();
  /*
   * EVERYTHING THIS SCREEN IS LOOKING AT LIVES IN THE URL — the page, the page
   * size, the status tab, the search term and the sort — as on every other
   * list in the console. This queue was the one exception, holding all five in
   * `useState`: a refresh dropped a reviewer back to page 1 of Pending, Back
   * left the screen, and "look at this filtered queue" was not a link anybody
   * could send. See hooks/use-table-query-state.ts for the reasoning at length.
   */
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  const pageSize = limitParam(url.get('limit'));
  /*
   * PENDING by default — the queue, not the archive.
   *
   * This screen opens on the submissions that need a decision. Defaulting to
   * every status meant a reviewer landed on a list dominated by already-decided
   * identities and had to filter before they could start, and the number that
   * matters — how many people are waiting — was never the one in front of them.
   *
   * "All" is still reachable, as `?status=all` — an absent parameter is the
   * default, so "every status" needs a spelling of its own.
   */
  const statusParam = url.get('status');
  const filter =
    statusParam === '' ? DEFAULT_STATUS : statusParam === ALL_STATUSES ? '' : statusParam;
  /*
   * The search box keeps LOCAL state and follows the URL on a timer, rather
   * than being driven by `?q=` directly: a fully URL-controlled input loses
   * characters to the router's async `replace` (see clients/client-filters.tsx).
   * It starts from the URL so a refresh keeps the term, and the effect below
   * writes the debounced value back so the URL stays the shareable truth.
   */
  const [search, setSearch] = useState(url.get('q'));
  const debouncedSearch = useDebounced(search.trim());
  useEffect(() => {
    if (debouncedSearch !== url.get('q')) {
      url.set({ q: debouncedSearch || undefined, page: undefined });
    }
  }, [debouncedSearch, url]);
  /**
   * The sort, as the API's own two parameters.
   *
   * `null` is a real state and not a missing value: it is the third click of
   * DataTable's asc → desc → off cycle, and it means "drop both parameters and
   * let the endpoint apply its own default" — `submittedAt desc`, the queue
   * order. Checked against the allowlist rather than cast: a hand-edited
   * `?sort=nonsense` clears the sort instead of 400ing the queue.
   */
  const sortKey = KYC_SORT_KEYS.find((allowed) => allowed === url.sort.key);
  const sort: { key: KycSortKey; order: 'asc' | 'desc' } | null = sortKey
    ? { key: sortKey, order: url.sort.order }
    : null;

  // Server-side filtering/search/sorting/pagination; counts come from the API
  // over the full set, so tab counts stay correct while a filter is active.
  const query = useResource<KycListResponse>(
    keys.kyc.queue([page, pageSize, filter, debouncedSearch, sort?.key, sort?.order]),
    async (signal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (filter) params.set('status', filter);
      if (debouncedSearch) params.set('q', debouncedSearch);
      // Both halves or neither — `order` alone describes an ordering of no
      // column, and the API is entitled to reject it.
      if (sort) {
        params.set('sort', sort.key);
        params.set('order', sort.order);
      }
      return (await api.get<KycListResponse>(`/admin/kyc?${params}`, { signal })).data;
    },
  );

  /*
   * The list's own filters, minus paging — the export layer strips page/limit
   * itself, but building them from the same two pieces of state is what keeps
   * "export what I am looking at" true when a filter is added later.
   */
  const exportFilters = new URLSearchParams();
  if (filter) exportFilters.set('status', filter);
  if (debouncedSearch) exportFilters.set('q', debouncedSearch);

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const counts = query.data?.counts ?? {};
  const loading = query.status === 'loading';

  /*
   * NO SELECTION, AND NO BATCH APPROVE — removed at the operator's request.
   *
   * The queue selects work; it does not decide it. Every approval here was
   * already a separate regulated decision with its own audit entry (there is no
   * bulk route — `PATCH /admin/kyc/:userId/approve` is one identity at a time),
   * and a checkbox column made "approve twenty identities" one click away from
   * a stray shift-click. Reviewing happens on the detail screen, which is where
   * the documents are.
   */
  const columns: Column<KycRow>[] = [
    {
      header: t('kycReview.colUser'),
      /*
       * Sorts by EMAIL. The header used to declare `sortKey: 'userId'`, which
       * the endpoint has never accepted — and even if it had, ordering a review
       * queue by opaque UUID is not a question anybody asks.
       *
       * `userEmail` is the allowlisted key that means what a reader of this
       * column wants: it groups a person's submissions together and is unique
       * and always present, which the displayed name is neither.
       */
      ...sortableBy('userEmail'),
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-xs text-primary-foreground">
            {(row.user?.firstName?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-foreground">
              {[row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ') || '—'}
            </div>
            <div className="text-xs text-muted-foreground">{row.user?.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: t('kycReview.colId'),
      // NOT sortable — same reason as Country below: R-2.5 makes an
      // unrecognised sort key a 400, and the API has no `userId` sort.
      sortable: false,
      // The Portal ID, never the uuid: the uuid still keys the row inside the
      // system and is shown to no one (owner's decision, 24 Sep 2026).
      cell: (row) =>
        row.user?.portalId !== undefined ? (
          <CopyableId value={String(row.user.portalId)} full copyLabel={t('common.copyPortalId')} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: t('kycReview.colCountry'),
      /*
       * NOT sortable — the API has no `country` key for this list.
       *
       * The value is read from `personalInfo`, which is a JSON blob on the
       * submission rather than a column, so there is nothing for the database
       * to order by. R-2.5 makes an unrecognised sort a 400, so declaring this
       * would turn a header click into an error page. It was a client-side
       * reorder of the rows on screen until now.
       */
      sortable: false,
      cell: (row) => (
        <span className="text-muted-foreground">{row.personalInfo?.country ?? '—'}</span>
      ),
    },
    {
      header: t('kycReview.colStatus'),
      ...sortableBy('status'),
      cell: (row) => {
        const tone = kycStatusColor(row.status);
        return (
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
            style={{
              background: `color-mix(in srgb, ${tone} 13%, transparent)`,
              color: tone,
              border: `1px solid color-mix(in srgb, ${tone} 27%, transparent)`,
            }}
          >
            {kycStatusLabel(row.status)}
          </span>
        );
      },
    },
    {
      header: t('kycReview.colReviewer'),
      // Not sortable: `reviewedByName` is resolved per page from the admin
      // table, so there is no column for the API to order by.
      sortable: false,
      /*
       * WHO has it — the question a claim exists to answer for a colleague,
       * and the one the queue could not answer at all. A row showed as taken,
       * with the Claim button gone and no name to ask, so the only way to find
       * out was to interrupt the whole desk.
       *
       * An em dash for an unclaimed row rather than blank: "nobody has this"
       * is an answer, and a column that is sometimes empty and sometimes
       * missing reads as a loading state.
       */
      cell: (row) => {
        /*
         * Shows the reviewer for a DECIDED row too, not only a claimed one.
         *
         * The column blanked to an em dash the moment a decision landed, so the
         * queue could say who was holding a submission and not who had approved
         * one — and "who verified this client" is the question that outlives the
         * claim by years. The name is already on every row that has a reviewer;
         * the cell was choosing not to render it.
         *
         * An em dash still means "nobody", which is now only true of a row
         * waiting in the queue. A name with no decision behind it reads as
         * "being reviewed", which is what the dock says too.
         */
        const decided = row.status === 'approved' || row.status === 'rejected';
        if (row.status !== 'under_review' && !decided) {
          return <span className="text-muted-foreground">—</span>;
        }
        /*
         * A decided row whose reviewer has since been deleted falls back to the
         * dash rather than to "Being reviewed", which would be false twice over.
         */
        if (decided && !row.reviewedByName) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="text-xs font-medium">
            {row.reviewedByName ?? t('kycReview.claimedByUnknown')}
          </span>
        );
      },
    },
    {
      header: t('kycReview.colSubmitted'),
      /*
       * The one sort this queue most needs, and now a real one.
       *
       * Ascending puts the LONGEST-waiting submission first. The cell's
       * "waiting N days" warning exists because the default newest-first order
       * sinks the oldest unreviewed submissions to the bottom — this makes the
       * fix reachable across the whole queue rather than within one page.
       */
      ...sortableBy('submittedAt'),
      cell: (row) => {
        const waiting = daysWaiting(row);
        return (
          <span className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
            </span>
            {/* How long this client has been waiting, and a warning once it is
                long. The queue sorts newest-first, so without this the OLDEST
                unreviewed submissions sink to the bottom and are the least
                likely to be looked at — while their owners are waiting on
                level 1 to withdraw their own money. */}
            {waiting !== null && (
              <span
                className={`text-xs font-semibold ${
                  waiting >= STALE_AFTER_DAYS ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {row.submittedAt && waitingLabel(row.submittedAt)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      header: t('kycReview.colReviewed'),
      /*
       * NOT sortable — `reviewedAt` is not in `KYC_SORT_COLUMNS`.
       *
       * It reads like an obvious sibling of `submittedAt`, which is exactly why
       * it is called out: the allowlist offers `createdAt` and `submittedAt` and
       * no third date. Sending `reviewedAt` would be a 400, not a fallback.
       */
      sortable: false,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: t('kycReview.colAction'),
      align: 'right',
      // DataTable treats a column as sortable unless told otherwise, so without
      // this the Actions header becomes a sort button on a key the API has
      // never heard of.
      sortable: false,
      cell: (row) => (
        <PermittedLink
          href={`/kyc/${row.user?.portalId ?? row.userId}`}
          className="inline-flex items-center gap-1 font-semibold text-xs text-link hover:underline focus-outline rounded-sm"
          aria-label={`Review KYC submission of ${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim()}
        >
          <span>{t('kycReview.review')}</span>
          <ChevronRight className="h-4 w-4" />
        </PermittedLink>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-6">
      {/* Page Header */}
      <div className="flex shrink-0 flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('kycReview.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('kycReview.totalSubmissions', { count: counts['all'] ?? 0 })}
          </p>
        </div>
        {/* The same filters the list is showing, so "export what I am looking
            at" is the query the screen already built rather than a second one. */}
        <ExportButton resource="kyc" filters={exportFilters} disabled={total === 0} />
      </div>

      {/*
        `QueueToolbar`, shared with the partner-application and withdrawal
        queues. The markup that used to sit here IS that component — it was
        lifted from this page because this was the version worth keeping — so
        the three backlogs now filter and search identically instead of each
        having its own arrangement of the same two controls.

        The visible change here is the search box, which moves to the right of
        the strip: it sat immediately after the last tab, so its position
        shifted with the tab labels and matched neither of the other queues.
      */}
      <div className="shrink-0">
        <QueueToolbar
          filters={FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            // `counts` is keyed by status, with `all` for the unfiltered tab —
            // the same server-side per-status totals the other two queues pass.
            count: f.value ? (counts[f.value] ?? 0) : (counts['all'] ?? 0),
          }))}
          active={filter}
          onFilterChange={(value) => {
            // Page 1 on every filter change — the caller's job, and the failure
            // this family of screens is most often wrong about. See the
            // component note.
            url.set({ status: value === '' ? ALL_STATUSES : value, page: undefined });
          }}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('kycReview.searchPlaceholder')}
          searchAriaLabel={t('kyc.searchAria')}
        />
      </div>

      {/*
        A failed load used to fall through to `rows = []` and render "No
        submissions match the current filters." — so an API outage read to a
        reviewer as an empty backlog, and submissions waited while everyone
        believed there were none. On a compliance queue that is the expensive
        direction to be wrong in.

        AsyncBoundary is what every other screen in this app uses; this one was
        the exception. `loading` stays on DataTable so paging keeps its inline
        spinner instead of blanking the table on every page change.
      */}
      <AsyncBoundary
        status={query.status}
        label={t('kyc.loadingQueue')}
        endpoints={['GET /admin/kyc?status&q&page&limit']}
        onRetry={query.refetch}
        errorMessage={t('kyc.queueLoadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('kyc.queueCaption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.userId}
          /*
           * Double-click a row to open its review screen — the same destination
           * the Review link in the last column points at.
           *
           * A SHORTCUT, not the affordance. The link stays exactly as it was:
           * it is what a keyboard reaches, what a screen reader announces, and
           * what tells a first-time reviewer the screen exists at all. This
           * only makes the habit work for the people who already have it.
           *
           * Gated on `canAccess` for the same reason `PermittedLink` is — that
           * component exists because rows used to offer every operator a link
           * that landed half of them on "you do not have access". A double-click
           * that did the same would reintroduce the dead end it removed, just
           * without a visible link to blame it on.
           */
          onRowDoubleClick={(row) => {
            const href = `/kyc/${row.userId}`;
            if (canAccess(admin, href)) router.push(href);
          }}
          loading={loading}
          loadingText={t('kyc.loadingQueue')}
          dimmed={query.isFetching}
          empty={<EmptyState icon={FileCheck} message={t('kyc.queueEmpty')} />}
          sortColumn={sort?.key}
          sortDirection={sort?.order}
          /*
           * Server-side. Passing this also switches DataTable out of its
           * client-side path, which is what the columns above were quietly
           * relying on — three of them claimed keys the endpoint never
           * accepted, so the queue reordered its 25 visible rows and presented
           * that as the backlog.
           *
           * `setPage(1)` because reordering renumbers every page: the rows at
           * positions 26–50 under the new sort are not the ones that were there
           * under the old.
           */
          onSortChange={(key, order) => {
            /*
             * Checked against the allowlist rather than cast to it.
             *
             * Only allowlisted columns are marked sortable, so this should
             * always hold — but `key` arrives as a bare string, and a cast
             * would make a future column with a typo'd key compile cleanly and
             * 400 at runtime. Falling back to "no sort" means an unrecognised
             * key clears the sort instead, which is a state the endpoint accepts.
             */
            const next = KYC_SORT_KEYS.find((allowed) => allowed === key);
            url.set({
              sort: next && order ? next : undefined,
              order: next && order ? order : undefined,
              page: undefined,
            });
          }}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: (next) => url.set({ page: String(next) }),
            /*
             * The reset is the CALLER's job, and this used to lean on the pager
             * to do it. `Pagination` called `onPageChange(1)` right after this
             * handler, which worked for a `useState` page like this one and
             * silently destroyed the new size on every URL-backed table — two
             * `router.replace` writes in one tick, the second built from a
             * snapshot without the first's limit. That call is gone, so the
             * page is dropped here: page 4 at 25 a page is past the end at 100
             * a page, which renders as an empty queue.
             */
            onPageSizeChange: (size) => url.set({ limit: String(size), page: undefined }),
            noun: [t('kyc.nounSingular'), t('kyc.nounPlural')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
