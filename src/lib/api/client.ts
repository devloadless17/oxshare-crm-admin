import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Admin Access Token
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('admin_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Auto-Redirect on 401 Unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/admin/auth/login') ||
      url.includes('/admin/auth/logout') ||
      url.includes('/admin/auth/me');

    if (error.response?.status === 401 && !isAuthEndpoint) {
      Cookies.remove('admin_access_token', { path: '/' });
      Cookies.remove('admin_refresh_token', { path: '/' });

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
