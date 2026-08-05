import { apiClient } from './client';
import type { components } from './types.gen';

// Types are ALIASES of the schemas generated from the backend's Swagger
// (npm run gen:api-types, with the backend running). Never hand-write an
// interface for an API request OR response — regenerate instead; drift then
// becomes a compile error (docs/API-CONTRACTS.md Part C).
export type PermissionItem = components['schemas']['PermissionItemDto'];
export type PermissionModule = components['schemas']['PermissionModuleDto'];
export type Role = components['schemas']['RoleResponseDto'];
export type AdminUser = components['schemas']['AdminProfileDto'];
export type RejectionReason = components['schemas']['RejectionReasonResponseDto'];
export type IpAllowlistStatus = components['schemas']['IpAllowlistStatusDto'];
export type IpAllowlistRule = components['schemas']['IpAllowlistRuleDto'];
export type KycSubmission = components['schemas']['KycSubmissionDto'];
export type KycListResponse = components['schemas']['KycListResponseDto'];
export type ClientRow = components['schemas']['ClientRowDto'];
export type ClientListResponse = components['schemas']['ClientListResponseDto'];
export type AuditEntry = components['schemas']['AuditEntryDto'];
export type AuditListResponse = components['schemas']['AuditListResponseDto'];
export type WithdrawalRow = components['schemas']['WithdrawalRowDto'];
export type WithdrawalListResponse = components['schemas']['WithdrawalListResponseDto'];
export type LedgerEntry = components['schemas']['LedgerEntryDto'];
export type LedgerListResponse = components['schemas']['LedgerListResponseDto'];
export type IbProgram = components['schemas']['IbProgramDto'];

// Request bodies, aliased too. These were hand-written until the backend moved
// its inline controller DTOs into dto/ files with @ApiProperty — before that they
// generated as `Record<string, never>` and there was nothing to alias, so the
// "never hand-write an interface" rule above only covered responses in practice.
export type CreateRoleRequest = components['schemas']['RoleDto'];
export type UpdateRoleRequest = components['schemas']['UpdateRoleDto'];
export type UpdateAdminRequest = components['schemas']['UpdateAdminDto'];

/**
 * One operator-controlled security control — FR-CORE-08's OTP is the first.
 *
 * Aliased from the generated schema, never hand-written (R-1.1): if the backend
 * renames `enabled`, this becomes a compile error rather than a toggle that
 * silently always reads false.
 */
export type SecuritySwitch = components['schemas']['SecuritySwitchDto'];

export const adminApi = {
  /** Master admin only — the API answers 403 for anyone else. */
  async getSecuritySettings(): Promise<SecuritySwitch[]> {
    const { data } = await apiClient.get<SecuritySwitch[]>('/admin/security-settings');
    return data;
  },

  async setSecuritySwitch(key: string, enabled: boolean): Promise<SecuritySwitch> {
    const { data } = await apiClient.put<SecuritySwitch>(`/admin/security-settings/${key}`, {
      enabled,
    });
    return data;
  },

  async getPermissions(): Promise<Record<string, PermissionModule>> {
    const { data } = await apiClient.get<Record<string, PermissionModule>>('/admin/permissions');
    return data;
  },

  async getRoles(): Promise<Role[]> {
    const { data } = await apiClient.get<Role[]>('/admin/roles');
    return data;
  },

  async createRole(dto: CreateRoleRequest) {
    const { data } = await apiClient.post<Role>('/admin/roles', dto);
    return data;
  },

  async updateRole(id: string, dto: UpdateRoleRequest) {
    const { data } = await apiClient.put<Role>(`/admin/roles/${id}`, dto);
    return data;
  },

  async deleteRole(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/roles/${id}`);
    return data;
  },

  async getAdminUsers(): Promise<AdminUser[]> {
    const { data } = await apiClient.get<AdminUser[]>('/admin/users');
    return data;
  },

  async updateAdminUser(id: string, dto: UpdateAdminRequest) {
    const { data } = await apiClient.patch<AdminUser>(`/admin/users/${id}`, dto);
    return data;
  },

  // RBAC-08 — the admin IP allowlist.
  async getIpAllowlist(): Promise<IpAllowlistStatus> {
    const { data } = await apiClient.get<IpAllowlistStatus>('/admin/ip-allowlist');
    return data;
  },

  async addIpAllowlistRule(dto: { cidr: string; label: string }): Promise<IpAllowlistStatus> {
    const { data } = await apiClient.post<IpAllowlistStatus>('/admin/ip-allowlist', dto);
    return data;
  },

  async removeIpAllowlistRule(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/ip-allowlist/${id}`);
    return data;
  },

  async getRejectionReasons(context: 'kyc' | 'withdrawal'): Promise<RejectionReason[]> {
    const { data } = await apiClient.get<RejectionReason[]>(
      `/admin/rejection-reasons?context=${context}`,
    );
    return data;
  },
};
