'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import api from '@/lib/api';
import type { ClientFollowUp, ClientRef } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { FollowUpWhen } from '@/components/clients/follow-up-when';
import { relativeTime } from '@/lib/relative-time';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';
import { FollowUpEditor } from './client-followup-editor';
import { ProfileCard } from './profile-cards';

/**
 * THE STAFF'S TWO NOTES ON A CLIENT (the buyer's request, backend 0212):
 * Follow-up — what to do next, with an optional date to do it by — and Result —
 * how the last contact went. Never shown to the client.
 *
 * Read with `clients.view`; written with `clients.followup.edit`, else shown as
 * text. Every change is in the audit log, which the History link opens on this
 * client's notes alone (for a reader holding `audit.view`).
 */
export function ClientFollowUpCard({ clientId }: { clientId: ClientRef }) {
  const { admin } = useAdmin();
  const canEdit = hasPermission(admin, 'clients.followup.edit');
  const query = useResource(keys.clients.followUp(clientId), (signal) =>
    api.admin.getClientFollowUp(clientId, signal),
  );

  return (
    <ProfileCard
      title={t('followUp.title')}
      action={
        hasPermission(admin, 'audit.view') ? (
          <Link
            href={`/audit-log?action=client.followup_update&subjectType=user&subjectId=${clientId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline focus-outline"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            {t('followUp.history')}
          </Link>
        ) : undefined
      }
    >
      <AsyncBoundary
        status={query.status}
        label={t('followUp.loading')}
        endpoints={['GET /admin/clients/:id/followup']}
        onRetry={query.refetch}
        errorMessage={t('followUp.loadFailed')}
        error={query.error}
      >
        {query.data && (
          <div className="space-y-3">
            {canEdit && admin ? (
              <FollowUpEditor adminId={admin.id} clientId={clientId} record={query.data} />
            ) : (
              <FollowUpText record={query.data} />
            )}
            <LastEdited record={query.data} />
          </div>
        )}
      </AsyncBoundary>
    </ProfileCard>
  );
}

/** The notes as text, for a reader who may not edit them. */
function FollowUpText({ record }: { record: ClientFollowUp }) {
  if (!record.followUp && !record.result && !record.followUpAt) {
    return <p className="text-sm text-muted-foreground">{t('followUp.empty')}</p>;
  }
  return (
    <dl className="grid gap-4 lg:grid-cols-2">
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('followUp.followUpLabel')}
        </dt>
        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">
          {record.followUp ?? t('followUp.none')}
        </dd>
        {record.followUpAt && (
          <dd className="mt-1.5">
            <FollowUpWhen at={record.followUpAt} />
          </dd>
        )}
      </div>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('followUp.resultLabel')}
        </dt>
        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">
          {record.result ?? t('followUp.none')}
        </dd>
      </div>
    </dl>
  );
}

/** Who saved the notes last, and when — from the server, never from this page's typing. */
function LastEdited({ record }: { record: ClientFollowUp }) {
  if (!record.updatedAt) return null;
  const when = relativeTime(record.updatedAt);
  return (
    <p
      className="text-[11px] text-muted-foreground"
      title={new Date(record.updatedAt).toLocaleString()}
    >
      {record.updatedBy
        ? t('followUp.lastEdited', { name: record.updatedBy.name, when })
        : t('followUp.lastEditedUnknown', { when })}
    </p>
  );
}
