import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Admin 15-minute Access Token
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('admin_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Auto-Refresh Access Token on 401 (excluding auth endpoints)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/identity/login') ||
      url.includes('/identity/register') ||
      url.includes('/identity/verify-email') ||
      url.includes('/identity/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      const refreshToken = Cookies.get('admin_refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/identity/refresh`, {
            refreshToken,
          });

          if (data.access_token) {
            Cookies.set('admin_access_token', data.access_token, { expires: 1 / 96, path: '/' });
            originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
            return apiClient(originalRequest);
          }
        } catch (refreshErr) {
          Cookies.remove('admin_access_token', { path: '/' });
          Cookies.remove('admin_refresh_token', { path: '/' });
        }
      }
    }

    return Promise.reject(error);
  },
);
