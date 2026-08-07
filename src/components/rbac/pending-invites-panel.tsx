'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailWarning, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { PendingInvite } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * Invites that have been sent and not yet accepted.
 *
 * Before this, an invite vanished the moment it was sent. The directory lists
 * accepted administrators only, so there was no way to answer "did we invite
 * Sam, and did they accept?" other than searching your own sent mail — and no
 * way at all to cancel one that went to a mistyped address. The token is a
 * 48-hour bearer credential that CREATES AN ADMIN ACCOUNT on a system that
 * approves payouts; "wait for it to expire" is not a cancel button.
 *
 * Owns its own query rather than joining the directory's: the two lists come
 * from different endpoints with different permissions (users.view reads both,
 * but only users.create may revoke), and folding them together would make the
 * directory wait on invites it does not need.
 */
export function PendingInvitesPanel({ canRevoke }: { canRevoke: boolean }) {
  const queryClient = useQueryClient();
  const query = useResource(['admin-invites'], () => api.admin.getPendingInvites());
  const invites: PendingInvite[] = query.data ?? [];

  const revoke = useMutation({
    mutationFn: (invite: PendingInvite) => api.admin.revokeInvite(invite.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-invites'] }),
  });

  const handleRevoke = (invite: PendingInvite) => {
    if (!window.confirm(t('adminUsers.confirmRevoke', { email: invite.email }))) return;
    revoke.mutate(invite);
  };

  const revokingId = revoke.isPending ? revoke.variables?.id : null;

  const columns: Column<PendingInvite>[] = [
    {
      header: t('settings.colAdministrator'),
      cell: (invite) => (
        <span className="inline-flex items-center gap-2">
          <MailWarning className="h-3.5 w-3.5 text-warning shrink-0" />
          {invite.name}
        </span>
      ),
      cellClassName: 'font-semibold text-foreground',
    },
    {
      header: t('settings.colEmail'),
      cell: (invite) => invite.email,
      cellClassName: 'font-mono text-muted-foreground',
    },
    {
      header: t('adminUsers.colInvited'),
      cell: (invite) => new Date(invite.createdAt).toLocaleDateString(),
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('adminUsers.colExpires'),
      cell: (invite) => new Date(invite.expiresAt).toLocaleString(),
      cellClassName: 'text-muted-foreground',
    },
    ...(canRevoke
      ? [
          actionsColumn<PendingInvite>(
            (invite) => (
              <RowActions
                label={t('table.rowActions', { name: invite.name })}
                busy={revokingId === invite.id}
                items={[
                  {
                    label: t('adminUsers.revoke'),
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => handleRevoke(invite),
                  },
                ]}
              />
            ),
            t('adminUsers.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
        <h2 className="text-base font-semibold">{t('adminUsers.pendingTitle')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('adminUsers.pendingHint')}</p>
      </div>

      {revoke.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {apiErrorMessage(revoke.error, 'Failed to revoke the invite.')}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label="Loading outstanding invites"
        endpoints={['GET /admin/invites']}
        onRetry={query.refetch}
        errorMessage="Failed to load outstanding invites."
        error={query.error}
      >
        {invites.length === 0 ? (
          // An empty list is a real answer here — say it, rather than rendering
          // an empty table that reads as a failed load.
          <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            {t('adminUsers.pendingNone')}
          </div>
        ) : (
          <DataTable
            caption={t('adminUsers.pendingTitle')}
            columns={columns}
            rows={invites}
            rowKey={(invite) => invite.id}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
