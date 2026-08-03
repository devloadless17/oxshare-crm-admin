'use client';

import * as React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Role, PermissionModule } from '@/lib/api/admin';
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

export default function AdminRolesPage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'roles.manage');

  const [permissionsCatalog, setPermissionsCatalog] = React.useState<Record<string, PermissionModule>>({});
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [loadState, setLoadState] = React.useState<LoadState>('loading');

  // null = closed, 'create' = new role, Role = editing that role
  const [modal, setModal] = React.useState<'create' | Role | null>(null);
  const [formError, setFormError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState('');

  const loadData = React.useCallback(async () => {
    setLoadState('loading');
    try {
      const [perms, rList] = await Promise.all([
        api.admin.getPermissions(),
        api.admin.getRoles(),
      ]);
      setPermissionsCatalog(perms);
      setRoles(rList);
      setLoadState('ready');
    } catch (err) {
      setLoadState(isNotFound(err) ? 'unavailable' : 'error');
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const closeModal = () => { setModal(null); setFormError(''); };

  const handleSubmit = async (values: RoleFormValues) => {
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

  const handleDelete = async (role: Role) => {
    if (!window.confirm(`Delete the role "${role.name}"? Admins must be reassigned first.`)) return;
    setDeletingId(role.id);
    setDeleteError('');
    try {
      await api.admin.deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch (err) {
      // 409 when the role is still assigned to admins or pending invites
      setDeleteError(apiMessage(err, 'Failed to delete the role.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dynamic Role-Based Access Control (RBAC) & permissions catalog driven by permissions.json
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setModal('create')}
            disabled={loadState !== 'ready'}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
          >
            <Plus className="h-4 w-4" />
            Create Custom Role
          </button>
        )}
      </div>

      {deleteError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
          {deleteError}
        </div>
      )}

      {loadState === 'loading' ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-link" />
          <span className="sr-only">Loading roles</span>
        </div>
      ) : loadState === 'unavailable' ? (
        <BackendPending endpoints={['GET /admin/permissions', 'GET /admin/roles', 'POST /admin/roles']} />
      ) : loadState === 'error' ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
          <p className="text-sm text-muted-foreground">Failed to load roles. Check your connection and try again.</p>
          <button
            type="button"
            onClick={loadData}
            className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              canManage={canManage}
              onEdit={(r) => { setModal(r); setFormError(''); }}
              onDelete={handleDelete}
              deleting={deletingId === role.id}
            />
          ))}
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
          onSubmit={handleSubmit}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
