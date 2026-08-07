'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AdminUser, Role } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import { ExportButton } from '@/components/export-button';
import { AdminDirectoryTable } from '@/components/rbac/admin-directory-table';
import { AdminFormModal, type AdminFormValues } from '@/components/rbac/admin-form-modal';
import { PendingInvitesPanel } from '@/components/rbac/pending-invites-panel';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * FR-RBAC-07 — create, view, edit and manage administrator accounts.
 *
 * Was the "Admin Users" tab of /settings, and only did the VIEW half plus role
 * reassignment. The other three arrived here:
 *
 *   create  → invite (its own screen) + the outstanding-invites panel below,
 *             which is what makes an invite something you can see and cancel
 *             rather than a mail you sent and forgot
 *   edit    → AdminFormModal: name, and per-admin permissions (FR-RBAC-02,
 *             which the API always supported and no screen ever reached)
 *   manage  → suspend / reactivate, the reversible alternative to deleting an
 *             administrator every audit_log row points at
 *
 * The permission catalog is fetched here because the edit modal needs it; the
 * roles list because both the modal and the reassignment dropdown do.
 */
export default function AdminUsersPage() {
  const { admin } = useAdmin();
  const canEditAdmins = hasPermission(admin, 'users.edit');
  const canSuspend = hasPermission(admin, 'users.suspend');
  // D-44. `users.create` is the admin-management grant in this catalogue — it is
  // what inviting an administrator requires. The API enforces the escalation
  // rule on top of it; this only decides whether to draw the button.
  const canResetPassword = hasPermission(admin, 'users.create');
  const canInvite = hasPermission(admin, 'users.create');
  const canViewRoles = hasPermission(admin, 'roles.view');

  const [editing, setEditing] = React.useState<AdminUser | null>(null);

  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const query = useResource(['admin-users'], async () => {
    /*
     * Five reads in one resource, because the edit modal needs all of them
     * before it can render a coherent form: the permission catalog, the tag
     * vocabulary and the field catalog are all VOCABULARIES the frontend must
     * not invent (R-4.5), and a modal that opened with two of the three would
     * offer a partial picture of somebody's access.
     */
    const [roles, adminUsers, catalog, tags, fieldCatalog] = await Promise.all([
      api.admin.getRoles(),
      api.admin.getAdminUsers(),
      api.admin.getPermissions(),
      api.admin.getTags(),
      api.admin.getClientFields(),
    ]);
    return { roles, adminUsers, catalog, tags, fieldCatalog };
  });

  const roles: Role[] = query.data?.roles ?? [];
  const adminUsers: AdminUser[] = query.data?.adminUsers ?? [];
  const catalog = query.data?.catalog ?? {};
  const tags = query.data?.tags ?? [];
  const fieldCatalog = query.data?.fieldCatalog ?? {};

  const assignRole = useMutation({
    mutationFn: ({ user, roleId }: { user: AdminUser; roleId: string }) =>
      api.admin.updateAdminUser(user.id, { roleId }),
    onSuccess: invalidate,
  });

  const saveAdmin = useMutation({
    mutationFn: ({ user, values }: { user: AdminUser; values: AdminFormValues }) =>
      api.admin.updateAdminUser(user.id, values),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
  });

  const setStatus = useMutation({
    mutationFn: (user: AdminUser) =>
      api.admin.setAdminStatus(user.id, user.status === 'suspended' ? 'active' : 'suspended'),
    onSuccess: invalidate,
  });

  const sendReset = useMutation({
    mutationFn: (user: AdminUser) => api.admin.sendAdminPasswordReset(user.id),
    // Nothing in the directory changes, so nothing is invalidated. The result
    // is an email; the only feedback available here is the banner below.
  });

  const handleResetPassword = (user: AdminUser) => {
    /*
     * Confirmed, because this is not reversible from the operator's side: it
     * arms a credential that grants that person's account, and completing it
     * signs them out everywhere. The name is in the prompt so a misclick on the
     * wrong row is caught before the email goes out, not after.
     */
    if (!window.confirm(t('adminUsers.confirmSendReset', { name: user.name }))) return;
    sendReset.mutate(user);
  };

  const handleAssignRole = (user: AdminUser, roleId: string) => {
    // Reassigning to the role already held sends nothing. The backend enforces
    // an anti-escalation invariant on this path, and a redundant write is a
    // redundant audit-log entry against a real administrator.
    if (!roleId || roleId === user.roleId) return;
    assignRole.mutate({ user, roleId });
  };

  const handleToggleStatus = (user: AdminUser) => {
    // Suspension signs someone out on their next request. Ask first — the same
    // guard role deletion gets, for the same reason.
    const message =
      user.status === 'suspended'
        ? t('adminUsers.confirmReactivate', { name: user.name })
        : t('adminUsers.confirmSuspend', { name: user.name });
    if (!window.confirm(message)) return;
    setStatus.mutate(user);
  };

  // 403 for self-changes, over-grants, or acting on a master admin.
  const banner = sendReset.isError
    ? apiErrorMessage(sendReset.error, 'Could not send that reset link.')
    : assignRole.isError
      ? apiErrorMessage(assignRole.error, 'Failed to change the admin’s role.')
      : setStatus.isError
        ? apiErrorMessage(setStatus.error, 'Failed to change the administrator’s status.')
        : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('adminUsers.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('adminUsers.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButton resource="admin-users" disabled={adminUsers.length === 0} />
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
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {banner}
        </div>
      )}

      {/*
       * ONE of the two tables fills, and it is the directory.
       *
       * Two `fill` tables in the same flex column both claim `flex-1` and split
       * the height between them, so each gets its own scrollbar and neither is
       * comfortable to read. The directory is the unbounded list — it grows with
       * the organisation and is the reason an operator came here — so it takes
       * the remaining height. Outstanding invites are a short, transient list
       * that is usually empty, so the panel below stays at its natural height
       * (`shrink-0`) and the page does not reserve space for rows that are
       * normally not there.
       */}
      <AsyncBoundary
        status={query.status}
        label="Loading admin users"
        endpoints={['GET /admin/roles', 'GET /admin/users', 'GET /admin/permissions']}
        onRetry={query.refetch}
        errorMessage="Failed to load admin users."
        error={query.error}
        fill
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="shrink-0 rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">{t('settings.directoryTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.directoryHint')}</p>
          </div>

          <AdminDirectoryTable
            admins={adminUsers}
            roles={roles}
            currentAdminId={admin?.id}
            can={{ canEdit: canEditAdmins, canSuspend, canResetPassword }}
            assigningId={assignRole.isPending ? assignRole.variables?.user.id : null}
            suspendingId={setStatus.isPending ? setStatus.variables?.id : null}
            onAssignRole={handleAssignRole}
            onEdit={setEditing}
            onToggleStatus={handleToggleStatus}
            onResetPassword={handleResetPassword}
          />
        </div>
      </AsyncBoundary>

      {/* Owns its own query — see the note in the panel. */}
      <div className="shrink-0">
        <PendingInvitesPanel canRevoke={canInvite} />
      </div>

      {editing && (
        <AdminFormModal
          admin={editing}
          roles={roles}
          catalog={catalog}
          tags={tags}
          fieldCatalog={fieldCatalog}
          currentScope={editing.scopedTags.map((tag) => tag.tagId)}
          /*
           * `users.scope`, NOT `users.edit`. Reusing the edit permission would
           * mean anyone who can rename an administrator can also widen that
           * administrator's view of the entire client base.
           */
          canScope={hasPermission(admin, 'users.scope')}
          busy={saveAdmin.isPending}
          error={
            saveAdmin.isError
              ? apiErrorMessage(saveAdmin.error, 'Failed to save the administrator.')
              : ''
          }
          onSubmit={(values) => saveAdmin.mutate({ user: editing, values })}
          onClose={() => {
            setEditing(null);
            saveAdmin.reset();
          }}
        />
      )}
    </div>
  );
}
