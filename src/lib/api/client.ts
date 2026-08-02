import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

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

// Response Interceptor: Auto-Refresh Access Token using 30-day Refresh Token on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
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
