import { apiClient } from './client';
import Cookies from 'js-cookie';

export interface AdminLoginDto {
  email: string;
  password: string;
}

export const authApi = {
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post('/identity/login', { ...dto, role: 'ADMIN' });
    if (data.access_token) {
      Cookies.set('admin_access_token', data.access_token, { expires: 1 / 96, path: '/' });
      if (data.refresh_token) {
        Cookies.set('admin_refresh_token', data.refresh_token, { expires: 30, path: '/' });
      }
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
