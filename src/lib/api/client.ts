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
const REFRESH_PATH = '/admin/auth/refresh';
const AUTH_ENDPOINT_PATTERN = /\/admin\/auth\/(login|logout|refresh)/;
const LOGIN_PATH = '/login';
// ─── twin:config:end ──────────────────────────────────────────────────────────

/**
 * The session travels as httpOnly cookies, which the browser attaches on its own
 * (`withCredentials` above). There is nothing for JS to read and nothing to
 * attach — the `Authorization: Bearer` header this interceptor used to build was
 * decorative even then, because AdminGuard has only ever read the cookie.
 *
 * What IS attached here is the anti-forgery token
 * (PLATFORM-CONVENTIONS §3.0 / R-3.6). The CSRF cookie is deliberately readable
 * by JS — it is a proof of same-origin, not a credential — and echoing it into a
 * header is the half a cross-origin page cannot perform, because setting a custom
 * header triggers a CORS preflight the API refuses.
 */
apiClient.interceptors.request.use((config) => {
  config.headers['X-Request-Id'] = newCorrelationId();

  if (STATE_CHANGING.test(config.method ?? 'get')) {
    const csrf = readCsrfCookie();
    if (csrf) config.headers[CSRF_HEADER] = csrf;
  }
  return config;
});

const STATE_CHANGING = /^(post|put|patch|delete)$/i;
const CSRF_HEADER = 'X-OxShare-CSRF';

/**
 * Reads THIS app's CSRF cookie, under both spellings.
 *
 * Per-surface, not shared: cookies are scoped by host and path and ignore the
 * port, so on localhost the portal and the admin app share one cookie jar. A
 * single shared name meant logging into one app silently overwrote the other's
 * token — and, worse, made the other app's login look like an authenticated
 * request that was missing its anti-forgery header.
 *
 * The name gains a `__Host-` prefix wherever the deployment has TLS, because
 * that prefix is what stops another OxShare site writing this cookie — the
 * browser enforces Secure + Path=/ + no Domain on it, so a sibling host cannot
 * create, overwrite or shadow it. Plain HTTP on localhost cannot satisfy Secure,
 * hence two spellings and one reader. Prefer the prefixed one: if both somehow
 * exist, the prefixed cookie is the one nothing else could have set.
 */
function readCsrfCookie(): string | undefined {
  return Cookies.get('__Host-oxshare_crm_admin_csrf') ?? Cookies.get('oxshare_crm_admin_csrf');
}

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
 * There is no session-cookie writer here any more, deliberately.
 *
 * The server sets `httpOnly` cookies (PLATFORM-CONVENTIONS R-3.2), so this app
 * cannot read or write them — which is the entire point. Previously it wrote
 * them itself from the login response, which meant an 8-hour admin token and a
 * 30-day refresh token sat in `document.cookie`, readable by any XSS, any
 * compromised transitive dependency and any browser extension on this origin.
 *
 * Ending a session is now a server call, not a local delete: only the server can
 * clear an httpOnly cookie, and only the server can revoke the refresh token
 * behind it. A local delete was always the weaker half — it left the refresh
 * token valid for 30 days.
 */
export function clearAdminSession(): void {
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
      // No body: the refresh token is an httpOnly cookie the browser attaches,
      // and the API accepts it from nowhere else (R-3.1 — two credential
      // channels for one session means two threat models). Nothing to read,
      // nothing to send, nothing to leak.
      await axios.post(`${API_BASE_URL}${REFRESH_PATH}`, {}, { withCredentials: true });
      // The rotated cookies — session and CSRF — arrive on the response and the
      // browser installs them. The body carries no tokens, so there is nothing to
      // read: reaching 200 IS the result. Callers only need "did it survive".
      return 'refreshed';
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
  // Gated on the CSRF cookie rather than the refresh cookie: it is the one
  // cookie this app can still see, it is set and cleared alongside the session,
  // and so it is an accurate "a session exists" signal without being a credential.
  proactiveTimer = setInterval(
    () => {
      if (readCsrfCookie()) void refreshAdminToken();
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
      const refreshed = await refreshAdminToken();
      if (refreshed) {
        // No header to re-attach: the rotated session cookie travels on its own.
        // The CSRF header is rebuilt by the request interceptor on the retry,
        // which matters because refresh ROTATES the token — replaying the old
        // one would fail the binding check.
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
