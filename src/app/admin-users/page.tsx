'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Key, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Role, AdminUser } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * Who holds which role.
 *
 * Was the "Admin Users" tab of /settings. The nav has carried an /admin-users
 * entry marked "Soon" the whole time this directory existed inside Settings —
 * an operator following the sidebar was told the feature was unbuilt while it
 * was one tab away. Splitting the page resolves that.
 *
 * The roles list is fetched alongside the directory because the assignment
 * dropdown is built from it; that is a genuine dependency, unlike the
 * permission catalog this page no longer pulls.
 */
export default function AdminUsersPage() {
  const { admin } = useAdmin();
  const canEditAdmins = hasPermission(admin, 'users.edit');
  const canInvite = hasPermission(admin, 'users.create');
  const canViewRoles = hasPermission(admin, 'roles.view');

  const queryClient = useQueryClient();

  const query = useResource(['admin-users'], async () => {
    const [roles, adminUsers] = await Promise.all([
      api.admin.getRoles(),
      api.admin.getAdminUsers(),
    ]);
    return { roles, adminUsers };
  });

  const roles: Role[] = query.data?.roles ?? [];
  const adminUsers: AdminUser[] = query.data?.adminUsers ?? [];

  const assignRole = useMutation({
    mutationFn: ({ user, roleId }: { user: AdminUser; roleId: string }) =>
      api.admin.updateAdminUser(user.id, { roleId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const handleAssignRole = (user: AdminUser, roleId: string) => {
    // Reassigning to the role already held sends nothing. The backend enforces
    // an anti-escalation invariant on this path, and a redundant write is a
    // redundant audit-log entry against a real administrator.
    if (!roleId || roleId === user.roleId) return;
    assignRole.mutate({ user, roleId });
  };

  // 403 for self-changes or over-grants.
  const banner = assignRole.isError
    ? apiErrorMessage(assignRole.error, 'Failed to change the admin’s role.')
    : '';

  const assigningId = assignRole.isPending ? assignRole.variables?.user.id : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('adminUsers.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('adminUsers.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {canViewRoles && (
            <Link
              href="/roles"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted focus-outline"
            >
              <ShieldCheck className="h-4 w-4" />
              {t('adminUsers.rolesLink')}
            </Link>
          )}
          {canInvite && (
            <Link
              href="/invite"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover focus-outline"
            >
              <UserPlus className="h-4 w-4" />
              {t('invite.title')}
            </Link>
          )}
        </div>
      </div>

      {banner && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {banner}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label="Loading admin users"
        endpoints={['GET /admin/roles', 'GET /admin/users']}
        onRetry={query.refetch}
        errorMessage="Failed to load admin users."
        error={query.error}
      >
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">{t('settings.directoryTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.directoryHint')}</p>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">{t('settings.colAdministrator')}</th>
                  <th className="px-6 py-3">{t('settings.colEmail')}</th>
                  <th className="px-6 py-3">{t('settings.colRole')}</th>
                  <th className="px-6 py-3">{t('settings.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {adminUsers.map((user) => {
                  const isMasterRow = user.role === 'master_admin';
                  const isSelf = user.id === admin?.id;
                  // The API refuses self-changes and master changes; don't offer them
                  const reassignable = canEditAdmins && !isMasterRow && !isSelf;
                  return (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">
                        {user.name}
                        {isSelf && (
                          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                            {t('settings.you')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{user.email}</td>
                      <td className="px-6 py-4">
                        {reassignable ? (
                          <Select
                            value={user.roleId ?? ''}
                            onValueChange={(val) => handleAssignRole(user, val)}
                            disabled={assigningId === user.id}
                          >
                            <SelectTrigger className="h-8 text-[11px] font-semibold w-40">
                              <SelectValue
                                placeholder={user.roleId ? 'Change role…' : 'Custom permissions'}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {roles
                                .filter((r) => !r.isSystem)
                                .map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    {r.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-link border border-primary/20">
                            <Key className="h-3 w-3" />
                            {roles.find((r) => r.id === user.roleId)?.name || user.role}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                          {t('clients.statusActive')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
