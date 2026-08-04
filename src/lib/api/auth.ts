import { apiClient, clearAdminSession, startProactiveRefresh } from './client';
import type { components } from './types.gen';

export interface AdminLoginDto {
  email: string;
  password: string;
}

/**
 * `POST /admin/auth/login`.
 *
 * A straight alias now: the endpoint carries a response DTO, so a change to the
 * shape is a compile error here rather than a runtime surprise.
 *
 * There are no token fields any more, deliberately. The session is set as
 * httpOnly cookies on the same response, and returning the tokens in the body
 * as well handed JavaScript the exact credential that flag exists to keep away
 * from it. While they existed, an older build of this app kept reading them and
 * writing its own JS-readable `admin_access_token` cookie — so clearing the
 * browser and logging in again recreated the exposure the migration removed.
 */
export type AdminLoginResponse = components['schemas']['AdminLoginResponseDto'];

export const authApi = {
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post<AdminLoginResponse>('/admin/auth/login', dto);
    // Nothing to store: the server sets the session as httpOnly cookies and the
    // browser installs them from this very response (PLATFORM-CONVENTIONS R-3.2).
    // The response carries no tokens at all now — see the type above.
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
