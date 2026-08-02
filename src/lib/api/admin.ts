import { apiClient } from './client';

export interface PermissionItem {
  key: string;
  label: string;
}

export interface PermissionModule {
  moduleName: string;
  description: string;
  permissions: PermissionItem[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  roleId?: string;
}

export const adminApi = {
  async getPermissions(): Promise<Record<string, PermissionModule>> {
    try {
      const { data } = await apiClient.get('/admin/permissions');
      return data;
    } catch {
      // Fallback Catalog
      return {
        kyc: {
          moduleName: 'KYC & Verification',
          description: 'Dynamic KYC fields & verification',
          permissions: [
            { key: 'kyc.view', label: 'View KYC Fields & Submissions' },
            { key: 'kyc.create', label: 'Create Dynamic KYC Fields' },
            { key: 'kyc.edit', label: 'Edit Dynamic KYC Fields' },
            { key: 'kyc.delete', label: 'Delete Dynamic KYC Fields' },
            { key: 'kyc.review', label: 'Approve / Reject Submissions' },
          ],
        },
        users: {
          moduleName: 'User & Admin Management',
          description: 'Client & Admin management',
          permissions: [
            { key: 'users.view', label: 'View Clients & Admins List' },
            { key: 'users.create', label: 'Add New Admins' },
            { key: 'users.edit', label: 'Edit User Profiles & Roles' },
            { key: 'users.suspend', label: 'Suspend / Activate Accounts' },
          ],
        },
        roles: {
          moduleName: 'Role & Permissions Config',
          description: 'Manage dynamic RBAC roles',
          permissions: [
            { key: 'roles.view', label: 'View Roles & Permission Matrix' },
            { key: 'roles.manage', label: 'Create, Edit & Delete Custom Roles' },
          ],
        },
      };
    }
  },

  async getRoles(): Promise<Role[]> {
    try {
      const { data } = await apiClient.get<Role[]>('/admin/roles');
      return data;
    } catch {
      return [
        { id: 'r1', name: 'Super Admin', description: 'Full access to all system modules', permissions: ['kyc.view', 'kyc.create', 'kyc.edit', 'kyc.delete', 'kyc.review', 'users.view', 'users.create', 'roles.manage'], isSystem: true },
        { id: 'r2', name: 'Compliance Officer', description: 'Manage KYC fields & review documents', permissions: ['kyc.view', 'kyc.create', 'kyc.edit', 'kyc.review', 'users.view'], isSystem: false },
      ];
    }
  },

  async createRole(dto: { name: string; description?: string; permissions: string[] }) {
    const { data } = await apiClient.post('/admin/roles', dto);
    return data;
  },

  async updateRole(id: string, dto: { name?: string; description?: string; permissions?: string[] }) {
    const { data } = await apiClient.put(`/admin/roles/${id}`, dto);
    return data;
  },

  async getAdminUsers(): Promise<AdminUser[]> {
    try {
      const { data } = await apiClient.get<AdminUser[]>('/admin/users');
      return data;
    } catch {
      return [
        { id: 'a1', email: 'admin@bbcorp.com', firstName: 'Master', lastName: 'Admin', role: 'SUPER_ADMIN' },
      ];
    }
  },

  async addAdminUser(dto: { email: string; password: string; firstName: string; lastName: string; roleId?: string }) {
    const { data } = await apiClient.post('/admin/users', dto);
    return data;
  },
};
