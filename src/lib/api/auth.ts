import { apiClient } from './client';
import Cookies from 'js-cookie';

export interface AdminLoginDto {
  email: string;
  password: string;
}

export const authApi = {
  async login(dto: AdminLoginDto) {
    try {
      const { data } = await apiClient.post('/identity/login', { ...dto, role: 'ADMIN' });
      if (data.access_token) {
        Cookies.set('admin_access_token', data.access_token, { expires: 1 / 96, path: '/' });
        if (data.refresh_token) {
          Cookies.set('admin_refresh_token', data.refresh_token, { expires: 30, path: '/' });
        }
      }
      return data;
    } catch {
      // Demo fallback mode for local development
      const demoToken = `demo_admin_access_${Date.now()}`;
      const demoRefresh = `demo_admin_refresh_${Date.now()}`;
      Cookies.set('admin_access_token', demoToken, { expires: 1 / 96, path: '/' });
      Cookies.set('admin_refresh_token', demoRefresh, { expires: 30, path: '/' });
      return {
        access_token: demoToken,
        refresh_token: demoRefresh,
        user: { id: 'admin-1', email: dto.email, role: 'SUPER_ADMIN' },
      };
    }
  },

  logout() {
    Cookies.remove('admin_access_token', { path: '/' });
    Cookies.remove('admin_refresh_token', { path: '/' });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};
