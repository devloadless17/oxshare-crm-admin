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
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState } from '@/components/data-table';
import { PageLoader } from '@/components/ui/loader';
import { useCursorPages } from '@/hooks/use-cursor-pages';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { maskedFieldLabels } from '@/lib/masking';
import { ClientFilters } from '@/components/clients/client-filters';
import { clientColumns } from '@/components/clients/client-columns';
import { t } from '@/lib/i18n';

const PAGE_SIZE = 25;

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
  const canSuspend = hasPermission(admin, 'users.suspend');
  const canViewTags = hasPermission(admin, 'tags.view') || hasPermission(admin, 'users.view');
  const queryClient = useQueryClient();

  const url = useTableQueryState();
  /*
   * Cursor navigation, not numbered pages — R-2.4.
   *
   * This is the ~219,000-record list, and it is written to while it is read: a
   * client registers while an admin is part-way down, every later offset page
   * shifts, and one client is never shown. Nothing looks wrong, and the
   * reviewer believes they saw everyone.
   *
   * The cursor stays out of the URL deliberately (see `use-table-query-state`):
   * it names a row, not an ordinal, and a shared link should land on page one.
   */
  const pages = useCursorPages();
  const debouncedSearch = useDebounced(url.get('q').trim());

  const sortKey = CLIENT_SORT_KEYS.includes(url.sort.key as ClientSortKey)
    ? (url.sort.key as ClientSortKey)
    : undefined;

  const params = {
    limit: PAGE_SIZE,
    cursor: pages.cursor,
    q: debouncedSearch,
    type: url.get('type'),
    status: url.get('status'),
    level: url.get('level'),
    country: url.get('country'),
    tag: url.get('tag'),
    sort: sortKey,
    order: url.sort.order,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  const toggleStatus = (client: ClientRow) => {
    const next = client.status === 'suspended' ? 'active' : 'suspended';
    // Suspension bites immediately server-side — live sessions die on the next
    // request — so confirm before pulling the trigger. Reactivating is not
    // confirmed: it restores access rather than removing it.
    if (
      next === 'suspended' &&
      !window.confirm(t('clients.confirmSuspend', { email: client.email ?? client.id }))
    ) {
      return;
    }
    setStatusMutation.mutate({ client, next });
  };

  const rows = query.data?.items ?? [];
  const nextCursor = query.data?.nextCursor ?? null;
  const maskedFields = query.data?.maskedFields ?? [];
  const actingId = setStatusMutation.isPending ? setStatusMutation.variables?.client.id : null;

  /*
   * Countries offered by the filter come from the ROWS ON SCREEN.
   *
   * Not an ISO-3166 list: `users.country` is free text written by the KYC flow,
   * so a canonical list would offer values no client actually carries and omit
   * the ones they do. Not a `SELECT DISTINCT` endpoint either, yet — that is
   * the right answer and it is a backend change; this keeps the filter honest
   * about what it can promise in the meantime.
   */
  const countries = [...new Set(rows.map((c) => c.country).filter((c): c is string => !!c))].sort();

  const columns = clientColumns({
    canSuspend,
    canViewTags,
    maskedFields,
    actingId,
    onToggleStatus: toggleStatus,
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
            level: url.get('level'),
            country: url.get('country'),
            tag: url.get('tag'),
          }}
          tags={tagsQuery.data ?? []}
          canViewTags={canViewTags}
          countries={countries}
          hiddenFilters={maskedFields}
          isFiltered={url.isFiltered}
          onChange={(patch) => {
            // Any filter change invalidates the cursor: it names a position in
            // the PREVIOUS result set.
            pages.reset();
            url.set(patch);
          }}
          onClear={() => {
            pages.reset();
            url.clear();
          }}
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
           * `pages.reset()` FIRST, and it is load-bearing: a cursor encodes
           * `(sortValue, id)` and is meaningless under a different ordering.
           * The API refuses a mismatched cursor with a 400 rather than serving
           * plausible wrong rows — this is what stops the user seeing that.
           */
          onSortChange={(key, order) => {
            pages.reset();
            url.setSort(key, order);
          }}
          cursorPagination={{
            pageNumber: pages.pageNumber,
            pageSize: PAGE_SIZE,
            showing: rows.length,
            canGoBack: pages.canGoBack,
            canGoForward: Boolean(nextCursor),
            onBack: pages.goBack,
            onNext: () => pages.goNext(nextCursor),
            noun: [t('clients.nounOne'), t('clients.nounMany')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
