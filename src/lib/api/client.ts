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

// Helper function to perform admin token refresh
export async function refreshAdminToken(): Promise<string | null> {
  try {
    const refreshToken = Cookies.get('admin_refresh_token');
    const { data } = await axios.post(
      `${API_BASE_URL}/admin/auth/refresh`,
      { refreshToken },
      { withCredentials: true }
    );

    const token = data.access_token || data.accessToken || data.admin_access_token;
    const rToken = data.refresh_token || data.refreshToken || data.admin_refresh_token;

    if (token) {
      Cookies.set('admin_access_token', token, { expires: 7, path: '/' });
      if (rToken) Cookies.set('admin_refresh_token', rToken, { expires: 30, path: '/' });
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return token;
    }
  } catch {
    // silent fallback
  }
  return null;
}

// Proactive background auto-refresh every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    refreshAdminToken();
  }, 10 * 60 * 1000);
}

// Response Interceptor: Auto-Refresh Admin Token on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/admin/auth/login') ||
      url.includes('/admin/auth/logout') ||
      url.includes('/admin/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      const newToken = await refreshAdminToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }

      // If refresh failed, clear cookies and redirect to login
      Cookies.remove('admin_access_token', { path: '/' });
      Cookies.remove('admin_refresh_token', { path: '/' });

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
