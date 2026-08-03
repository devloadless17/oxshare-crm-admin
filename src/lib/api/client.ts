import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL =
  typeof window !== 'undefined' ? '/api' : process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// The backend AdminGuard reads the cookie, not this header (cookies travel via
// withCredentials). The header is kept only for tooling that replays requests.
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('admin_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function clearAdminSession(): void {
  Cookies.remove('admin_access_token', { path: '/' });
  Cookies.remove('admin_refresh_token', { path: '/' });
  stopProactiveRefresh();
}

/**
 * Single-flight refresh.
 *
 * Rotation invalidates the presented refresh token, so N concurrent 401s
 * firing N rotations meant the 2nd..Nth all presented an already-rotated token,
 * failed, and logged the admin out mid-session. Every caller now awaits the one
 * in-flight promise instead.
 */
let inFlight: Promise<string | null> | null = null;

export function refreshAdminToken(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const refreshToken = Cookies.get('admin_refresh_token');
      const { data } = await axios.post<{ accessToken?: string; refreshToken?: string }>(
        `${API_BASE_URL}/admin/auth/refresh`,
        { refreshToken },
        { withCredentials: true },
      );
      if (data.accessToken) {
        Cookies.set('admin_access_token', data.accessToken, { expires: 1 / 3, path: '/', sameSite: 'lax' });
        if (data.refreshToken) {
          Cookies.set('admin_refresh_token', data.refreshToken, { expires: 30, path: '/', sameSite: 'lax' });
        }
        return data.accessToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Proactive refresh, started only once a session exists and stopped on logout.
// The old version was a module-scope setInterval that ran forever — including on
// /login, where it refreshed nothing every 10 minutes for the life of the tab.
let proactiveTimer: ReturnType<typeof setInterval> | null = null;

export function startProactiveRefresh(): void {
  if (typeof window === 'undefined' || proactiveTimer) return;
  proactiveTimer = setInterval(
    () => {
      if (Cookies.get('admin_refresh_token')) void refreshAdminToken();
    },
    10 * 60 * 1000,
  );
}

export function stopProactiveRefresh(): void {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url: string = originalRequest?.url || '';
    const isAuthEndpoint = /\/admin\/auth\/(login|logout|refresh)/.test(url);

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const newToken = await refreshAdminToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
      clearAdminSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
