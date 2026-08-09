'use client';

import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { DataTable, EmptyState } from '@/components/data-table';
import { PageLoader } from '@/components/ui/loader';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { maskedFieldLabels } from '@/lib/masking';
import { ClientFilters } from '@/components/clients/client-filters';
import { clientColumns } from '@/components/clients/client-columns';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

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
  const canViewTags = hasPermission(admin, 'tags.view') || hasPermission(admin, 'clients.view');
  const queryClient = useQueryClient();
  const confirm = useConfirm();

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
    sort: sortKey,
    // Withheld when nothing is sorted. `order` alone describes an ordering of
    // no column — the API is entitled to reject it, and sending it would also
    // make two identical result sets cache under different query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<ClientListResponse>(['clients', params], (signal) =>
    api.admin.getClients(params, signal),
  );

  // The tag vocabulary, for the filter chips and the row chips. Its own
  // resource so a tags failure degrades the filter bar rather than the list.
  const tagsQuery = useResource(['tags'], (signal) => api.admin.getTags(signal), {
    enabled: canViewTags,
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ client, next }: { client: ClientRow; next: 'active' | 'suspended' }) =>
      api.admin.setClientStatus(client.id, next),
    onSuccess: async (_data, { client, next }) => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      const who = client.email ?? client.id;
      toastSuccess(
        next === 'suspended'
          ? t('clients.suspendSucceeded', { email: who })
          : t('clients.reactivateSucceeded', { email: who }),
      );
    },
    /*
     * This mutation had NO error handling. A refusal — the API declines to
     * suspend a client outside the operator's tag scope — left the row exactly
     * as it was, which is indistinguishable from the click not registering.
     */
    onError: (error) => toastError(error, t('clients.statusFailed')),
  });

  const toggleStatus = async (client: ClientRow) => {
    const next = client.status === 'suspended' ? 'active' : 'suspended';
    // Suspension bites immediately server-side — live sessions die on the next
    // request — so confirm before pulling the trigger. Reactivating is not
    // confirmed: it restores access rather than removing it.
    if (next === 'suspended') {
      const email = client.email ?? client.id;
      const ok = await confirm({
        title: t('clients.confirmSuspendTitle', { email }),
        description: t('clients.confirmSuspend', { email }),
        confirmLabel: t('clients.suspend'),
        destructive: true,
      });
      if (!ok) return;
    }
    setStatusMutation.mutate({ client, next });
  };

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const maskedFields = query.data?.maskedFields ?? [];
  const actingId = setStatusMutation.isPending ? setStatusMutation.variables?.client.id : null;

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
  const columns = clientColumns({
    canSuspend,
    canViewTags,
    maskedFields,
    actingId,
    onToggleStatus: (client: ClientRow) => void toggleStatus(client),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('clients.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('clients.subtitle')}</p>
      </div>

      <div className="shrink-0">
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

      {setStatusMutation.isError && (
        <div
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {apiErrorMessage(setStatusMutation.error, t('clients.statusFailed'))}
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
          rowKey={(c) => c.id}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Users} message={t('clients.empty')} />}
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
