'use client';

import * as React from 'react';
import { Eye, FileText } from 'lucide-react';
import api from '@/lib/api';
import type { ClientDocument, ClientDocumentList, ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DocLightbox } from '@/components/kyc-review/doc-lightbox';
import { assetUrl } from '@/lib/asset-url';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { ChoiceFilter } from './table-state';
import { VerificationHistoryButton } from './client-identity-panel';

/**
 * Every document the client has handed the platform — the profile's Documents
 * tab (owner, 29 Sep 2026): identity documents, proof of address, the selfie, a
 * broker's own KYC uploads, and the receipts on offline deposits, each with
 * where it stands.
 *
 * `GET /admin/clients/:id/documents` decides every status from its source, so
 * this screen invents none: a KYC version reads its review, a receipt reads its
 * DEPOSIT — a receipt on a refused deposit is Rejected, with the reason.
 *
 * The whole list arrives at once (a client holds tens of documents, not
 * thousands), so the filters and the order are applied here, over all of it.
 */

type Category = ClientDocument['category'];
type Status = ClientDocument['status'];

const CATEGORIES: readonly Category[] = [
  'identity',
  'address',
  'selfie',
  'kyc_other',
  'deposit_receipt',
];
const STATUSES: readonly Status[] = [
  'pending',
  'approved',
  'rejected',
  'reverification_requested',
  'draft',
];

const STATUS_VARIANT: Record<Status, 'success' | 'warning' | 'destructive' | 'default'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
  reverification_requested: 'warning',
  draft: 'default',
};

export function ClientDocumentsPanel({ userId }: { userId: ClientRef }) {
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc');
  const [viewing, setViewing] = React.useState<{ doc: ClientDocument; index: number } | null>(null);

  const query = useResource<ClientDocumentList>(keys.clients.documents(userId), (signal) =>
    api.admin.getClientDocuments(userId, signal),
  );

  const rows = React.useMemo(() => {
    const items = (query.data?.items ?? []).filter(
      (doc) => (!category || doc.category === category) && (!status || doc.status === status),
    );
    // ISO timestamps compare correctly as strings; the server sends newest first.
    return order === 'desc' ? items : [...items].reverse();
  }, [query.data, category, status, order]);

  const hidden = query.data?.hidden ?? [];
  const hiddenKyc = hidden.includes('identity');
  const hiddenReceipts = hidden.includes('deposit_receipt');

  const columns: Column<ClientDocument>[] = [
    {
      header: t('clientProfile.docColDocument'),
      sortable: false,
      cell: (doc) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-foreground">
            {doc.title}
            {!doc.current && <Badge variant="default">{t('clientProfile.docReplaced')}</Badge>}
          </div>
          {doc.detail && <div className="text-xs text-muted-foreground">{doc.detail}</div>}
        </div>
      ),
    },
    {
      header: t('clientProfile.docColType'),
      sortable: false,
      cell: (doc) => t(`clientProfile.docCategory.${doc.category}`),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
    },
    {
      header: t('clientProfile.docColStatus'),
      sortable: false,
      cell: (doc) => (
        <div className="space-y-1">
          <Badge variant={STATUS_VARIANT[doc.status]}>
            {t(`clientProfile.docStatus.${doc.status}`)}
          </Badge>
          {doc.reason && (
            <p className="max-w-[18rem] text-[11px] leading-snug text-destructive">{doc.reason}</p>
          )}
        </div>
      ),
    },
    {
      header: t('clientProfile.docColDate'),
      sortable: true,
      sortKey: 'uploadedAt',
      cell: (doc) => new Date(doc.uploadedAt).toLocaleString(),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
    },
    {
      header: t('clientProfile.docColFiles'),
      sortable: false,
      align: 'right',
      cell: (doc) =>
        doc.files.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t('clientProfile.docNoFiles')}</span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setViewing({ doc, index: 0 })}
            // The detail too: two versions of one document must not share a name.
            aria-label={t('clientProfile.docViewFor', {
              name: [doc.title, doc.detail].filter(Boolean).join(' — '),
            })}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {doc.files.length > 1
              ? t('clientProfile.docViewPages', { count: String(doc.files.length) })
              : t('clientProfile.docView')}
          </Button>
        ),
    },
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ChoiceFilter
          label={t('clientProfile.docFilterType')}
          allLabel={t('clientProfile.docFilterTypeAll')}
          value={category}
          options={CATEGORIES.filter((c) => !hidden.includes(c)).map((value) => ({
            value,
            label: t(`clientProfile.docCategory.${value}`),
          }))}
          onChange={setCategory}
        />
        <ChoiceFilter
          label={t('clientProfile.docFilterStatus')}
          allLabel={t('clientProfile.docFilterStatusAll')}
          value={status}
          options={STATUSES.map((value) => ({
            value,
            label: t(`clientProfile.docStatus.${value}`),
          }))}
          onChange={setStatus}
        />
        <div className="sm:ms-auto">
          <VerificationHistoryButton clientId={userId} />
        </div>
      </div>

      {/* A half withheld is SAID, so an empty list never reads as "has none". */}
      {(hiddenKyc || hiddenReceipts) && (
        <p className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {hiddenKyc && hiddenReceipts
            ? t('clientProfile.docHiddenBoth')
            : hiddenKyc
              ? t('clientProfile.docHiddenKyc')
              : t('clientProfile.docHiddenReceipts')}
        </p>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('clientProfile.docLoading')}
        endpoints={['GET /admin/clients/:id/documents']}
        onRetry={query.refetch}
        errorMessage={t('clientProfile.docLoadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('clientProfile.docTitle')}
          columns={columns}
          rows={rows}
          rowKey={(doc) => `${doc.category}-${doc.id}`}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={FileText}
              message={
                category || status ? t('clientProfile.docNoMatch') : t('clientProfile.docEmpty')
              }
            />
          }
          sortColumn="uploadedAt"
          sortDirection={order}
          onSortChange={(_key, next) => setOrder(next ?? 'desc')}
        />
      </AsyncBoundary>

      {viewing && (
        <DocLightbox
          docs={viewing.doc.files.map((file) => ({
            filePath: file.path,
            label: `${viewing.doc.title} — ${file.label}`,
            returned: viewing.doc.status === 'rejected',
          }))}
          index={viewing.index}
          onClose={() => setViewing(null)}
          onNavigate={(index) => setViewing({ doc: viewing.doc, index })}
          // Both buckets (kyc, deposit-proofs) arrive as full `uploads/…` paths;
          // `assetUrl` maps each to its own audited route.
          buildUrl={(filePath) => assetUrl(filePath) ?? ''}
        />
      )}
    </section>
  );
}
