import { apiClient, clearAdminSession, startProactiveRefresh } from './client';
import type { components } from './types.gen';

export interface AdminLoginDto {
  email: string;
  password: string;
}

/**
 * `POST /admin/auth/login`.
 *
 * The `admin` half is the generated schema, so a change to the sanitized admin
 * shape is a compile error here. The two token fields are hand-declared because
 * the endpoint carries no `@ApiOkResponse` — once the backend adds an
 * `AdminAuthResponseDto`, replace this whole interface with an alias.
 *
 * Note the casing: this endpoint returns camelCase `accessToken`, while the
 * client portal's `/auth/login` returns snake_case `access_token`. That
 * divergence is known, frozen, and deliberately not "fixed" — renaming a live
 * auth contract across three repos risks logging out every session for no
 * functional gain (docs/API-CONTRACTS.md).
 */
export interface AdminLoginResponse {
  admin: components['schemas']['AdminProfileDto'];
  accessToken?: string;
  refreshToken?: string;
}

export const authApi = {
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post<AdminLoginResponse>('/admin/auth/login', dto);
    // Nothing to store: the server sets the session as httpOnly cookies and the
    // browser installs them from this very response (PLATFORM-CONVENTIONS R-3.2).
    // This used to write them from `data.accessToken`, which is why the response
    // still carries the tokens at all — they are now unused by the app and should
    // come out of the payload the next time that DTO is touched.
    startProactiveRefresh();
    return data;
  },

  /**
   * The only logout. Previously there were two halves that never met: this
   * helper cleared cookies without telling the server (so the refresh token
   * stayed valid for 30 days), and the auth context called the API without
   * clearing cookies (so proxy.ts still saw a session and bounced the admin
   * straight back in).
   */
  async logout() {
    try {
      await apiClient.post('/admin/auth/logout');
    } finally {
      clearAdminSession();
    }
  },
};
