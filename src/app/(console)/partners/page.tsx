'use client';

import { Suspense, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Handshake } from 'lucide-react';
import api from '@/lib/api';
import {
  IB_PARTNER_SORT_KEYS,
  type IbPartnerPage,
  type IbPartnerRow,
  type IbPartnerSortKey,
} from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess, hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { UrlSearchInput } from '@/components/url-search-input';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { PageLoader } from '@/components/ui/loader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ChangeLevelFromList } from '@/components/clients/change-level-from-list';
import { EditTermsFromList } from '@/components/partners/edit-terms-from-list';
import { clientLabel } from '@/components/clients/client-identity';
import { partnerColumns } from '@/components/partners/partner-columns';
import { ReassignParentFromList } from '@/components/partners/reassign-parent-from-list';
import { maskedFieldLabels } from '@/lib/masking';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * THE PARTNER DIRECTORY — Introducing brokers ▸ Partners.
 *
 * ## It was deleted once, and why it is back
 *
 * A partner list lived here until 13 Aug and was removed because it and the
 * client list disagreed about who WAS a partner — 7 against 1 — when this read
 * `ib_accounts` and the client filter read a label nothing maintained. The
 * client type is derived from `ib_accounts` now, both lists read that one
 * table, and the backend pins that their totals agree
 * (`test/ib-partner-directory.spec.ts`). The owner asked for the page back
 * (25 Sep 2026) because a partner is looked at as a partner — level, agency,
 * referral code, earnings, who placed them — and the client list shows none of
 * that. `/clients?type=partner` still works, and is still the way to see a
 * partner's KYC, tags and wallets.
 *
 * ## What it will not do
 *
 * - Hold a second copy of any rule. Every write here is a dialog or a PATCH the
 *   client profile already uses, and each is gated on the key its API enforces.
 * - Name anybody by uuid. People are named by Portal ID where their name is
 *   masked, and a parent outside the reader's territory is said to be exactly
 *   that — the API no longer sends that parent's id at all.
 * - Add currencies together. See `partner-columns.tsx`.
 */

/** Catalog key → what an operator calls it, for the hidden-columns notice. */
const FIELD_LABELS: Record<string, string> = {
  'client.email': t('clients.colEmail'),
  'client.firstName': t('partners.colName'),
  'client.lastName': t('partners.colName'),
};

const STATUSES = ['active', 'suspended'] as const;
type PartnerStatus = (typeof STATUSES)[number];

/*
 * `useSearchParams()` requires a Suspense boundary at prerender or
 * `npm run build` fails — and `next dev` does not, so CI is where you find out.
 */
export default function PartnersPage() {
  return (
    <Suspense fallback={<PageLoader label={t('partners.loading')} />}>
      <PartnersPageContent />
    </Suspense>
  );
}

function PartnersPageContent() {
  const { admin } = useAdmin();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const url = useTableQueryState();

  const page = pageParam(url.get('page'));
  const pageSize = limitParam(url.get('limit'));
  // The search box already writes the URL on a timer; this keeps the QUERY KEY
  // from changing on the same tick, so clearing filters is one request.
  const q = useDebounced(url.get('q').trim());
  const rawStatus = url.get('status');
  /*
   * Only a value the API accepts reaches it. A hand-edited `?status=bogus`
   * would be a 400, which renders as a broken screen — ignoring it renders the
   * unfiltered list, and the select shows "Every state", which is what it is.
   */
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as PartnerStatus)
    : undefined;
  const sortKey = IB_PARTNER_SORT_KEYS.includes(url.sort.key as IbPartnerSortKey)
    ? (url.sort.key as IbPartnerSortKey)
    : undefined;

  const params = {
    page,
    limit: pageSize,
    q: q || undefined,
    status,
    sort: sortKey,
    // Withheld when nothing is sorted — see the client list for why.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<IbPartnerPage>(keys.ibPartners.list(params), (signal) =>
    api.admin.getIbPartners(params, signal),
  );

  /*
   * The row a dialog is open for, or null. The ROW is held, not an id: the
   * dialog's title names the person, and the list beneath may re-fetch and
   * re-sort while it is open.
   */
  const [levelTarget, setLevelTarget] = useState<IbPartnerRow | null>(null);
  const [termsTarget, setTermsTarget] = useState<IbPartnerRow | null>(null);
  const [parentTarget, setParentTarget] = useState<IbPartnerRow | null>(null);

  const setActive = useMutation({
    mutationFn: ({ row, active }: { row: IbPartnerRow; active: boolean }) =>
      api.admin.setIbPartnerActive(row.account.userId, active),
    onSuccess: async (_data, { active }) => {
      // The profile's partner tab reads the same partner under this root.
      await queryClient.invalidateQueries({ queryKey: keys.ibPartners.all() });
      toastSuccess(
        t('clientProfile.partnerStateChanged', {
          state: active ? t('clientProfile.partnerActive') : t('clientProfile.partnerSuspended'),
        }),
      );
    },
    onError: (error) => toastError(error, t('clientProfile.partnerStateFailed')),
  });

  /*
   * Confirmed both ways, in the profile's words. Suspending stops a partner
   * earning AND breaks the chain above them; reactivating restarts pay on the
   * next closed trade — both change money, so neither is a single click.
   */
  const toggleActive = async (row: IbPartnerRow) => {
    const next = !row.account.active;
    const name = clientLabel(row.user);
    const ok = await confirm({
      title: next
        ? t('clientProfile.confirmReactivatePartnerTitle', { name })
        : t('clientProfile.confirmSuspendPartnerTitle', { name }),
      description: next
        ? t('clientProfile.confirmReactivatePartner')
        : t('clientProfile.confirmSuspendPartner'),
      confirmLabel: next
        ? t('clientProfile.actionReactivatePartner')
        : t('clientProfile.actionSuspendPartner'),
      destructive: !next,
    });
    if (ok) setActive.mutate({ row, active: next });
  };

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const maskedFields = query.data?.maskedFields ?? [];

  const columns = partnerColumns({
    maskedFields,
    canViewClients: canAccess(admin, '/clients'),
    canViewCommissions: canAccess(admin, '/commissions'),
    canEditPartners: hasPermission(admin, 'ib.partners.edit'),
    canSuspendPartners: hasPermission(admin, 'ib.partners.suspend'),
    actingId: setActive.isPending ? setActive.variables?.row.account.userId : null,
    onChangeLevel: setLevelTarget,
    onReassignParent: setParentTarget,
    onEditTerms: setTermsTarget,
    onToggleActive: (row) => void toggleActive(row),
  });

  // The file is the list on screen: the same search and state, no paging.
  const exportFilters = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {levelTarget && (
        <ChangeLevelFromList
          open
          onClose={() => setLevelTarget(null)}
          userId={levelTarget.account.userId}
          name={clientLabel(levelTarget.user)}
        />
      )}
      {termsTarget && (
        <EditTermsFromList
          open
          onClose={() => setTermsTarget(null)}
          userId={termsTarget.account.userId}
          name={clientLabel(termsTarget.user)}
        />
      )}
      {parentTarget && (
        <ReassignParentFromList
          open
          onClose={() => setParentTarget(null)}
          userId={parentTarget.account.userId}
          name={clientLabel(parentTarget.user)}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('partners.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('partners.subtitle')}</p>
        </div>
        <ExportButton resource="ib/partners" filters={exportFilters} disabled={total === 0} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <UrlSearchInput
          value={url.get('q')}
          label={t('partners.searchLabel')}
          placeholder={t('partners.searchPlaceholder')}
          title={t('partners.searchHint')}
          // Wide enough for a placeholder naming four things; a clipped one
          // reads as a broken control.
          className="w-full sm:w-80"
          // Filter and page written together, so narrowing lands on page one.
          onChange={(next) => url.set({ q: next || undefined, page: undefined })}
        />

        <Select
          value={status ?? 'all'}
          onValueChange={(value) =>
            url.set({ status: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label={t('partners.filterStatus')}>
            <SelectValue placeholder={t('partners.statusAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('partners.statusAll')}</SelectItem>
            <SelectItem value="active">{t('partners.statusActive')}</SelectItem>
            <SelectItem value="suspended">{t('partners.statusSuspended')}</SelectItem>
          </SelectContent>
        </Select>

        {url.isFiltered && (
          <button
            type="button"
            onClick={() => url.clear()}
            className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted focus-outline"
          >
            {t('partners.clearFilters')}
          </button>
        )}
      </div>

      <MaskedFieldsNotice labels={maskedFieldLabels(maskedFields, FIELD_LABELS)} />

      <AsyncBoundary
        status={query.status}
        label={t('partners.loading')}
        endpoints={['GET /admin/ib/partners']}
        onRetry={query.refetch}
        errorMessage={t('partners.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('partners.caption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.account.userId)}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Handshake} message={t('partners.empty')} />}
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          // Server-side, and the page goes with the sort: reordering renumbers
          // every page, so staying on page 3 would show a different slice.
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
            noun: [t('partners.nounOne'), t('partners.nounMany')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}
