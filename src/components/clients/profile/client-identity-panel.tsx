'use client';

import { FileText } from 'lucide-react';
import api from '@/lib/api';
import type { ClientIdentityRecord } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

type DocumentSlot = NonNullable<ClientIdentityRecord['documents']>[number];
type Version = DocumentSlot['versions'][number];
type Decision = NonNullable<ClientIdentityRecord['verifications']>[number];

const STATUS: Record<
  Version['status'],
  { key: MessageKey; variant: 'default' | 'success' | 'warning' | 'destructive' }
> = {
  draft: { key: 'clientProfile.identityStatusDraft', variant: 'default' },
  awaiting_review: { key: 'clientProfile.identityStatusAwaiting', variant: 'warning' },
  verified: { key: 'clientProfile.identityStatusVerified', variant: 'success' },
  returned: { key: 'clientProfile.identityStatusReturned', variant: 'destructive' },
  reverification_requested: { key: 'clientProfile.identityStatusReverify', variant: 'destructive' },
};

/**
 * The client's IDENTITY RECORD on their page (identity-core plan, slice 8):
 * every document and selfie they presented or are preparing — each version
 * with its status as the verification log decides it — and every decision.
 *
 * Pages are LINKS, never inline images, as the list this replaces was: each
 * open goes through GET /uploads/kyc/:file, which checks the reader and writes
 * the access row. Rendering thumbnails for every version would write "viewed"
 * rows for documents nobody looked at.
 *
 * Each half is present only for a reader the API lets see it; an absent half
 * says so rather than showing an empty list that reads as "none".
 */
export function ClientIdentityPanel({ clientId }: { clientId: ClientRef }) {
  const query = useResource<ClientIdentityRecord>(keys.clients.identity(clientId), (signal) =>
    api.admin.getClientIdentity(clientId, signal),
  );

  return (
    <AsyncBoundary
      status={query.status}
      label={t('clientProfile.identityLoading')}
      endpoints={['GET /admin/clients/:id/identity']}
      onRetry={query.refetch}
      errorMessage={t('clientProfile.identityLoadFailed')}
      error={query.error}
    >
      {query.data && <IdentityRecord record={query.data} />}
    </AsyncBoundary>
  );
}

function IdentityRecord({ record }: { record: ClientIdentityRecord }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="identity-documents">
        <h3 id="identity-documents" className="mb-2 text-sm font-semibold">
          {t('clientProfile.sectionDocuments')}
        </h3>
        {record.documents === undefined ? (
          <p className="text-xs text-muted-foreground">{t('clientProfile.documentsHidden')}</p>
        ) : record.documents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('clientProfile.noDocuments')}</p>
        ) : (
          <ul className="space-y-3">
            {record.documents.map((slot) => (
              <DocumentSlotView key={slot.slot} slot={slot} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="identity-verifications">
        <h3 id="identity-verifications" className="mb-2 text-sm font-semibold">
          {t('clientProfile.sectionVerifications')}
        </h3>
        {record.verifications === undefined ? (
          <p className="text-xs text-muted-foreground">{t('clientProfile.verificationsHidden')}</p>
        ) : record.verifications.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('clientProfile.noVerifications')}</p>
        ) : (
          <ol className="space-y-2">
            {record.verifications.map((decision) => (
              <DecisionView key={decision.seq} decision={decision} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function DocumentSlotView({ slot }: { slot: DocumentSlot }) {
  const [latest, ...earlier] = slot.versions;
  return (
    <li className="rounded-lg border border-border p-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{slot.label}</p>
      {latest && <VersionView version={latest} />}
      {earlier.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-link focus-outline">
            {t('clientProfile.identityEarlier', { count: earlier.length })}
          </summary>
          <ul className="mt-2 space-y-2 border-l border-border pl-3">
            {earlier.map((version) => (
              <li key={version.id}>
                <VersionView version={version} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function VersionView({ version }: { version: Version }) {
  const status = STATUS[version.status];
  // A broker's upload has one page, and its returned item is the question's key.
  const isReturned = (part: number) =>
    version.returnedPages.some((id) => (PAGE_PART[id] ?? 0) === part);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {version.docLabel && <span className="font-medium">{version.docLabel}</span>}
        <Badge variant={status.variant}>{t(status.key)}</Badge>
        <span className="text-muted-foreground">
          {version.presentedAt
            ? t('clientProfile.identityPresented', {
                date: new Date(version.presentedAt).toLocaleString(),
              })
            : t('clientProfile.identityDraft')}
        </span>
      </div>
      {version.pages.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {version.pages.map((page) => (
            <li key={page.part}>
              <a
                href={buildKycDocUrl(page.path)}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1.5 text-xs hover:underline focus-outline ${
                  isReturned(page.part) ? 'text-destructive' : 'text-link'
                }`}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {page.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Which page a returned item names, for drawing it in red. */
const PAGE_PART: Record<string, number> = {
  doc_front: 0,
  doc_back: 1,
  address_proof: 0,
  address_proof_2: 1,
  selfie: 0,
};

function DecisionView({ decision }: { decision: Decision }) {
  const status = STATUS[decision.outcome];
  const method =
    decision.method === 'legacy'
      ? t('clientProfile.verificationMethodLegacy')
      : decision.method === 'fixture'
        ? t('clientProfile.verificationMethodFixture')
        : undefined;
  return (
    <li className="rounded-lg border border-border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant}>{t(status.key)}</Badge>
        <span className="text-muted-foreground">
          {new Date(decision.decidedAt).toLocaleString()}
        </span>
        {decision.decidedBy && (
          <span className="text-muted-foreground">
            {t('clientProfile.verificationBy', { who: decision.decidedBy })}
          </span>
        )}
        {method && <span className="text-muted-foreground">({method})</span>}
      </div>
      {decision.reason && <p className="mt-1">{decision.reason}</p>}
      {decision.returnedLabels.length > 0 && (
        <p className="mt-1 text-destructive">
          {t('clientProfile.verificationReturned', { items: decision.returnedLabels.join(', ') })}
        </p>
      )}
    </li>
  );
}
