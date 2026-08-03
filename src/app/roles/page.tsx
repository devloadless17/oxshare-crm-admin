'use client';

import * as React from 'react';
import {
  ShieldCheck,
  Plus,
  CheckSquare,
  Square,
  Loader2,
  Key,
  Shield,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Role, PermissionModule } from '@/lib/api/admin';
import { BackendPending } from '@/components/backend-pending';

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const isNotFound = (e: unknown) =>
  (e as { response?: { status?: number } })?.response?.status === 404;

export default function AdminRolesPage() {
  const [permissionsCatalog, setPermissionsCatalog] = React.useState<Record<string, PermissionModule>>({});
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [loadState, setLoadState] = React.useState<LoadState>('loading');

  // Add Role State
  const [showAddRoleModal, setShowAddRoleModal] = React.useState(false);
  const [roleName, setRoleName] = React.useState('');
  const [roleDescription, setRoleDescription] = React.useState('');
  const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);
  const [createError, setCreateError] = React.useState('');
  const [creating, setCreating] = React.useState(false);

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

  const togglePermission = (permKey: string) => {
    if (selectedPermissions.includes(permKey)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== permKey));
    } else {
      setSelectedPermissions([...selectedPermissions, permKey]);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const newRole = await api.admin.createRole({
        name: roleName.trim(),
        description: roleDescription.trim() || undefined,
        permissions: selectedPermissions,
      });
      setRoles([...roles, newRole]);
      setShowAddRoleModal(false);
      setRoleName('');
      setRoleDescription('');
      setSelectedPermissions([]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCreateError(
        isNotFound(err)
          ? 'The backend endpoint for creating roles (POST /admin/roles) is not implemented yet.'
          : msg ?? 'Failed to create the role. Please try again.'
      );
    } finally {
      setCreating(false);
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

        <button
          type="button"
          onClick={() => setShowAddRoleModal(true)}
          disabled={loadState !== 'ready'}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
        >
          <Plus className="h-4 w-4" />
          Create Custom Role
        </button>
      </div>

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
            <div key={role.id} className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">{role.name}</h3>
                    {role.isSystem && (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link border border-primary/20">
                        System Role
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{role.description || 'No description provided'}</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-link shrink-0" />
              </div>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Assigned Permissions ({role.permissions.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((p) => (
                    <span key={p} className="rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-foreground border border-border/80">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold">Create Dynamic RBAC Role</h3>
              <button
                type="button"
                onClick={() => setShowAddRoleModal(false)}
                className="text-muted-foreground hover:text-foreground focus-outline rounded-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold">Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Financial Auditor"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                  />
                </div>
                <div>
                  <label className="font-semibold">Description</label>
                  <input
                    type="text"
                    placeholder="Short summary of access scope"
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                  />
                </div>
              </div>

              {/* Checkbox Matrix from permissions.json */}
              <div className="space-y-4 pt-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Permission Matrix (Configured via permissions.json)
                </h4>

                <div className="space-y-4">
                  {Object.entries(permissionsCatalog).map(([modKey, mod]) => (
                    <div key={modKey} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-xs">{mod.moduleName}</span>
                        <span className="text-[11px] text-muted-foreground">{mod.description}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        {mod.permissions.map((p) => {
                          const isChecked = selectedPermissions.includes(p.key);
                          return (
                            <button
                              type="button"
                              key={p.key}
                              onClick={() => togglePermission(p.key)}
                              aria-pressed={isChecked}
                              className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left cursor-pointer focus-outline ${
                                isChecked
                                  ? 'border-ring bg-primary/10 text-link'
                                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              {isChecked ? (
                                <CheckSquare className="h-4 w-4 text-link shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 shrink-0" />
                              )}
                              <div>
                                <p className="font-semibold text-[11px] leading-tight text-foreground">{p.label}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{p.key}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {createError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  disabled={creating}
                  className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  aria-busy={creating}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
                >
                  {creating ? 'Saving...' : 'Save Dynamic Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
