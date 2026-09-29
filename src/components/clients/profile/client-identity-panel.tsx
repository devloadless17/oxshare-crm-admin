'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import api from '@/lib/api';
import type { ClientIdentityRecord, ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

type Decision = NonNullable<ClientIdentityRecord['verifications']>[number];

const STATUS: Record<
  Decision['outcome'] | 'draft' | 'awaiting_review',
  { key: MessageKey; variant: 'default' | 'success' | 'warning' | 'destructive' }
> = {
  draft: { key: 'clientProfile.identityStatusDraft', variant: 'default' },
  awaiting_review: { key: 'clientProfile.identityStatusAwaiting', variant: 'warning' },
  verified: { key: 'clientProfile.identityStatusVerified', variant: 'success' },
  returned: { key: 'clientProfile.identityStatusReturned', variant: 'destructive' },
  reverification_requested: { key: 'clientProfile.identityStatusReverify', variant: 'destructive' },
};

/**
 * The client's VERIFICATION HISTORY — every decision on their identity, who
 * made it, and what it returned — behind a button in the Documents tab.
 *
 * It was half of the Overview's identity-record card, beside the documents. The
 * owner moved the documents to their own tab (29 Sep 2026) and the card went
 * with them; the decision log is the part no other screen on the profile
 * shows, so it moved rather than went. Asked for only when opened.
 *
 * `verifications` is absent without kyc.view, and the dialog says so rather
 * than showing an empty list that reads as "never decided".
 */
export function VerificationHistoryButton({ clientId }: { clientId: ClientRef }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        {t('clientProfile.sectionVerifications')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="verification-history-title"
        title={t('clientProfile.sectionVerifications')}
      >
        {open && <VerificationLog clientId={clientId} />}
      </Modal>
    </>
  );
}

function VerificationLog({ clientId }: { clientId: ClientRef }) {
  const query = useResource<ClientIdentityRecord>(keys.clients.identity(clientId), (signal) =>
    api.admin.getClientIdentity(clientId, signal),
  );
  const decisions = query.data?.verifications;
  return (
    <AsyncBoundary
      status={query.status}
      label={t('clientProfile.identityLoading')}
      endpoints={['GET /admin/clients/:id/identity']}
      onRetry={query.refetch}
      errorMessage={t('clientProfile.identityLoadFailed')}
      error={query.error}
    >
      {decisions === undefined ? (
        <p className="text-xs text-muted-foreground">{t('clientProfile.verificationsHidden')}</p>
      ) : decisions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('clientProfile.noVerifications')}</p>
      ) : (
        <ol className="space-y-2">
          {decisions.map((decision) => (
            <DecisionView key={decision.seq} decision={decision} />
          ))}
        </ol>
      )}
    </AsyncBoundary>
  );
}

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
