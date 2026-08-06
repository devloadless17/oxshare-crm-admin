'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Role } from '@/lib/api/admin';
import { RoleCard } from '@/components/rbac/role-card';
import { RoleFormModal, RoleFormValues } from '@/components/rbac/role-form-modal';
import { AsyncBoundary } from '@/components/async-boundary';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * RBAC-01/02 — what a role may do.
 *
 * This was the "Roles" tab of /settings, which also carried the admin directory
 * and the RBAC-08 network controls. Three unrelated jobs behind one tab strip
 * meant every one of them waited on a single query that fetched all three
 * datasets, so opening the page to read a role also pulled the admin list.
 *
 * The split is along the question each page answers:
 *   /roles        what a role may do          (here)
 *   /admin-users  who holds which role
 *   /settings     what protects the API
 *
 * This page fetches only the permission catalog and the roles.
 */
export default function RolesPage() {
  const { admin } = useAdmin();
  const canManageRoles = hasPermission(admin, 'roles.manage');
  const canViewAdmins = hasPermission(admin, 'users.view');

  // null = closed, 'create' = new role, Role = editing that role
  const [modal, setModal] = React.useState<'create' | Role | null>(null);

  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const query = useResource(['roles'], async () => {
    // Both VOCABULARIES, loaded together: a role editor that opened with the
    // permission matrix but no field catalog would offer half of what a role
    // decides, which is worse than making the operator wait for both (R-4.5).
    const [catalog, roles, fieldCatalog] = await Promise.all([
      api.admin.getPermissions(),
      api.admin.getRoles(),
      api.admin.getClientFields(),
    ]);
    return { catalog, roles, fieldCatalog };
  });

  const permissionsCatalog = query.data?.catalog ?? {};
  const roles = query.data?.roles ?? [];
  const fieldCatalog = query.data?.fieldCatalog ?? {};

  const saveRole = useMutation({
    mutationFn: (values: RoleFormValues) =>
      modal === 'create'
        ? api.admin.createRole(values)
        : api.admin.updateRole((modal as Role).id, values),
    onSuccess: async () => {
      setModal(null);
      await invalidate();
    },
  });

  const deleteRole = useMutation({
    mutationFn: (role: Role) => api.admin.deleteRole(role.id),
    // An admin's effective permissions change when the role they hold is
    // deleted, so the directory's cache is stale from here too.
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const closeModal = () => {
    setModal(null);
    saveRole.reset();
  };

  const handleDeleteRole = (role: Role) => {
    if (!window.confirm(`Delete the role "${role.name}"? Admins must be reassigned first.`)) return;
    deleteRole.mutate(role);
  };

  // 409 when a role is still assigned; 403 for over-grants.
  const banner = deleteRole.isError
    ? apiErrorMessage(deleteRole.error, 'Failed to delete the role.')
    : '';

  const deletingId = deleteRole.isPending ? deleteRole.variables?.id : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('roles.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('roles.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* A role only means something once someone holds it, so the directory
              is one click away rather than a hunt through the sidebar. */}
          {canViewAdmins && (
            <Link
              href="/admin-users"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted focus-outline"
            >
              <Users className="h-4 w-4" />
              {t('nav.adminUsers')}
            </Link>
          )}
          {canManageRoles && (
            <button
              type="button"
              onClick={() => {
                saveRole.reset();
                setModal('create');
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover cursor-pointer focus-outline"
            >
              <Plus className="h-4 w-4" />
              {t('settings.createRole')}
            </button>
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
        label="Loading roles"
        endpoints={['GET /admin/permissions', 'GET /admin/roles']}
        onRetry={query.refetch}
        errorMessage="Failed to load roles."
        error={query.error}
      >
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">{t('settings.rolesTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.rolesHint')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                canManage={canManageRoles}
                onEdit={(r) => {
                  saveRole.reset();
                  setModal(r);
                }}
                onDelete={handleDeleteRole}
                deleting={deletingId === role.id}
              />
            ))}
          </div>
        </div>
      </AsyncBoundary>

      {modal !== null && (
        <RoleFormModal
          title={modal === 'create' ? 'Create Dynamic RBAC Role' : `Edit Role — ${modal.name}`}
          initial={modal === 'create' ? undefined : modal}
          catalog={permissionsCatalog}
          fieldCatalog={fieldCatalog}
          busy={saveRole.isPending}
          error={
            saveRole.isError
              ? apiErrorMessage(saveRole.error, 'Failed to save the role. Please try again.')
              : ''
          }
          submitLabel={modal === 'create' ? 'Save Dynamic Role' : 'Save Changes'}
          onSubmit={(values) => saveRole.mutate(values)}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
