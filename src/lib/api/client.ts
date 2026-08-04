// NEAR-TWIN of the same path in oxshare-crm-client: the structure and the logic below the
// twin:config block are intentionally identical, and a behaviour change belongs in
// BOTH. It is excluded from scripts/check-twins.sh because two differences cannot
// be reduced to config — the exported function names (used across each app) and
// the token casing (the admin API answers camelCase, the portal snake_case, which
// is frozen). Diff the two by hand when changing either.

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL =
  typeof window !== 'undefined'
    ? '/api'
    : process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ─── twin:config:start ────────────────────────────────────────────────────────
// The ONLY part of this file that differs from its twin. Everything below the
// end marker must stay identical in both apps; scripts/check-twins.sh enforces
// that by excluding this block and comparing the rest.
//
// Cookie lifetimes must match the tokens inside them: proxy.ts gates private
// routes on the mere PRESENCE of the access cookie, so a cookie that outlives
// its JWT waves the user through to a page where every request 401s.
const ACCESS_TOKEN_DAYS = 1 / 3; // 8h — matches the ADMIN_JWT access token lifetime
const REFRESH_TOKEN_DAYS = 30;
const ACCESS_COOKIE = 'admin_access_token';
const REFRESH_COOKIE = 'admin_refresh_token';
const REFRESH_PATH = '/admin/auth/refresh';
const AUTH_ENDPOINT_PATTERN = /\/admin\/auth\/(login|logout|refresh)/;
const LOGIN_PATH = '/login';
// ─── twin:config:end ──────────────────────────────────────────────────────────

// The backend AdminGuard reads the cookie, not this header (cookies travel via
// withCredentials). The header is kept only for tooling that replays requests.
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get(ACCESS_COOKIE);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-Id'] = newCorrelationId();
  return config;
});

/**
 * A correlation id for one request — PLATFORM-CONVENTIONS R-6.1.
 *
 * The API already accepts an inbound `x-request-id`, runs the request inside an
 * AsyncLocalStorage context keyed on it, stamps it on every log line and returns
 * it in the error envelope. What was missing was anyone sending one: the chain
 * started at the API, so an admin saying "I clicked approve and nothing happened"
 * could not be tied to a request, and nothing joined a browser error to a server
 * log line.
 *
 * Generated per REQUEST, not per session — the id has to identify one call for a
 * log search to mean anything.
 *
 * The backend validates the shape (`/^[\w-]{8,128}$/`) before letting it into a
 * log, so anything non-conforming is replaced server-side rather than trusted.
 * The fallback below exists because `crypto.randomUUID` is undefined on insecure
 * origins and in some test environments; it only has to be unique enough to
 * correlate one request, never to be unguessable.
 */
function newCorrelationId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Cookie lifetimes must match the tokens inside them.
 *
 * proxy.ts gates every private route on the mere PRESENCE of the access cookie,
 * so a cookie that outlives its JWT means the proxy waves the admin through to a
 * page where every request 401s. Both writers below use these values — they were
 * previously repeated inline here and in auth.ts, which is exactly how the two
 * drift apart.
 *
 * This block is also the only part of this file that differs from its twin in
 * oxshare-crm-client. Keep per-app values here, never inline below, so a diff
 * between the two copies means a real behavioural difference.
 */

export function setSessionCookies(accessToken: string, refreshToken?: string): void {
  Cookies.set(ACCESS_COOKIE, accessToken, {
    expires: ACCESS_TOKEN_DAYS,
    path: '/',
    sameSite: 'lax',
  });
  if (refreshToken) {
    Cookies.set(REFRESH_COOKIE, refreshToken, {
      expires: REFRESH_TOKEN_DAYS,
      path: '/',
      sameSite: 'lax',
    });
  }
}

export function clearAdminSession(): void {
  Cookies.remove(ACCESS_COOKIE, { path: '/' });
  Cookies.remove(REFRESH_COOKIE, { path: '/' });
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
      const refreshToken = Cookies.get(REFRESH_COOKIE);
      const { data } = await axios.post<{ accessToken?: string; refreshToken?: string }>(
        `${API_BASE_URL}${REFRESH_PATH}`,
        { refreshToken },
        { withCredentials: true },
      );
      if (data.accessToken) {
        setSessionCookies(data.accessToken, data.refreshToken);
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
      if (Cookies.get(REFRESH_COOKIE)) void refreshAdminToken();
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

/**
 * A request we have already retried once.
 *
 * `_retry` is our own marker, not an axios field, so it is declared rather than
 * bolted onto an `any`. Without the type, every line of the interceptor below
 * was an unchecked member access on `any` — which is how a typo like
 * `error.reponse?.status` would have gone unnoticed on the session-expiry path.
 */
type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined;
    const url = originalRequest?.url ?? '';
    const isAuthEndpoint = AUTH_ENDPOINT_PATTERN.test(url);

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      const newToken = await refreshAdminToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
      clearAdminSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith(LOGIN_PATH)) {
        // A HARD navigation, deliberately, against @next/next's advice to use
        // router.push. The session is dead: a client-side push keeps the same JS
        // context alive, so the React Query cache, the auth context and any
        // rendered client data survive into the login screen. A full load is what
        // discards them. Same reasoning in AdminAuthContext.logout.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = LOGIN_PATH;
      }
    }
    // Rethrow the original AxiosError, never a wrapped one: every caller reads
    // `error.response.data.message` through apiErrorMessage, and the 401 branch
    // above depends on `error.response.status`. AxiosError extends Error, which
    // is what prefer-promise-reject-errors wants.
    return Promise.reject(error);
  },
);
