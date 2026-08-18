import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { proxy, config } from './proxy';

/**
 * The route gate — Next 16's rename of `middleware.ts`.
 *
 * It no longer gates. The session-cookie check it used to perform is gone,
 * because it could never have worked once the browser started calling the API
 * directly: the session cookie is `__Host-` prefixed and set by the API's host,
 * so the browser locks it to that host and never sends it to this one. The gate
 * read `undefined` for every valid session and bounced every private route back
 * to `/login`. `proxy.ts` carries the full account.
 *
 * These tests now pin the two things that remain true: the gate redirects
 * NOTHING, and every response it touches carries a Content-Security-Policy.
 */

/** A request the gate can read, with whatever cookies the case needs. */
function requestFor(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: { pathname, search: '' },
    url: `http://localhost:3002${pathname}`,
    headers: new Headers(),
    cookies: {
      get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined),
    },
  } as unknown as NextRequest;
}

/** Where a NextResponse says it is going, or null when it is passing through. */
function redirectTarget(res: ReturnType<typeof proxy>): string | null {
  const location = res.headers.get('location');
  return location ? new URL(location).pathname : null;
}

describe('the gate does not redirect', () => {
  /*
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * A signed-in admin's request looks EXACTLY like this one: no session cookie,
   * because the cookie belongs to the API's host. Redirecting here is what broke
   * production sign-in — login returned 200, `/admin/auth/me` returned the
   * admin, and the very next navigation bounced to `/login?next=/dashboard`.
   */
  it('lets a private route through with no cookie at all', () => {
    expect(redirectTarget(proxy(requestFor('/withdrawals')))).toBeNull();
    expect(redirectTarget(proxy(requestFor('/dashboard')))).toBeNull();
  });

  it('lets the public routes through, as it always did', () => {
    expect(redirectTarget(proxy(requestFor('/login')))).toBeNull();
    expect(redirectTarget(proxy(requestFor('/invite/accept')))).toBeNull();
  });

  it('ignores a session cookie when one happens to be readable', () => {
    // On localhost the API and this app share a cookie host — cookies ignore the
    // PORT — so the cookie IS visible in development. That accident is why the
    // old gate passed every local test and failed on the first real domain.
    // Behaviour must not depend on it either way.
    const session = { '__Host-oxshare_crm_admin_rt': 'a-refresh-token' };
    expect(redirectTarget(proxy(requestFor('/withdrawals', session)))).toBeNull();
  });
});

describe('content security policy', () => {
  it('is set on every response, which is now the gate’s whole job', () => {
    const csp = proxy(requestFor('/dashboard')).headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
  });

  it('carries a nonce the renderer can stamp onto its inline scripts', () => {
    expect(proxy(requestFor('/login')).headers.get('content-security-policy')).toMatch(
      /script-src[^;]*'nonce-/,
    );
  });
});

describe('matcher', () => {
  const matcher = config.matcher[0];
  // ANCHORED, because Next matches the whole pathname. Testing the pattern
  // unanchored finds it somewhere inside the string and reports that `/api/...`
  // is matched when Next would exclude it — a test that disagrees with the
  // runtime is worse than no test.
  const matches = (path: string) => new RegExp(`^${matcher}$`).test(path);

  it('excludes static assets', () => {
    expect(matches('/oxshare-mark.svg')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
    expect(matches('/_next/static/chunk.js')).toBe(false);
  });

  it('excludes the API rewrite, which the backend authenticates itself', () => {
    expect(matches('/api/admin/auth/me')).toBe(false);
  });

  it('still covers ordinary pages, which is what gets them a CSP', () => {
    expect(matches('/withdrawals')).toBe(true);
    expect(matches('/kyc/builder')).toBe(true);
  });
});
