import { apiClient } from './client';
import Cookies from 'js-cookie';

export interface AdminLoginDto {
  email: string;
  password: string;
}

export const authApi = {
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post('/admin/auth/login', dto);
    const token = data.accessToken || data.access_token;
    if (token) {
      Cookies.set('admin_access_token', token, { expires: 1, path: '/' });
    }
    const refresh = data.refreshToken || data.refresh_token;
    if (refresh) {
      Cookies.set('admin_refresh_token', refresh, { expires: 7, path: '/' });
    }
    return data;
  },

  logout() {
    Cookies.remove('admin_access_token', { path: '/' });
    Cookies.remove('admin_refresh_token', { path: '/' });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};
