'use client';

import { clientLabel } from '@/components/clients/client-identity';
import { Suspense, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import api from '@/lib/api';
import type { ClientListResponse, ClientRow, ClientSortKey } from '@/lib/api/admin';
import { CLIENT_SORT_KEYS } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { PermittedLink } from '@/components/permitted-link';
import { DataTable, EmptyState } from '@/components/data-table';
import { PageLoader } from '@/components/ui/loader';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { maskedFieldLabels } from '@/lib/masking';
import { ClientFilters } from '@/components/clients/client-filters';
import { DateRangePicker, PeriodWiden } from '@/components/date-range-picker';
import { useDateRange } from '@/hooks/use-date-range';
import { ChangeLevelFromList } from '@/components/clients/change-level-from-list';
import { ReassignParentFromList } from '@/components/partners/reassign-parent-from-list';
import { AppointPartnerDialog } from '@/components/clients/profile/partner-structure-dialogs';
import { EditTermsFromList } from '@/components/partners/edit-terms-from-list';
import { clientColumns } from '@/components/clients/client-columns';
import { useClientStatusToggle } from '@/components/clients/use-client-status-toggle';
import { ExportButton } from '@/components/export-button';
import { NewClientButton } from '@/components/clients/new-client-dialog';
import { ClientBulkBar } from '@/components/clients/client-bulk-bar';
import type { BulkClientFilter } from '@/lib/api/admin';
import { LinkAccountDialog } from '@/components/trading/link-account-dialog';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Catalog key → what an operator calls it, for the "hidden columns" notice.
 *
 * A short local map rather than a fetch of `GET /admin/client-fields`: this
 * screen needs labels for at most a handful of keys, and making the client list
 * wait on a second request to render a one-line banner would be a poor trade.
 * The RBAC screens, which must offer every maskable field, do fetch the
 * catalog.
 */
const FIELD_LABELS: Record<string, string> = {
  'client.email': t('clients.colEmail'),
  'client.firstName': t('clients.colName'),
  'client.lastName': t('clients.colName'),
  'client.country': t('clients.colCountry'),
  'client.createdAt': t('clients.colCreated'),
  'client.tags': t('clients.colTags'),
};

/*
 * `useSearchParams()` requires a Suspense boundary at prerender or
 * `npm run build` fails — and `next dev` does NOT, so CI is where you find out.
 * Same shape as `invite/accept/page.tsx`.
 */
export default function ClientsPage() {
  return (
    <Suspense fallback={<PageLoader label={t('clients.loading')} />}>
      <ClientsPageContent />
    </Suspense>
  );
}

function ClientsPageContent() {
  const { admin } = useAdmin();
  const canSuspend = hasPermission(admin, 'clients.suspend');
  /* The same key `PermissionsGuard` enforces on PATCH /admin/ib/partners/:id/program. */
  const canEditPartners = hasPermission(admin, 'ib.partners.edit');
  const canViewTags = hasPermission(admin, 'tags.view') || hasPermission(admin, 'clients.view');
  // Bulk tagging (Slice 3): the API demands both keys.
  const canBulk = hasPermission(admin, 'clients.bulk') && hasPermission(admin, 'clients.tag');
  // "New client" (backend 0211): staff create a client for somebody who cannot sign up.
  const canCreate = hasPermission(admin, 'clients.create');

  const url = useTableQueryState();
  /*
   * Numbered pages, and the page number lives in the URL.
   *
   * This list is cursor-CAPABLE — the endpoint still serves `?cursor=`, and the
   * concurrent-insert hazard R-2.4 describes is real: a client registering while
   * an admin reads page 3 shifts every later page by one. What decided it the
   * other way is that a cursor cannot express "page 7", so the operator had
   * Previous/Next over ~219,000 records and no way back to where they were. A
   * page number survives a refresh, a shared link and the browser's Back button;
   * an opaque cursor held in component state survives none of them.
   *
   * `withTotal` is what makes numbered pages possible at all — see the flag's
   * note in lib/api/admin.ts. Without it the response carries no `total` and the
   * pager can only draw one page.
   */
  const page = pageParam(url.get('page'));
  /*
   * The ROWS-PER-PAGE selector, in the URL beside the page number.
   *
   * It was a hardcoded constant with no `onPageSizeChange` passed, so the
   * control in the pager's footer rendered, opened, and did nothing at all —
   * the operator picked 100 and kept getting 25. It belongs in the URL for the
   * same reason the page number does: "page 3 at 100 a page" has to survive a
   * refresh and a shared link, and the two numbers are meaningless apart.
   *
   * `limitParam` clamps to the four sizes the pager offers — a hand-edited
   * `?limit=5000` would otherwise be a request the API rejects (it caps at 100).
   */
  const pageSize = limitParam(url.get('limit'));
  /*
   * The URL is already debounced by the search box itself — it keeps local
   * state and writes `?q=` on a timer, because a fully URL-controlled input
   * loses characters to the router's async `replace` (see client-filters.tsx).
   * This second debounce is what keeps the QUERY KEY from changing on the same
   * tick the URL does, so a "clear filters" that also drops `q` produces one
   * request rather than two.
   */
  const debouncedSearch = useDebounced(url.get('q').trim());
  // When they registered. The client BOOK opens whole: All time.
  const period = useDateRange(url, 'all');

  const sortKey = CLIENT_SORT_KEYS.includes(url.sort.key as ClientSortKey)
    ? (url.sort.key as ClientSortKey)
    : undefined;

  const params = {
    limit: pageSize,
    page,
    withTotal: true,
    q: debouncedSearch,
    type: url.get('type'),
    // The ACCOUNT state. `kycStatus` and `emailVerified` are the other two
    // things a reader might call a status, and all three are separate filters
    // because they answer separate questions.
    status: url.get('status'),
    level: url.get('level'),
    /*
     * Read but no longer OFFERED — the country filter was removed at the
     * operator's request. A URL somebody bookmarked still has to resolve to
     * the segment it names, and the endpoint still accepts the parameter, so
     * dropping it here would silently widen a saved link.
     */
    country: url.get('country'),
    kycStatus: url.get('kycStatus'),
    emailVerified: url.get('emailVerified'),
    tag: url.get('tag'),
    // Everyone one partner introduced. Reached from the profile's Network tab,
    // whose list is capped — this is where the rest of the book lives.
    referredBy: url.get('referredBy'),
    from: period.range.from,
    to: period.range.to,
    sort: sortKey,
    // Withheld when nothing is sorted. `order` alone describes an ordering of
    // no column — the API is entitled to reject it, and sending it would also
    // make two identical result sets cache under different query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<ClientListResponse>(keys.clients.list(params), (signal) =>
    api.admin.getClients(params, signal),
  );

  // The tag vocabulary, for the filter chips and the row chips. Its own
  // resource so a tags failure degrades the filter bar rather than the list.
  const tagsQuery = useResource(keys.tags.all(), (signal) => api.admin.getTags(signal), {
    enabled: canViewTags,
  });

  // Suspend / reactivate from a row — shared with a partner's Referred clients tab.
  const status = useClientStatusToggle();

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  const exportFilters = useMemo(() => {
    const filters = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: params.q,
      type: params.type,
      status: params.status,
      level: params.level,
      country: params.country,
      kycStatus: params.kycStatus,
      emailVerified: params.emailVerified,
      tag: params.tag,
      referredBy: params.referredBy,
      from: params.from,
      to: params.to,
      sort: params.sort,
      order: params.order,
    })) {
      // Only what is SET: an empty `?status=` is a 400 on the export, not "any".
      if (value) filters.set(key, value);
    }
    return filters;
  }, [
    params.from,
    params.to,
    params.q,
    params.type,
    params.status,
    params.level,
    params.country,
    params.kycStatus,
    params.emailVerified,
    params.tag,
    params.referredBy,
    params.sort,
    params.order,
  ]);
  const maskedFields = query.data?.maskedFields ?? [];

  // The picked rows, cleared whenever the filter (and so the set) changes.
  const filterKey = exportFilters.toString();
  const [picked, setPicked] = useState<{ forFilter: string; ids: string[] }>({
    forFilter: filterKey,
    ids: [],
  });
  const selectedIds = picked.forFilter === filterKey ? picked.ids : [];

  /*
   * There is no `countries` list any more, and no country FILTER.
   *
   * It was built from the countries present in the rows on screen —
   * `users.country` is free text written by the KYC flow, so there was no
   * vocabulary to offer and a canonical ISO list would have offered values no
   * client carries. That made the options change as the operator paged, and a
   * country visible in the table was frequently one the filter did not list.
   * Removed at the operator's request; the COLUMN stays, because reading where
   * a client is from is useful on its own.
   */
  /*
   * The partner whose terms are being changed, or null when the dialog is shut.
   *
   * The ROW is held rather than just the id, because the dialog's title names
   * the person — and once it is open the list underneath may have re-fetched
   * and re-sorted, so looking the row back up by id is a race the title loses.
   */
  const [programTarget, setProgramTarget] = useState<ClientRow | null>(null);
  // Where a partner stands in the tree (owner, 7 Oct 2026).
  const [parentTarget, setParentTarget] = useState<ClientRow | null>(null);
  const [appointTarget, setAppointTarget] = useState<ClientRow | null>(null);
  const canAppointPartners = hasPermission(admin, 'ib.approve');
  const [termsTarget, setTermsTarget] = useState<ClientRow | null>(null);
  // "Link MT5 account" from a row, the client filled in (29 Sep 2026).
  const canLinkAccounts = hasPermission(admin, 'trading.create');
  const [linkFor, setLinkFor] = useState<ClientRow | null>(null);

  const columns = clientColumns({
    canSuspend,
    canViewTags,
    canEditPartners,
    maskedFields,
    actingId: status.actingId,
    onToggleStatus: (client: ClientRow) => void status.toggle(client),
    onChangeProgram: setProgramTarget,
    onEditTerms: setTermsTarget,
    onLinkAccount: canLinkAccounts ? setLinkFor : undefined,
    onReassignParent: setParentTarget,
    onAppointPartner: canAppointPartners ? setAppointTarget : undefined,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <LinkAccountDialog
        open={linkFor !== null}
        onClose={() => setLinkFor(null)}
        client={
          linkFor
            ? {
                id: linkFor.id,
                portalId: linkFor.portalId,
                firstName: linkFor.firstName,
                lastName: linkFor.lastName,
                email: linkFor.email,
                country: linkFor.country,
              }
            : undefined
        }
      />
      {termsTarget && (
        <EditTermsFromList
          open
          onClose={() => setTermsTarget(null)}
          userId={termsTarget.id}
          name={clientLabel(termsTarget)}
        />
      )}
      {parentTarget && (
        <ReassignParentFromList
          open
          onClose={() => setParentTarget(null)}
          userId={parentTarget.id}
          name={clientLabel(parentTarget)}
        />
      )}
      {appointTarget && (
        <AppointPartnerDialog
          open
          onClose={() => setAppointTarget(null)}
          userId={appointTarget.id}
          name={clientLabel(appointTarget)}
        />
      )}
      {programTarget && (
        <ChangeLevelFromList
          open
          onClose={() => setProgramTarget(null)}
          userId={programTarget.id}
          /*
            The last resort was `programTarget.id` — the UUID, which this
            console does not show at all (0133: a client is named by Portal ID
            and the uuid is internal). So a fully masked client put 36
            characters nobody can use into a confirmation dialog.
          */
          name={clientLabel(programTarget)}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('clients.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('clients.subtitle')}</p>
        </div>
        {/*
          EXPORT WHAT IS ON SCREEN: every filter the list is narrowed by, and its
          sort, go to `GET /admin/clients/export` — which applies the same client
          scope and field mask as the list, so the file holds nothing this reader
          could not already see. Paging is not sent: the file is the whole
          filtered set, not the page.
        */}
        <div className="flex shrink-0 items-center gap-2">
          {canCreate && <NewClientButton />}
          <ExportButton resource="clients" filters={exportFilters} disabled={total === 0} />
        </div>
      </div>

      {/*
        A FILTER WITH NO CONTROL HAS TO SAY SO.
        Every other filter on this screen is visible in the bar below — a
        select the operator can see and change. `referredBy` has none, because
        it is a client id rather than something pickable from a list, so
        without this banner an operator arriving on a shared link sees a
        SHORTER LIST and nothing anywhere saying why. The "clear filters"
        control does appear (`isFiltered` counts any key but page/cursor/limit)
        but a Clear button for an invisible filter is a control whose effect
        cannot be predicted.
        It links back to the partner rather than naming them from a second
        fetch: the id is in the URL and always correct, whereas a name would
        need a request that can 403 for a scoped reader who can still see the
        clients themselves.
      */}
      {url.get('referredBy') !== '' && (
        <div
          className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
          role="status"
        >
          <span className="text-muted-foreground">
            {t('clients.referredByNotice', { who: t('clients.referredByWho') })}
          </span>
          <PermittedLink
            href={`/clients/${url.get('referredBy')}`}
            className="font-semibold text-link hover:underline focus-outline"
          >
            {t('clients.referredByProfile')}
          </PermittedLink>
          <button
            type="button"
            onClick={() => url.set({ referredBy: undefined, page: undefined })}
            className="font-semibold text-muted-foreground hover:underline focus-outline"
          >
            {t('clients.referredByClear')}
          </button>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-start gap-3">
        <DateRangePicker
          prefix={t('clients.registered')}
          choice={period.choice}
          custom={period.custom}
          defaultChoice={period.defaultChoice}
          onChange={period.set}
        />
        <ClientFilters
          values={{
            q: url.get('q'),
            type: url.get('type'),
            status: url.get('status'),
            tag: url.get('tag'),
          }}
          tags={tagsQuery.data ?? []}
          canViewTags={canViewTags}
          hiddenFilters={maskedFields}
          isFiltered={url.isFiltered}
          onChange={(patch) => {
            // Back to page one with every filter change. Page 7 of the old
            // filter is rarely page 7 of the new one, and is very often past
            // the end of it — which renders as an empty table and reads as
            // "no clients match", not as "you are too far down the list".
            url.set({ ...patch, page: undefined });
          }}
          onClear={() => url.clear()}
        />
      </div>

      <MaskedFieldsNotice labels={maskedFieldLabels(maskedFields, FIELD_LABELS)} />

      {status.mutation.isError && (
        <div
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {apiErrorMessage(status.mutation.error, t('clients.statusFailed'))}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('clients.loading')}
        endpoints={['GET /admin/clients', 'PATCH /admin/clients/:id/status']}
        onRetry={query.refetch}
        errorMessage={t('clients.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('clients.caption')}
          columns={columns}
          rows={rows}
          rowKey={(c) => String(c.id)}
          dimmed={query.isFetching}
          selectable={canBulk}
          selectedRowKeys={selectedIds}
          onSelectionChange={(ids) => setPicked({ forFilter: filterKey, ids })}
          renderBatchActions={(ids) => (
            <ClientBulkBar
              selectedIds={ids}
              pageCount={rows.length}
              total={total}
              filter={bulkFilterOf(params)}
              exportFilters={exportFilters}
              tags={tagsQuery.data ?? []}
              onDone={() => setPicked({ forFilter: filterKey, ids: [] })}
            />
          )}
          empty={
            <EmptyState
              icon={Users}
              message={t('clients.empty')}
              action={<PeriodWiden choice={period.choice} onChange={period.set} />}
            />
          }
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * THE FIX FOR THE LIE.
           *
           * Seven columns declared `sortable: true` and no handler was passed,
           * so clicking a header re-ordered the twenty-five rows on screen and
           * presented the result as if it were the dataset — R-2.5 names this
           * exactly: "sorting the 25 rows you happen to be holding looks
           * identical to sorting the dataset, and is wrong in a way no one
           * notices until someone acts on the top row."
           *
           * Passing `onSortChange` also switches `DataTable` out of its
           * client-side path and suppresses its scope warning, so no change to
           * that component is needed.
           *
           * The page is dropped along with the sort. Reordering the list
           * renumbers every page in it, so the rows at position 151–175 after a
           * sort are not the ones that were there before — staying on page 7
           * would silently show a different slice of a different ordering.
           */
          onSortChange={(key, order) => {
            url.set({
              sort: key ?? undefined,
              order: order ?? undefined,
              page: undefined,
            });
          }}
          pagination={{
            page,
            pageSize,
            total,
            // `String(next)`, and `undefined` for page one: `url.set` drops a
            // key it is handed `undefined`, so returning to the first page
            // leaves a clean URL rather than a trailing `?page=1`.
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            /*
             * THE SIZE AND THE PAGE ARE WRITTEN TOGETHER, and the page is
             * DROPPED.
             *
             * Page 4 at 25 a page is past the end at 100 a page, which renders
             * as an empty table and reads as "no clients match" rather than as
             * "you are beyond the end of the list". The same argument the
             * filters make one line above.
             *
             * `undefined` for the default size, so the common case leaves no
             * `?limit=25` behind — a clean URL is what makes "am I filtered?"
             * answerable from the address bar.
             */
            onPageSizeChange: (size) =>
              url.set({
                limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              }),
            noun: [t('clients.nounOne'), t('clients.nounMany')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}

/** The list's filter, as a bulk action's "all matching" target carries it. */
function bulkFilterOf(
  params: Record<string, string | number | boolean | undefined | null>,
): BulkClientFilter {
  const text = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const referredBy = text('referredBy');
  return {
    q: text('q'),
    type: text('type'),
    status: text('status'),
    level: text('level'),
    country: text('country'),
    kycStatus: text('kycStatus'),
    emailVerified: text('emailVerified'),
    tag: text('tag'),
    referredBy: referredBy && /^\d+$/.test(referredBy) ? +referredBy : undefined, // a Portal ID, not money
    from: text('from'),
    to: text('to'),
  };
}
