import { apiClient } from './client';
import type { components } from './types.gen';

// Types are ALIASES of the schemas generated from the backend's Swagger
// (npm run gen:api-types, with the backend running). Never hand-write an
// interface for an API response — regenerate instead; drift then becomes
// a compile error (docs/API-CONTRACTS.md Part C).
export type PermissionItem = components['schemas']['PermissionItemDto'];
export type PermissionModule = components['schemas']['PermissionModuleDto'];
export type Role = components['schemas']['RoleResponseDto'];
export type AdminUser = components['schemas']['AdminProfileDto'];
export type RejectionReason = components['schemas']['RejectionReasonResponseDto'];
export type KycSubmission = components['schemas']['KycSubmissionDto'];
export type KycListResponse = components['schemas']['KycListResponseDto'];
export type ClientRow = components['schemas']['ClientRowDto'];
export type ClientListResponse = components['schemas']['ClientListResponseDto'];
export type AuditEntry = components['schemas']['AuditEntryDto'];
export type AuditListResponse = components['schemas']['AuditListResponseDto'];

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
    const { data } = await apiClient.post<Role>('/admin/roles', dto);
    return data;
  },

  async updateRole(id: string, dto: { name?: string; description?: string; permissions?: string[] }) {
    const { data } = await apiClient.put<Role>(`/admin/roles/${id}`, dto);
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
