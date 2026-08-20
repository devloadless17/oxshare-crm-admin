// NEAR-TWIN of the same path in oxshare-crm-client: the structure and the logic below the
// twin:config block are intentionally identical, and a behaviour change belongs in
// BOTH. It is excluded from scripts/check-twins.sh because two differences cannot
// be reduced to config — the exported function names (used across each app) and
// the token casing (the admin API answers camelCase, the portal snake_case, which
// is frozen). Diff the two by hand when changing either.

import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

// Resolved and validated in `lib/env.ts`, which refuses a production build with
// no NEXT_PUBLIC_API_BASE_URL rather than silently falling back to localhost.
import { API_BASE_URL } from '../env';
import { loginPathFor } from '@/lib/return-to';
// The single definition of "reachable without a session", shared with proxy.ts.
import { isPublicPath } from '@/lib/public-paths';
import { announceSessionEvent, withSessionLock } from '@/lib/session-channel';
// The marker that tells the NEXT cold load which screen to paint — cleared in
// clearAdminSession so a dead session cannot leave it behind.
import { clearSessionHint } from '@/lib/session-hint';
/**
 * A request that never finishes must eventually fail.
 *
 * axios defaults `timeout` to 0, which means NO timeout: a request hangs until
 * the browser or OS gives up, which can be minutes, behind whatever spinner the
 * screen happens to be showing.
 *
 * 60s, matching the portal's twin — this is a backstop against hanging, not a
 * latency budget, and the number has to clear the slowest legitimate request in
 * either app.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── twin:config:start ────────────────────────────────────────────────────────
// The ONLY part of this file that differs from its twin. Everything below the
// end marker must stay identical in both apps; scripts/check-twins.sh enforces
// that by excluding this block and comparing the rest.
//
// `proxy.ts` gates private routes on the presence of the REFRESH cookie — not
// the access cookie, which lives fifteen minutes and would bounce a returning
// operator whose thirty-day session is perfectly valid. (This comment said
// "access cookie" long after that changed, which is exactly the stale-literal
// class that has disarmed a check in this system three times.)
const REFRESH_PATH = '/admin/auth/refresh';
/*
 * Requests whose own 401 must NOT trigger a refresh-and-retry.
 *
 * `me` is deliberately NOT here. Its 401 is what renews a returning operator's
 * session: the access cookie lives fifteen minutes and the refresh cookie
 * thirty days, so the ordinary state of somebody back from lunch is a 401 on
 * `/admin/auth/me` followed by a silent renewal. Excluding it would send them
 * to the sign-in screen holding a valid session — the exact bounce `proxy.ts`
 * gates on the refresh cookie to avoid.
 */
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
    const csrf = currentCsrfToken();
    if (csrf) config.headers[CSRF_HEADER] = csrf;
  }
  return config;
});

const STATE_CHANGING = /^(post|put|patch|delete)$/i;
export const CSRF_HEADER = 'X-OxShare-CSRF';

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
/**
 * The two spellings of this app's CSRF cookie, in order of preference.
 *
 * Exported so `cookie-contract.test.ts` pins the actual values rather than a
 * copy of them — the backend computes these names and this repo hardcodes them,
 * with nothing connecting the two (separate repos, no shared package). A rename
 * there compiles here, passes type-checking, and then logs everyone out.
 */
export const CSRF_COOKIE_NAMES = [
  '__Host-oxshare_crm_admin_csrf',
  'oxshare_crm_admin_csrf',
] as const;

function readCsrfCookie(): string | undefined {
  return Cookies.get(CSRF_COOKIE_NAMES[0]) ?? Cookies.get(CSRF_COOKIE_NAMES[1]);
}

/**
 * The token as the API last returned it, held in memory.
 *
 * ## Why reading the cookie is not enough
 *
 * `document.cookie` only exposes cookies belonging to the HOST of this page. The
 * anti-forgery cookie is set by the API, on the API's host, with a `__Host-`
 * prefix that forbids a `Domain` attribute — so wherever this app is deployed to
 * a different hostname than the API (which is every real deployment; the browser
 * must call the API directly because a Next rewrite cannot proxy the realtime
 * WebSocket upgrade), `readCsrfCookie()` returns undefined, no header is sent,
 * and EVERY write is refused with a 403.
 *
 * Local development hides this completely: cookies ignore the PORT, so :3001 and
 * :3002 are one cookie host and the cookie reads perfectly.
 *
 * So the API also returns the token in an `X-OxShare-CSRF` response header
 * (exposed via CORS), and this keeps the last one seen. The cookie is still
 * preferred where it is readable, which keeps development on exactly the path it
 * has always used.
 *
 * ## Memory rather than storage, deliberately
 *
 * Not `localStorage`: this survives exactly as long as the page does, so a token
 * cannot outlive the session that minted it or be read by another tab after a
 * sign-out. The cost is that a cold load starts with nothing — which is why the
 * API returns the header on EVERY response rather than only on login, so the
 * first call the screen makes restores it.
 */
let csrfFromResponse: string | undefined;

function currentCsrfToken(): string | undefined {
  return readCsrfCookie() ?? csrfFromResponse;
}

/** Forgotten on sign-out, so a dead token cannot be attached to a new session. */
function forgetCsrfToken(): void {
  csrfFromResponse = undefined;
}

function rememberCsrfToken(headers: unknown): void {
  // axios lowercases response header names; the API sends `X-OxShare-CSRF`.
  const value = (headers as Record<string, unknown> | undefined)?.['x-oxshare-csrf'];
  if (typeof value === 'string' && value !== '') csrfFromResponse = value;
}

/*
 * Registered BEFORE the refresh-and-retry interceptor below, so it observes
 * every response first — including error responses, which carry the header too.
 * A 401 that triggers a refresh returns a rotated token, and the retry has to go
 * out carrying the new one rather than the value that was just replaced.
 */
apiClient.interceptors.response.use(
  (response) => {
    rememberCsrfToken(response.headers);
    return response;
  },
  (error: AxiosError) => {
    rememberCsrfToken(error.response?.headers);
    return Promise.reject(error);
  },
);

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
 * A key identifying ONE intended money operation — PLATFORM-CONVENTIONS R-5.2.
 *
 * Money-moving endpoints require an `Idempotency-Key`, and the value belongs to
 * the user's INTENT, not to the HTTP call. Generate it once when the user starts
 * an operation (opening the withdrawal form, say) and reuse that same value for
 * every attempt at it — that is what makes a double-click, a flaky network and a
 * "did that go through?" refresh all resolve to a single withdrawal.
 *
 * Deliberately NOT generated automatically per request: a fresh key on every
 * call would make each duplicate look like a new operation, which is precisely
 * the bug this exists to prevent. The request interceptor does preserve a key
 * that is already set, so the 401-refresh retry reuses it rather than minting a
 * new one.
 */
export function newIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Axios config carrying the key. `api.post(url, body, idempotent(key))`. */
export function idempotent(key: string) {
  return { headers: { 'Idempotency-Key': key } };
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
  // The in-memory anti-forgery token. The cookie is the server's to clear; this
  // is the copy this tab is holding, and it belongs to the session that just
  // ended — see the note on `csrfFromResponse`.
  forgetCsrfToken();
  /*
   * The `session-hint` marker, and this line is what keeps a stale one from
   * becoming a redirect loop.
   *
   * `proxy.ts` reads the marker and sends `/login` onward to the dashboard. If a
   * session dies while the marker survives, that redirect and the 401 eviction
   * point at each other: login → dashboard → 401 → login. Clearing it HERE
   * closes that, because this runs inside the interceptor — before React Query
   * settles the error, before any component re-renders and long before any
   * navigation. By the time the eviction lands on the sign-in screen the marker
   * is already gone and the proxy serves the form.
   *
   * `AdminAuthContext` clears it too, on a 401 from `/admin/auth/me`. That is
   * the same fact observed one layer up and is not redundant: this covers the
   * interceptor path, that covers a query resolving signed-out without one.
   */
  clearSessionHint();
}

/**
 * Single-flight refresh.
 *
 * Rotation invalidates the presented refresh token, so N concurrent 401s
 * firing N rotations meant the 2nd..Nth all presented an already-rotated token,
 * failed, and logged the admin out mid-session. Every caller now awaits the one
 * in-flight promise instead.
 */
let inFlight: Promise<boolean> | null = null;

/**
 * Did the API say this refresh merely LOST A RACE?
 *
 * `SESSION_SUPERSEDED` is the one 401 on this path that does not mean the
 * session is over — see the backend's domain-errors.ts. Branching on the machine
 * code rather than on the message, because the message is prose that changes and
 * will be translated (D-16).
 */
function supersededCode(error: unknown): boolean {
  const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
  return code === 'SESSION_SUPERSEDED';
}

export function refreshAdminToken(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    /*
     * Single-flight ACROSS TABS as well as within one.
     *
     * `inFlight` above is module scope, which is per tab, and each tab runs its
     * own ten-minute timer — so a laptop waking with two tabs open fires two
     * refreshes at the same instant against one rotating token. The lock
     * serialises them; see lib/session-channel.ts for why it waits rather than
     * short-circuiting, and why it degrades to the old behaviour where Web Locks
     * are unavailable.
     */
    let retrying = false;
    return withSessionLock(async () => {
      try {
        /*
         * No body: the refresh token is an httpOnly cookie the browser attaches,
         * and the API accepts it from nowhere else (R-3.1 — two credential
         * channels for one session means two threat models). Nothing to read,
         * nothing to send, nothing to leak.
         *
         * Deliberately NOT through `apiClient`, so a 401 here cannot recurse into
         * the response interceptor that called it. The cost of stepping outside is
         * that the request interceptor does not run, so the correlation id has to
         * be attached by hand — R-6.1. It was not, and this is the single request
         * you most want to trace when a session dies for no visible reason: the
         * one call in the app that decides whether the user stays signed in had
         * nothing tying it to a server log line.
         *
         * No CSRF header, and that is correct rather than an oversight: the API
         * marks this route `@NoCsrf` precisely because the anti-forgery token
         * expires alongside the access token, and demanding one here would lock
         * out the returning user this call exists to renew.
         */
        const rotation = await axios.post(
          `${API_BASE_URL}${REFRESH_PATH}`,
          {},
          { withCredentials: true, headers: { 'X-Request-Id': newCorrelationId() } },
        );
        /*
         * Learn the ROTATED anti-forgery token off THIS response.
         *
         * Stepping outside `apiClient` above costs BOTH interceptors, not only
         * the request one. The absent correlation id was noticed and attached by
         * hand; the absent RESPONSE interceptor was not - so `rememberCsrfToken`
         * never ran for the one call in the app that invalidates the token it
         * caches.
         *
         * Refresh ROTATES the token: the API mints a new one, sets it as the
         * cookie and returns it in `X-OxShare-CSRF`. Dropping that header left
         * `csrfFromResponse` pinned to the PRE-rotation value, so every later
         * write echoed a token the API's cookie no longer matched and was refused
         * 403 `failed anti-forgery validation` - permanently, because nothing
         * else ever writes that variable.
         *
         * Not an edge case: the access token lives 15 minutes, so the first
         * refresh lands minutes into any session and every write after it failed.
         * Signing out and back in did not help, because the next refresh redid it.
         */
        rememberCsrfToken(rotation.headers);
        /*
         * A boolean, because there is nothing else to return.
         *
         * This used to resolve the literal string `'refreshed'` — a placeholder
         * shaped like the access token that used to come back in the body. The
         * token is gone (R-3.2): the rotated cookies arrive on the response and
         * the browser installs them, so reaching 200 IS the result. A `string |
         * null` signature invites the next reader to put a credential back into
         * JavaScript, which is the exact thing this migration removed.
         */
        return true;
      } catch (error) {
        /*
         * `SESSION_SUPERSEDED` means the session is ALIVE — retry, do not sign out.
         *
         * Another request rotated the same token first, so the winner's cookies
         * are already in this browser's jar and a second attempt succeeds
         * against them. The API answers this code specifically to say so; before
         * it existed the loser was told "revoked" and every caller here treated
         * that as session death.
         *
         * It survived the cross-tab lock because a lock serialises but does not
         * eliminate the race: a tab that queued behind the winner still sends
         * whatever cookie the browser hands it, and a request already in flight
         * when the winner committed cannot be recalled. So the retry is the part
         * that actually closes it — and without it, the tab that lost broadcast
         * `signed-out` and took every other tab down with it.
         *
         * Once only. A second failure is a real one.
         */
        if (supersededCode(error) && !retrying) {
          retrying = true;
          try {
            const retriedRotation = await axios.post(
              `${API_BASE_URL}${REFRESH_PATH}`,
              {},
              { withCredentials: true, headers: { 'X-Request-Id': newCorrelationId() } },
            );
            // Rotates the token exactly as the first attempt does, so it has to be
            // learned here too - see the note on the call above.
            rememberCsrfToken(retriedRotation.headers);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      }
    });
  })().finally(() => {
    // Released here rather than inside the lock, so the in-tab dedupe covers the
    // whole operation INCLUDING the wait for the cross-tab lock. Clearing it
    // inside would let a second caller in this tab queue behind the lock
    // separately, which is the duplication the single-flight exists to prevent.
    inFlight = null;
  });
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
 * This session is over: stop the timers and get off the console.
 *
 * ## What replaced the CSRF-cookie heuristic, and why
 *
 * This used to decide whether to navigate by asking `readCsrfCookie() !==
 * undefined`, reasoning that the cookie is set and cleared alongside the
 * session so its absence means nobody was ever signed in. The reasoning was
 * added for a real bug — an invitee following an emailed link was being bounced
 * to a sign-in page for an account they do not have yet — but the signal is
 * wrong in two ordinary situations:
 *
 *  - The CSRF cookie lives **8 hours**; the refresh cookie lives **30 days**. An
 *    operator returning the next morning holds one and not the other. If their
 *    session has also died — revoked elsewhere, or a development database reset
 *    — the redirect was suppressed and `admin-layout.tsx` rendered its spinner
 *    with no error and no way out. Forever.
 *  - Signing out in one tab clears the CSRF cookie for the WHOLE browser, so
 *    every other tab concluded nobody had been signed in and kept rendering the
 *    console indefinitely.
 *
 * The question it was trying to answer is "am I on a page that expects a
 * session?", and `isPublicPath` answers exactly that, from the one list
 * `proxy.ts` also reads. The invitee case stays fixed, because `/invite/accept`
 * is in that list.
 */
function endDeadSession(): void {
  clearAdminSession();
  if (typeof window === 'undefined') return;
  // Nothing to evict anyone from: these pages are meant to work signed out.
  if (isPublicPath(window.location.pathname)) return;
  if (window.location.pathname.startsWith(LOGIN_PATH)) return;

  /*
   * Tell the other tabs — but only now that we know this is a real eviction.
   *
   * Whichever tab notices first is the one that knows; the rest are sitting on a
   * rendered console with a dead session behind it, and would only find out when
   * somebody clicked something. On a shared machine that is the gap that matters.
   *
   * Announcing ABOVE, before the public-path check, is what produced an infinite
   * reload in the portal's copy of this file: every load of the sign-in page
   * answers 401 on the profile call, which reaches here, which announced — and
   * the same document's own listener heard it and reloaded. `session-channel.ts`
   * now ignores self-sent messages, and this ordering means a public page does
   * not broadcast at all. Either alone fixes it; both are correct independently.
   */
  announceSessionEvent('signed-out');

  /*
   * A HARD navigation, deliberately, against @next/next's advice to use
   * router.push. The session is dead: a client-side push keeps the same JS
   * context alive, so the React Query cache, the auth context and any rendered
   * client data survive into the login screen. A full load discards them. Same
   * reasoning in AdminAuthContext.logout.
   *
   * It carries where they were, exactly as proxy.ts does when it bounces a
   * signed-out visitor — a session dying mid-task is the case where losing the
   * destination hurts most.
   */
  window.location.href = loginPathFor(window.location.pathname, window.location.search);
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

/**
 * AN HTML BODY IS NEVER AN API RESPONSE.
 *
 * This exists because a deployment pointed `NEXT_PUBLIC_API_BASE_URL` at the
 * FRONTEND's own origin instead of the API's. Every call then resolved against
 * this Next app: `POST /v1/auth/login` matched no route, the route gate answered
 * `307 -> /auth/login?next=...`, the browser followed the redirect transparently,
 * and axios reported 200 OK carrying the sign-in page's HTML.
 *
 * Nothing anywhere said otherwise. Sign-in "succeeded", the profile call
 * "succeeded" and "returned data", and the next navigation bounced back to the
 * sign-in screen — because no session had ever been created. 200 is the most
 * misleading status a misrouted API call can return, and a followed redirect is
 * precisely how a request stops being the one that was sent.
 *
 * So the content type is checked on the SUCCESS path. A response the caller
 * expected to be JSON and which is HTML did not come from the API, whatever the
 * status line says — and the operator is told that instead of being signed out
 * for no visible reason.
 *
 * `apiErrorMessage` falls back to `error.message`, so this text is what the
 * sign-in form actually shows rather than a generic failure.
 */
export class NotAnApiResponseError extends Error {
  constructor(url: string, contentType: string) {
    super(
      `Expected JSON from the API for "${url}" and received ${contentType || 'no content type'}. ` +
        'The configured API origin (NEXT_PUBLIC_API_BASE_URL) is answering with a web page, ' +
        'which means it points at a frontend rather than at the API.',
    );
    this.name = 'NotAnApiResponseError';
  }
}

/**
 * Only requests that ASKED for JSON can conclude anything from the content type:
 * `export.ts` requests a blob and is answered `text/csv`, and a download must not
 * be second-guessed on its type. `undefined` is axios's default, which is json.
 */
function assertApiResponse(response: AxiosResponse): AxiosResponse {
  const responseType = response.config?.responseType;
  if (responseType !== undefined && responseType !== 'json') return response;

  // Narrowed rather than coerced: axios types the header bag loosely, and
  // `String(value)` on a non-string would quietly produce '[object Object]',
  // which matches no branch below — disarming this check instead of failing it.
  const raw: unknown = (response.headers as Record<string, unknown> | undefined)?.['content-type'];
  const contentType = typeof raw === 'string' ? raw : '';
  if (!/^\s*text\/html/i.test(contentType)) return response;

  throw new NotAnApiResponseError(response.config?.url ?? '', contentType);
}

apiClient.interceptors.response.use(assertApiResponse, async (error: AxiosError) => {
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
    /*
     * On a public page there is nothing to renew, so do not ask.
     *
     * `AdminAuthContext` asks `/admin/auth/me` on mount everywhere, including
     * `/login` and `/invite/accept`, and a signed-out visitor's 401 there is
     * the correct answer to "is anyone here". Answering it with a real
     * `POST /admin/auth/refresh` meant two guaranteed-to-fail requests on
     * every cold load of the sign-in page — against a route throttled at
     * 20/min, which a shared office IP can reach.
     */
    if (
      typeof window !== 'undefined' &&
      isPublicPath(window.location.pathname) &&
      readCsrfCookie() === undefined
    ) {
      return Promise.reject(error);
    }
    const refreshed = await refreshAdminToken();
    if (refreshed) {
      // No header to re-attach: the rotated session cookie travels on its own.
      // The CSRF header is rebuilt by the request interceptor on the retry,
      // which matters because refresh ROTATES the token — replaying the old
      // one would fail the binding check.
      return apiClient(originalRequest);
    }
    endDeadSession();
  } else if (error.response?.status === 401 && originalRequest?._retry) {
    /*
     * The SECOND 401 — after a refresh succeeded and the retry still failed.
     *
     * This branch did not exist. Control fell straight through to the rethrow
     * with no `clearAdminSession()` and no redirect, so the operator got a
     * generic "something went wrong" card with a Retry button that could never
     * succeed, and stayed on a console whose session was dead.
     *
     * It is not hypothetical: it is what the API answers when the rotation
     * worked but the account behind it no longer passes — suspended, deleted,
     * or logged out from another device between the two calls. The portal's
     * twin of this file already handled it; this side had drifted.
     */
    endDeadSession();
  }
  // Rethrow the original AxiosError, never a wrapped one: every caller reads
  // `error.response.data.message` through apiErrorMessage, and the 401 branch
  // above depends on `error.response.status`. AxiosError extends Error, which
  // is what prefer-promise-reject-errors wants.
  return Promise.reject(error);
});
