import { apiClient, clearAdminSession, startProactiveRefresh } from './client';
import Cookies from 'js-cookie';

export interface AdminLoginDto {
  email: string;
  password: string;
}

export const authApi = {
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post('/admin/auth/login', dto);
    if (data.accessToken) {
      Cookies.set('admin_access_token', data.accessToken, { expires: 1 / 3, path: '/', sameSite: 'lax' });
    }
    if (data.refreshToken) {
      Cookies.set('admin_refresh_token', data.refreshToken, { expires: 30, path: '/', sameSite: 'lax' });
    }
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
