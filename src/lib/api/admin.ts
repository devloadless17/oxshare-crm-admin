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
  name: string;
  role: 'master_admin' | 'sub_admin';
  permissions: string[];
  roleId?: string;
  createdAt: string;
}

export interface RejectionReason {
  id: string;
  context: 'kyc' | 'withdrawal';
  label: string;
}

// None of these endpoints exist on the backend yet (docs/DECISIONS.md D-28).
// Calls fail honestly instead of returning fabricated data — pages render a
// BackendPending state on 404 so a mock is never mistaken for a feature (D-30).
export const adminApi = {
  async getPermissions(): Promise<Record<string, PermissionModule>> {
    const { data } = await apiClient.get('/admin/permissions');
    return data;
  },

  async getRoles(): Promise<Role[]> {
    const { data } = await apiClient.get<Role[]>('/admin/roles');
    return data;
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
    const { data } = await apiClient.get<AdminUser[]>('/admin/users');
    return data;
  },

  async getRejectionReasons(context: 'kyc' | 'withdrawal'): Promise<RejectionReason[]> {
    const { data } = await apiClient.get<RejectionReason[]>(`/admin/rejection-reasons?context=${context}`);
    return data;
  },
};
