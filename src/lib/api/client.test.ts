import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/**
 * The 401/refresh interceptor — the piece of this app most able to break a
 * session, and the one with no test.
 *
 * Three properties matter, and each one has a specific failure behind it:
 *
 *  - **Single-flight.** Refresh ROTATES the refresh token, so N concurrent 401s
 *    firing N rotations means the 2nd..Nth present an already-rotated token,
 *    fail, and log the admin out mid-session. This is the bug the `inFlight`
 *    promise exists to prevent, and nothing regressed it.
 *
 *  - **Retry exactly once.** `_retry` is the only thing standing between a
 *    persistent 401 and an infinite request loop against the API.
 *
 *  - **Never on an auth endpoint.** A failed login answers 401 by design. If the
 *    interceptor treated that as an expired session it would attempt a refresh
 *    on every wrong password, and on failure hard-navigate — turning "wrong
 *    password" into a page reload that discards the typed email.
 *
 * `axios.post` is mocked rather than the network, because the refresh call
 * deliberately bypasses `apiClient` (it must not recurse through this same
 * interceptor).
 */

/*
 * The spy is created in `vi.hoisted` and referenced directly rather than read
 * back off `axios.post`. Reading it back trips `unbound-method` — correctly,
 * since detaching a method from its object is normally a bug — and `.bind()`ing
 * it produces a DIFFERENT function, so assertions would watch a copy that never
 * records anything.
 */
const mockedPost = vi.hoisted(() => vi.fn());

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    // `axios.create` must still build a real instance, since that instance IS
    // the thing under test; only the bare `axios.post` the refresh call uses is
    // replaced.
    default: Object.assign({}, actual.default, { post: mockedPost }),
  };
});

async function loadClient() {
  // Re-imported per test: `inFlight` and the proactive timer are module state,
  // and a leaked in-flight promise would make the single-flight test pass for
  // the wrong reason.
  vi.resetModules();
  return import('./client');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('refreshAdminToken', () => {
  it('collapses concurrent callers into ONE refresh request', async () => {
    const { refreshAdminToken } = await loadClient();
    let resolvePost: (v: unknown) => void = () => {};
    mockedPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const calls = [refreshAdminToken(), refreshAdminToken(), refreshAdminToken()];
    resolvePost({ status: 200 });
    const results = await Promise.all(calls);

    // Rotation invalidates the presented token. Three requests would mean the
    // second and third present an already-rotated one and fail — which is a
    // logout in the middle of a working session.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, true, true]);
  });

  it('allows a new refresh after the previous one settles', async () => {
    const { refreshAdminToken } = await loadClient();
    mockedPost.mockResolvedValue({ status: 200 });

    await refreshAdminToken();
    await refreshAdminToken();

    // The single-flight guard must clear itself. If it did not, a session would
    // refresh once and then never again.
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  it('sends no body — the refresh token is a cookie and nothing else', async () => {
    const { refreshAdminToken } = await loadClient();
    mockedPost.mockResolvedValue({ status: 200 });

    await refreshAdminToken();

    const [, body, config] = mockedPost.mock.calls[0] as [
      string,
      unknown,
      { withCredentials?: boolean },
    ];
    // R-3.1: two credential channels for one session means two threat models.
    expect(body).toEqual({});
    expect(config.withCredentials).toBe(true);
  });

  it('returns null rather than throwing when the refresh is refused', async () => {
    const { refreshAdminToken } = await loadClient();
    mockedPost.mockRejectedValue(new Error('401'));

    // Callers branch on the value. A throw here would propagate out of the
    // response interceptor as an unhandled rejection instead of a clean logout.
    // `false`, not null: the call reports whether the session survived, and there
    // is no token to hand back — the rotated cookies are httpOnly (R-3.2).
    await expect(refreshAdminToken()).resolves.toBe(false);
  });

  it('does not wedge after a failure', async () => {
    const { refreshAdminToken } = await loadClient();
    mockedPost.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce({ status: 200 });

    expect(await refreshAdminToken()).toBe(false);
    // The `finally` that clears `inFlight` is what makes this pass. Without it a
    // single failed refresh would poison every later one for the tab's lifetime.
    expect(await refreshAdminToken()).toBe(true);
  });
});

describe('idempotency keys', () => {
  it('mints a distinct key per call', async () => {
    const { newIdempotencyKey } = await loadClient();

    // The key identifies an INTENT, so the caller reuses one value across
    // retries — but two separate operations must never collide, or the second
    // withdrawal would be answered with the first one's result.
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
  });

  it('builds the header config money endpoints require', async () => {
    const { idempotent } = await loadClient();
    expect(idempotent('abc-123')).toEqual({ headers: { 'Idempotency-Key': 'abc-123' } });
  });
});

describe('proactive refresh', () => {
  it('does not refresh while no session marker exists', async () => {
    vi.useFakeTimers();
    const { startProactiveRefresh, stopProactiveRefresh } = await loadClient();
    mockedPost.mockResolvedValue({ status: 200 });

    startProactiveRefresh();
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    stopProactiveRefresh();

    // The old version was a module-scope setInterval that ran forever, including
    // on /login where it refreshed nothing every 10 minutes for the life of the
    // tab. jsdom starts with no cookies, so this is that case.
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('fires where the CSRF cookie is unreadable but the session marker is set', async () => {
    /*
     * THE PRODUCTION TOPOLOGY. The console and the API are different hostnames,
     * so the API's `__Host-` CSRF cookie is invisible here — and the timer used
     * to be gated on reading it, so it never fired outside localhost. The
     * session-hint marker is this app's own cookie and is what it asks now.
     */
    vi.useFakeTimers();
    document.cookie = 'oxshare_crm_admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = '__Host-oxshare_crm_admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'oxshare_crm_admin_session_hint=1; Path=/';
    const { startProactiveRefresh, stopProactiveRefresh } = await loadClient();
    mockedPost.mockResolvedValue({ status: 200, headers: {} });

    startProactiveRefresh();
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    stopProactiveRefresh();

    expect(mockedPost).toHaveBeenCalled();
    document.cookie = 'oxshare_crm_admin_session_hint=; Path=/; Max-Age=0';
  });

  it('stops firing once the session is cleared', async () => {
    vi.useFakeTimers();
    const { startProactiveRefresh, clearAdminSession } = await loadClient();
    document.cookie = 'oxshare_crm_admin_session_hint=1; Path=/';
    mockedPost.mockResolvedValue({ status: 200 });

    startProactiveRefresh();
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    const afterFirst = mockedPost.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    clearAdminSession();
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);

    // A timer that outlives the session keeps calling refresh for a user who
    // logged out. (`clearAdminSession` also clears the marker itself.)
    expect(mockedPost).toHaveBeenCalledTimes(afterFirst);
    document.cookie = 'oxshare_crm_admin_session_hint=; Path=/; Max-Age=0';
  });
});

describe('a 401 on a public page', () => {
  /*
   * `/login`, `/invite/accept`, `/reset-password` all ask `/admin/auth/me` on
   * mount. For a visitor who was never signed in that 401 is the answer and a
   * refresh would be two guaranteed-to-fail requests per cold load. For an
   * operator whose access token lapsed — the normal state of anyone returning
   * after fifteen minutes — it is a session to renew. The session-hint marker
   * tells the two apart; the CSRF cookie used to, and cannot off localhost.
   */
  function answer401ThenOk(apiClient: import('axios').AxiosInstance) {
    let calls = 0;
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(
          Object.assign(new Error('401'), {
            config,
            response: { status: 401, data: {}, headers: {}, statusText: '', config },
            isAxiosError: true,
          }),
        );
      }
      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };
  }

  it('is not renewed when no session marker exists', async () => {
    window.history.pushState({}, '', '/login');
    document.cookie = 'oxshare_crm_admin_session_hint=; Path=/; Max-Age=0';
    const { apiClient } = await loadClient();
    answer401ThenOk(apiClient);

    await expect(apiClient.get('/admin/auth/me')).rejects.toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('IS renewed when the session marker says there is a session to renew', async () => {
    window.history.pushState({}, '', '/login');
    document.cookie = 'oxshare_crm_admin_session_hint=1; Path=/';
    const { apiClient } = await loadClient();
    answer401ThenOk(apiClient);
    mockedPost.mockResolvedValue({ status: 200, headers: {} });

    const res = await apiClient.get('/admin/auth/me');
    expect(res.status).toBe(200);
    expect(mockedPost).toHaveBeenCalledTimes(1);
    document.cookie = 'oxshare_crm_admin_session_hint=; Path=/; Max-Age=0';
    window.history.pushState({}, '', '/');
  });
});

describe('a refresh that lost a race', () => {
  it('retries once on SESSION_SUPERSEDED and keeps the session', async () => {
    /*
     * Pins the status the backend answers with: 401 + code SESSION_SUPERSEDED.
     * Both this interceptor and the portal's branch on the CODE before the
     * status, so the 401 is load-bearing only in that it must not be treated
     * as a dead session — this is the assertion that it is not.
     */
    const { refreshAdminToken } = await loadClient();
    mockedPost
      .mockRejectedValueOnce({ response: { status: 401, data: { code: 'SESSION_SUPERSEDED' } } })
      .mockResolvedValueOnce({ status: 200, headers: {} });

    expect(await refreshAdminToken()).toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});

/**
 * The guard that turns "the API origin is misconfigured" into a message.
 *
 * The failure it exists for produced no error at all: with
 * `NEXT_PUBLIC_API_BASE_URL` pointing at the frontend's own origin, the login
 * POST hit this Next app, the route gate answered a 307 to the sign-in page, the
 * browser followed it, and axios resolved 200 with HTML. Sign-in "succeeded",
 * `/admin/auth/me` "succeeded", and the next navigation bounced back to the
 * sign-in screen with no session behind it.
 *
 * Driven through `defaults.adapter` rather than the network, because the thing
 * under test is the response interceptor and nothing below it.
 */
describe('a response that did not come from the API', () => {
  function respondWith(headers: Record<string, string>, data: unknown) {
    return (config: InternalAxiosRequestConfig): Promise<AxiosResponse> =>
      Promise.resolve({ data, status: 200, statusText: 'OK', headers, config });
  }

  it('rejects an HTML body on a request that asked for JSON', async () => {
    const { apiClient } = await loadClient();
    apiClient.defaults.adapter = respondWith(
      { 'content-type': 'text/html; charset=utf-8' },
      '<!DOCTYPE html><html><body>Sign in</body></html>',
    );

    await expect(apiClient.get('/admin/auth/me')).rejects.toThrow(
      /points at a frontend rather than at the API/,
    );
  });

  it('lets an ordinary JSON response through untouched', async () => {
    const { apiClient } = await loadClient();
    apiClient.defaults.adapter = respondWith({ 'content-type': 'application/json' }, { id: 'a1' });

    await expect(apiClient.get('/admin/auth/me')).resolves.toMatchObject({ data: { id: 'a1' } });
  });

  /*
   * A download must not be second-guessed on its content type — `export.ts`
   * asks for a blob and is answered `text/csv`. Only a request that asked for
   * JSON can conclude anything from an HTML body.
   */
  it('leaves a non-JSON request alone even when the body is HTML', async () => {
    const { apiClient } = await loadClient();
    apiClient.defaults.adapter = respondWith({ 'content-type': 'text/html' }, 'anything');

    await expect(
      apiClient.get('/admin/exports/clients', { responseType: 'blob' }),
    ).resolves.toBeDefined();
  });
});

describe('the anti-forgery token across a refresh', () => {
  /*
   * The refresh call deliberately bypasses `apiClient` so a 401 cannot recurse
   * into the interceptor that called it - and that costs the RESPONSE
   * interceptor as well as the request one.
   *
   * Refresh ROTATES the CSRF token. Dropping `X-OxShare-CSRF` off this one
   * response left the cached token pinned to the value the rotation replaced,
   * so every write after the first refresh echoed a token the API's cookie no
   * longer matched and was refused 403 for the rest of the session. The access
   * token lives 15 minutes, so that is minutes into every session.
   *
   * The cross-host deployment is the case that matters and the one local
   * development hides: `readCsrfCookie()` returns undefined because the cookie
   * belongs to the API's host, which makes the remembered response token the
   * ONLY source - so losing it means no header is sent at all.
   */
  /*
   * The COLD-LOAD half of the same fix, and the one that broke production.
   *
   * A page reload makes no login and no refresh call, so the in-memory token is
   * empty and the cookie is unreadable — it is `__Host-` prefixed and therefore
   * locked to the API's host, which is a DIFFERENT host once deployed. With no
   * source of a token, no `X-OxShare-CSRF` header goes out and every write is
   * 403, deterministically, for every operator. Local development hides it
   * completely because :3001 and :3002 share one cookie jar.
   *
   * The middleware that echoes the token on ordinary responses is what closes
   * it, and this asserts the client half: learn from any response, then send it.
   */
  it('learns the token from an ordinary response when no cookie is readable', async () => {
    document.cookie = 'oxshare_crm_admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = '__Host-oxshare_crm_admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    const { apiClient } = await loadClient();

    let sent: InternalAxiosRequestConfig | undefined;
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      sent = config;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        // Lowercased, because that is how axios normalises response headers —
        // reading `X-OxShare-CSRF` off this object finds nothing.
        headers: { 'content-type': 'application/json', 'x-oxshare-csrf': 'echoed-on-a-read' },
        config,
      });
    };

    // A plain READ — no login, no refresh. This is the only thing a freshly
    // loaded console does before its first write.
    await apiClient.get('/admin/auth/me');

    await apiClient.post('/admin/clients/c1/tags', { tagId: 't1' });

    expect(sent?.headers['X-OxShare-CSRF']).toBe('echoed-on-a-read');
  });

  /* A GET carries no token of its own — only writes are forged. */
  it('sends no anti-forgery header on a read', async () => {
    const { apiClient } = await loadClient();

    let sent: InternalAxiosRequestConfig | undefined;
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      sent = config;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', 'x-oxshare-csrf': 'echoed-on-a-read' },
        config,
      });
    };

    await apiClient.get('/admin/clients');

    expect(sent?.headers['X-OxShare-CSRF']).toBeUndefined();
  });

  it('attaches the token the refresh returned, not the one it replaced', async () => {
    // Cross-host: this app cannot read the API's cookie. Cleared explicitly so
    // a leftover from another test cannot supply the token by accident.
    document.cookie = 'oxshare_crm_admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = '__Host-oxshare_crm_admin_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    const { apiClient, refreshAdminToken } = await loadClient();
    mockedPost.mockResolvedValue({
      status: 200,
      headers: { 'x-oxshare-csrf': 'token-after-rotation' },
    });

    expect(await refreshAdminToken()).toBe(true);

    let sent: InternalAxiosRequestConfig | undefined;
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      sent = config;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
      });
    };

    await apiClient.patch('/admin/clients/c1/status', { status: 'ACTIVE' });

    expect(sent?.headers['X-OxShare-CSRF']).toBe('token-after-rotation');
  });
});
