'use client';

import * as React from 'react';
import {
  ShieldCheck,
  Plus,
  UserPlus,
  Users,
  CheckSquare,
  Square,
  Lock,
  Mail,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  Key,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Role, PermissionModule, AdminUser } from '@/lib/api/admin';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = React.useState<'roles' | 'admins'>('roles');
  const [permissionsCatalog, setPermissionsCatalog] = React.useState<Record<string, PermissionModule>>({});
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [adminUsers, setAdminUsers] = React.useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Add Role State
  const [showAddRoleModal, setShowAddRoleModal] = React.useState(false);
  const [roleName, setRoleName] = React.useState('');
  const [roleDescription, setRoleDescription] = React.useState('');
  const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);

  // Add Admin State
  const [showAddAdminModal, setShowAddAdminModal] = React.useState(false);
  const [adminFirstName, setAdminFirstName] = React.useState('');
  const [adminLastName, setAdminLastName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [adminRoleId, setAdminRoleId] = React.useState('');
  const [adminMessage, setAdminMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [perms, rList, uList] = await Promise.all([
          api.admin.getPermissions(),
          api.admin.getRoles(),
          api.admin.getAdminUsers(),
        ]);
        setPermissionsCatalog(perms);
        setRoles(rList);
        setAdminUsers(uList);
      } catch (err) {
        console.error('Failed to load settings data', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const togglePermission = (permKey: string) => {
    if (selectedPermissions.includes(permKey)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== permKey));
    } else {
      setSelectedPermissions([...selectedPermissions, permKey]);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName) return;

    try {
      const newRole = await api.admin.createRole({
        name: roleName,
        description: roleDescription,
        permissions: selectedPermissions,
      });

      setRoles([...roles, newRole]);
      setShowAddRoleModal(false);
      setRoleName('');
      setRoleDescription('');
      setSelectedPermissions([]);
    } catch {
      // Local fallback insert
      const fallbackRole: Role = {
        id: Date.now().toString(),
        name: roleName,
        description: roleDescription,
        permissions: selectedPermissions,
        isSystem: false,
      };
      setRoles([...roles, fallbackRole]);
      setShowAddRoleModal(false);
      setRoleName('');
      setRoleDescription('');
      setSelectedPermissions([]);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminMessage(null);

    try {
      const res = await api.admin.addAdminUser({
        email: adminEmail,
        password: adminPassword,
        firstName: adminFirstName,
        lastName: adminLastName,
        roleId: adminRoleId || undefined,
      });

      setAdminUsers([...adminUsers, {
        id: Date.now().toString(),
        email: adminEmail,
        firstName: adminFirstName,
        lastName: adminLastName,
        role: 'ADMIN',
        roleId: adminRoleId,
      }]);

      setAdminMessage('Admin user created successfully!');
      setTimeout(() => {
        setShowAddAdminModal(false);
        setAdminEmail('');
        setAdminPassword('');
        setAdminFirstName('');
        setAdminLastName('');
        setAdminMessage(null);
      }, 1000);
    } catch (err: any) {
      setAdminMessage(err?.response?.data?.message || 'Failed to create admin user.');
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
            className={`h-9 px-4 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'roles'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'border border-input bg-card text-foreground hover:bg-muted'
            }`}
          >
            Dynamic Roles ({roles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`h-9 px-4 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'admins'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'border border-input bg-card text-foreground hover:bg-muted'
            }`}
          >
            Admin Users ({adminUsers.length})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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
            <button
              type="button"
              onClick={() => setShowAddRoleModal(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Create Custom Role
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">{role.name}</h3>
                      {role.isSystem && (
                        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500 border border-blue-500/20">
                          System Role
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{role.description || 'No description provided'}</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-blue-500" />
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
            <button
              type="button"
              onClick={() => setShowAddAdminModal(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition-colors cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Add New Admin User
            </button>
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
                {adminUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <Key className="h-3 w-3" />
                        {roles.find((r) => r.id === user.roleId)?.name || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-500">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                className="text-muted-foreground hover:text-foreground"
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
                            <div
                              key={p.key}
                              onClick={() => togglePermission(p.key)}
                              className={`flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-all ${
                                isChecked
                                  ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              {isChecked ? (
                                <CheckSquare className="h-4 w-4 text-blue-500 shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 shrink-0" />
                              )}
                              <div>
                                <p className="font-semibold text-[11px] leading-tight text-foreground">{p.label}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{p.key}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500"
                >
                  Save Dynamic Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold">Add New Admin User</h3>

            {adminMessage && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-500">
                {adminMessage}
              </div>
            )}

            <form onSubmit={handleAddAdmin} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold">First Name</label>
                  <input
                    type="text"
                    required
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    placeholder="Sarah"
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                  />
                </div>
                <div>
                  <label className="font-semibold">Last Name</label>
                  <input
                    type="text"
                    required
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    placeholder="Connor"
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold">Email Address</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@oxshare.com"
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                />
              </div>

              <div>
                <label className="font-semibold">Initial Password</label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                />
              </div>

              <div>
                <label className="font-semibold">Assign RBAC Role</label>
                <select
                  value={adminRoleId}
                  onChange={(e) => setAdminRoleId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                >
                  <option value="">Select Role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.permissions.length} permissions)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500"
                >
                  Create Admin User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
