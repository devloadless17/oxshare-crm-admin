'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserPlus, Key } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Role, AdminUser } from '@/lib/api/admin';
import { RoleCard } from '@/components/rbac/role-card';
import { RoleFormModal, RoleFormValues } from '@/components/rbac/role-form-modal';
import { AsyncBoundary } from '@/components/async-boundary';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { apiErrorMessage, useResource } from '@/hooks/use-resource';

// The single owner of roles and admin users. /roles used to be a second,
// strictly smaller copy of the Roles tab; it now redirects here.

export default function AdminSettingsPage() {
  const { admin } = useAdmin();
  const canManageRoles = hasPermission(admin, 'roles.manage');
  const canEditAdmins = hasPermission(admin, 'users.edit');
  const canInvite = hasPermission(admin, 'users.create');

  const [activeTab, setActiveTab] = React.useState<'roles' | 'admins'>('roles');

  // null = closed, 'create' = new role, Role = editing that role
  const [modal, setModal] = React.useState<'create' | Role | null>(null);

  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['settings', 'rbac'] });

  const query = useResource(['settings', 'rbac'], async () => {
    const [catalog, roles, adminUsers] = await Promise.all([
      api.admin.getPermissions(),
      api.admin.getRoles(),
      api.admin.getAdminUsers(),
    ]);
    return { catalog, roles, adminUsers };
  });

  const permissionsCatalog = query.data?.catalog ?? {};
  const roles = query.data?.roles ?? [];
  const adminUsers = query.data?.adminUsers ?? [];

  const saveRole = useMutation({
    mutationFn: (values: RoleFormValues) =>
      modal === 'create' ? api.admin.createRole(values) : api.admin.updateRole((modal as Role).id, values),
    onSuccess: async () => {
      setModal(null);
      await invalidate();
    },
  });

  const deleteRole = useMutation({
    mutationFn: (role: Role) => api.admin.deleteRole(role.id),
    onSuccess: invalidate,
  });

  const assignRole = useMutation({
    mutationFn: ({ user, roleId }: { user: AdminUser; roleId: string }) =>
      api.admin.updateAdminUser(user.id, { roleId }),
    onSuccess: invalidate,
  });

  const closeModal = () => {
    setModal(null);
    saveRole.reset();
  };

  const handleDeleteRole = (role: Role) => {
    if (!window.confirm(`Delete the role "${role.name}"? Admins must be reassigned first.`)) return;
    deleteRole.mutate(role);
  };

  const handleAssignRole = (user: AdminUser, roleId: string) => {
    if (!roleId || roleId === user.roleId) return;
    assignRole.mutate({ user, roleId });
  };

  // 409 when a role is still assigned; 403 for self-changes or over-grants.
  const banner = deleteRole.isError
    ? apiErrorMessage(deleteRole.error, 'Failed to delete the role.')
    : assignRole.isError
      ? apiErrorMessage(assignRole.error, 'Failed to change the admin\u2019s role.')
      : '';

  const deletingId = deleteRole.isPending ? deleteRole.variables?.id : null;
  const assigningId = assignRole.isPending ? assignRole.variables?.user.id : null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Settings & RBAC</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dynamic Role-Based Access Control, Permission Matrix & Admin User Management
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`h-9 px-4 rounded-lg text-xs font-semibold focus-outline ${
              activeTab === 'roles'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'border border-input bg-card text-foreground hover:bg-muted'
            }`}
          >
            Dynamic Roles ({roles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`h-9 px-4 rounded-lg text-xs font-semibold focus-outline ${
              activeTab === 'admins'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'border border-input bg-card text-foreground hover:bg-muted'
            }`}
          >
            Admin Users ({adminUsers.length})
          </button>
        </div>
      </div>

      {banner && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
          {banner}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label="Loading settings"
        endpoints={['GET /admin/permissions', 'GET /admin/roles', 'GET /admin/users']}
        onRetry={query.refetch}
        errorMessage="Failed to load roles and admin users."
      >
        {activeTab === 'roles' ? (
        /* Roles Tab */
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-xs">
            <div>
              <h2 className="text-base font-semibold">Configured System & Custom Roles</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permissions defined in permissions.json are mapped dynamically to custom roles.
              </p>
            </div>
            {canManageRoles && (
              <button
                type="button"
                onClick={() => { saveRole.reset(); setModal('create'); }}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover cursor-pointer focus-outline"
              >
                <Plus className="h-4 w-4" />
                Create Custom Role
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                canManage={canManageRoles}
                onEdit={(r) => { saveRole.reset(); setModal(r); }}
                onDelete={handleDeleteRole}
                deleting={deletingId === role.id}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Admins Tab */
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-xs">
            <div>
              <h2 className="text-base font-semibold">Admin Account Directory</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create and manage back-office administrator accounts with assigned RBAC roles.
              </p>
            </div>
            {canInvite && (
              <Link
                href="/invite"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover focus-outline"
              >
                <UserPlus className="h-4 w-4" />
                Invite Admin
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Administrator</th>
                  <th className="px-6 py-3">Email Address</th>
                  <th className="px-6 py-3">System Role</th>
                  <th className="px-6 py-3">Status</th>
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
                        {isSelf && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(you)</span>}
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
                              <SelectValue placeholder={user.roleId ? 'Change role…' : 'Custom permissions'} />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.filter((r) => !r.isSystem).map((r) => (
                                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
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
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </AsyncBoundary>

      {modal !== null && (
        <RoleFormModal
          title={modal === 'create' ? 'Create Dynamic RBAC Role' : `Edit Role — ${modal.name}`}
          initial={modal === 'create' ? undefined : modal}
          catalog={permissionsCatalog}
          busy={saveRole.isPending}
          error={saveRole.isError ? apiErrorMessage(saveRole.error, 'Failed to save the role. Please try again.') : ''}
          submitLabel={modal === 'create' ? 'Save Dynamic Role' : 'Save Changes'}
          onSubmit={(values) => saveRole.mutate(values)}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
