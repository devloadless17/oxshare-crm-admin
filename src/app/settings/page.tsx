'use client';

import * as React from 'react';
import { Plus, UserPlus, Loader2, Key } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Role, PermissionModule, AdminUser } from '@/lib/api/admin';
import { BackendPending } from '@/components/backend-pending';
import { RoleCard } from '@/components/rbac/role-card';
import { RoleFormModal, RoleFormValues } from '@/components/rbac/role-form-modal';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const isNotFound = (e: unknown) =>
  (e as { response?: { status?: number } })?.response?.status === 404;

const apiMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export default function AdminSettingsPage() {
  const { admin } = useAdmin();
  const canManageRoles = hasPermission(admin, 'roles.manage');
  const canEditAdmins = hasPermission(admin, 'users.edit');
  const canInvite = hasPermission(admin, 'users.create');

  const [activeTab, setActiveTab] = React.useState<'roles' | 'admins'>('roles');
  const [permissionsCatalog, setPermissionsCatalog] = React.useState<Record<string, PermissionModule>>({});
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [adminUsers, setAdminUsers] = React.useState<AdminUser[]>([]);
  const [loadState, setLoadState] = React.useState<LoadState>('loading');

  // null = closed, 'create' = new role, Role = editing that role
  const [modal, setModal] = React.useState<'create' | Role | null>(null);
  const [formError, setFormError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState('');

  // Per-row role reassignment on the Admins tab
  const [assigningId, setAssigningId] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoadState('loading');
    try {
      const [perms, rList, uList] = await Promise.all([
        api.admin.getPermissions(),
        api.admin.getRoles(),
        api.admin.getAdminUsers(),
      ]);
      setPermissionsCatalog(perms);
      setRoles(rList);
      setAdminUsers(uList);
      setLoadState('ready');
    } catch (err) {
      setLoadState(isNotFound(err) ? 'unavailable' : 'error');
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const closeModal = () => { setModal(null); setFormError(''); };

  const handleSubmitRole = async (values: RoleFormValues) => {
    setSaving(true);
    setFormError('');
    try {
      if (modal === 'create') {
        const created = await api.admin.createRole(values);
        setRoles((prev) => [...prev, created]);
      } else if (modal) {
        const updated = await api.admin.updateRole(modal.id, values);
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      closeModal();
    } catch (err) {
      setFormError(apiMessage(err, 'Failed to save the role. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!window.confirm(`Delete the role "${role.name}"? Admins must be reassigned first.`)) return;
    setDeletingId(role.id);
    setBanner('');
    try {
      await api.admin.deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch (err) {
      // 409 when the role is still assigned to admins or pending invites
      setBanner(apiMessage(err, 'Failed to delete the role.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleAssignRole = async (user: AdminUser, roleId: string) => {
    if (!roleId || roleId === user.roleId) return;
    setAssigningId(user.id);
    setBanner('');
    try {
      const updated = await api.admin.updateAdminUser(user.id, { roleId });
      setAdminUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      // 403 for self-changes or grants beyond the actor's own permissions
      setBanner(apiMessage(err, 'Failed to change the admin’s role.'));
    } finally {
      setAssigningId(null);
    }
  };

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

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-link" />
          <span className="sr-only">Loading settings</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending endpoints={['GET /admin/permissions', 'GET /admin/roles', 'GET /admin/users']} />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load settings. Check your connection and try again.</p>
          <button
            type="button"
            onClick={loadData}
            className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
          >
            Retry
          </button>
        </div>
      ) : activeTab === 'roles' ? (
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
                onClick={() => setModal('create')}
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
                onEdit={(r) => { setModal(r); setFormError(''); }}
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
                          <select
                            value={user.roleId ?? ''}
                            onChange={(e) => handleAssignRole(user, e.target.value)}
                            disabled={assigningId === user.id}
                            aria-label={`Role for ${user.name}`}
                            className="h-8 rounded-lg border border-input bg-background px-2 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
                          >
                            <option value="" disabled>
                              {user.roleId ? 'Change role…' : 'Custom permissions'}
                            </option>
                            {roles.filter((r) => !r.isSystem).map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
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

      {modal !== null && (
        <RoleFormModal
          title={modal === 'create' ? 'Create Dynamic RBAC Role' : `Edit Role — ${modal.name}`}
          initial={modal === 'create' ? undefined : modal}
          catalog={permissionsCatalog}
          busy={saving}
          error={formError}
          submitLabel={modal === 'create' ? 'Save Dynamic Role' : 'Save Changes'}
          onSubmit={handleSubmitRole}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
