'use client';

import { clientLabel } from '@/components/clients/client-identity';
import { Suspense, useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
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
import { ChangeLevelFromList } from '@/components/clients/change-level-from-list';
import { ReassignParentFromList } from '@/components/partners/reassign-parent-from-list';
import { AppointPartnerDialog } from '@/components/clients/profile/partner-structure-dialogs';
import { EditTermsFromList } from '@/components/partners/edit-terms-from-list';
import { clientColumns } from '@/components/clients/client-columns';
import { useClientStatusToggle } from '@/components/clients/use-client-status-toggle';
import { ExportButton } from '@/components/export-button';
import { LinkAccountDialog } from '@/components/trading/link-account-dialog';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * REFERRALS — every client a partner introduced, and who introduced them
 * (owner, 28 Sep 2026). Under Introducing brokers in the sidebar.
 *
 * It is the client list with ONE filter fixed: `GET /admin/clients?referred=true`.
 * Not a second endpoint, so it pages, sorts, scopes and masks exactly as the
 * directory does, and the export is the same file with the same filter.
 *
 * The filter is the ATTRIBUTION (`users.referred_by_ib_user_id`), not the client
 * type: a referred client who has since become a partner is still somebody a
 * partner brought in, and is listed with type "Partner".
 *
 * "Introduced by" is drawn only for a reader holding `ib.view` — the API sends
 * the introducer to nobody else, and a column of dashes would read as "nobody
 * introduced anyone". Without it the page is still the list of referred
 * clients, which is what `clients.view` (the route's key) entitles.
 */

/** Catalog key → operator's word, for the "hidden columns" notice — as on /clients. */
const FIELD_LABELS: Record<string, string> = {
  'client.email': t('clients.colEmail'),
  'client.firstName': t('clients.colName'),
  'client.lastName': t('clients.colName'),
  'client.country': t('clients.colCountry'),
  'client.createdAt': t('clients.colCreated'),
  'client.tags': t('clients.colTags'),
};

/* A referred client is a referral or, since, a partner — never an individual. */
const REFERRED_TYPES = ['referral', 'partner'] as const;

export default function ReferralsPage() {
  // `useSearchParams()` needs a Suspense boundary or `npm run build` fails.
  return (
    <Suspense fallback={<PageLoader label={t('referrals.loading')} />}>
      <ReferralsPageContent />
    </Suspense>
  );
}

function ReferralsPageContent() {
  const { admin } = useAdmin();
  const canSuspend = hasPermission(admin, 'clients.suspend');
  const canEditPartners = hasPermission(admin, 'ib.partners.edit');
  const canViewTags = hasPermission(admin, 'tags.view') || hasPermission(admin, 'clients.view');
  const canViewPartners = hasPermission(admin, 'ib.referrals.view');

  // Filters, page, size and sort live in the URL, as on /clients.
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  const pageSize = limitParam(url.get('limit'));
  const debouncedSearch = useDebounced(url.get('q').trim());
  const sortKey = CLIENT_SORT_KEYS.includes(url.sort.key as ClientSortKey)
    ? (url.sort.key as ClientSortKey)
    : undefined;

  const params = {
    limit: pageSize,
    page,
    withTotal: true,
    referred: 'true' as const,
    q: debouncedSearch,
    type: url.get('type'),
    status: url.get('status'),
    tag: url.get('tag'),
    sort: sortKey,
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<ClientListResponse>(keys.clients.list(params), (signal) =>
    api.admin.getClients(params, signal),
  );
  const tagsQuery = useResource(keys.tags.all(), (signal) => api.admin.getTags(signal), {
    enabled: canViewTags,
  });
  const status = useClientStatusToggle();
  const [programTarget, setProgramTarget] = useState<ClientRow | null>(null);
  // Where a partner stands in the tree (owner, 7 Oct 2026).
  const [parentTarget, setParentTarget] = useState<ClientRow | null>(null);
  const [appointTarget, setAppointTarget] = useState<ClientRow | null>(null);
  const canAppointPartners = hasPermission(admin, 'ib.approve');
  const [termsTarget, setTermsTarget] = useState<ClientRow | null>(null);
  // "Link MT5 account" from a row, the client filled in (29 Sep 2026).
  const canLinkAccounts = hasPermission(admin, 'trading.create');
  const [linkFor, setLinkFor] = useState<ClientRow | null>(null);

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const maskedFields = query.data?.maskedFields ?? [];

  // The file is this page: the fixed filter plus whatever narrows it, and the sort.
  const exportFilters = useMemo(() => {
    const filters = new URLSearchParams({ referred: 'true' });
    for (const [key, value] of Object.entries({
      q: params.q,
      type: params.type,
      status: params.status,
      tag: params.tag,
      sort: params.sort,
      order: params.order,
    })) {
      if (value) filters.set(key, value);
    }
    return filters;
  }, [params.q, params.type, params.status, params.tag, params.sort, params.order]);

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
    showReferrer: canViewPartners,
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
          name={clientLabel(programTarget)}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('referrals.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('referrals.subtitle')}</p>
        </div>
        <ExportButton resource="clients" filters={exportFilters} disabled={total === 0} />
      </div>

      <div className="shrink-0">
        <ClientFilters
          values={{
            q: url.get('q'),
            type: url.get('type'),
            status: url.get('status'),
            tag: url.get('tag'),
          }}
          types={REFERRED_TYPES}
          tags={tagsQuery.data ?? []}
          canViewTags={canViewTags}
          hiddenFilters={maskedFields}
          isFiltered={url.isFiltered}
          // Back to page one with every filter change, as on /clients.
          onChange={(patch) => url.set({ ...patch, page: undefined })}
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
        label={t('referrals.loading')}
        endpoints={['GET /admin/clients', 'PATCH /admin/clients/:id/status']}
        onRetry={query.refetch}
        errorMessage={t('referrals.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('referrals.caption')}
          columns={columns}
          rows={rows}
          rowKey={(c) => String(c.id)}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={Handshake}
              message={url.isFiltered ? t('referrals.empty') : t('referrals.emptyNone')}
            />
          }
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          // Server-side, and the page resets with it — /clients says why.
          onSortChange={(key, order) =>
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined })
          }
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
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
