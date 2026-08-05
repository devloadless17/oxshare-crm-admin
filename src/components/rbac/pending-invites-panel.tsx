'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { api } from '@/lib/api';
import type { PendingInvite } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
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
          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">{t('settings.colAdministrator')}</th>
                  <th className="px-6 py-3">{t('settings.colEmail')}</th>
                  <th className="px-6 py-3">{t('adminUsers.colInvited')}</th>
                  <th className="px-6 py-3">{t('adminUsers.colExpires')}</th>
                  {canRevoke && <th className="px-6 py-3">{t('adminUsers.colActions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-foreground">
                      <span className="inline-flex items-center gap-2">
                        <MailWarning className="h-3.5 w-3.5 text-warning shrink-0" />
                        {invite.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">{invite.email}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(invite.expiresAt).toLocaleString()}
                    </td>
                    {canRevoke && (
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => handleRevoke(invite)}
                          disabled={revokingId === invite.id}
                          className="h-8 px-3 rounded-lg border border-destructive/30 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-outline"
                        >
                          {t('adminUsers.revoke')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
