import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { proxy, config } from './proxy';

/**
 * The route gate — Next 16's rename of `middleware.ts`.
 *
 * NOTE ON WHAT THIS IS AND IS NOT. The proxy runtime has no signing key, so
 * nothing here can verify a token; this is a redirect HINT, and every route it
 * guards is enforced again by the API, which does verify. A forged cookie buys a
 * rendered shell and a wall of 401s — which is why `admin-layout.tsx` must not
 * render children for a session the server has not confirmed.
 *
 * It had no test at all, which mattered for two properties that are easy to
 * break and silent when broken: matching PUBLIC paths on segment boundaries
 * rather than string prefixes, and gating on the REFRESH cookie rather than the
 * access cookie.
 */

/** A request the gate can read, with whatever cookies the case needs. */
function requestFor(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3002${pathname}`,
    cookies: {
      get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined),
    },
  } as unknown as NextRequest;
}

const SESSION = { oxshare_crm_admin_rt: 'a-refresh-token' };
const PREFIXED_SESSION = { '__Host-oxshare_crm_admin_rt': 'a-refresh-token' };

/** Where a NextResponse says it is going, or null when it is passing through. */
function redirectTarget(res: ReturnType<typeof proxy>): string | null {
  const location = res.headers.get('location');
  return location ? new URL(location).pathname : null;
}

describe('signed out', () => {
  it('redirects a private route to /login', () => {
    expect(redirectTarget(proxy(requestFor('/withdrawals')))).toBe('/login');
  });

  it('lets /login through', () => {
    expect(redirectTarget(proxy(requestFor('/login')))).toBeNull();
  });

  it('lets /invite/accept through — the invitee has no session yet', () => {
    expect(redirectTarget(proxy(requestFor('/invite/accept')))).toBeNull();
  });

  it('redirects /invite itself, which is the admin-side create screen', () => {
    // `/invite` and `/invite/accept` are different pages with opposite
    // requirements, and a string-prefix match would have made both public.
    expect(redirectTarget(proxy(requestFor('/invite')))).toBe('/login');
  });

  it('does NOT treat /login-help as public', () => {
    // The bug segment matching exists to prevent: `startsWith('/login')` also
    // admits this, so adding an innocuous route later would silently make it
    // unauthenticated.
    expect(redirectTarget(proxy(requestFor('/login-help')))).toBe('/login');
  });

  it('does NOT treat /invite/accept-anything as public', () => {
    expect(redirectTarget(proxy(requestFor('/invite/accept-all')))).toBe('/login');
  });
});

describe('signed in', () => {
  it('lets a private route through when the refresh cookie is present', () => {
    expect(redirectTarget(proxy(requestFor('/withdrawals', SESSION)))).toBeNull();
  });

  it('accepts the __Host- prefixed name, which is what TLS deployments set', () => {
    // The cookie NAME changes once the deployment has HTTPS (session-cookies.ts).
    // Reading only the bare name would log every production admin out.
    expect(redirectTarget(proxy(requestFor('/withdrawals', PREFIXED_SESSION)))).toBeNull();
  });

  it('gates on the REFRESH cookie, not the access cookie', () => {
    /*
     * The access token lives 15 minutes and the refresh token 30 days. Gating on
     * the access cookie would bounce an admin who came back from lunch to the
     * login screen while their perfectly valid session sat in the browser,
     * ready to renew on the page's first request.
     */
    const accessOnly = { oxshare_crm_admin_at: 'an-access-token' };
    expect(redirectTarget(proxy(requestFor('/withdrawals', accessOnly)))).toBe('/login');
  });
});

describe('matcher', () => {
  const matcher = config.matcher[0];
  // ANCHORED, because Next matches the whole pathname. Testing the pattern
  // unanchored finds it somewhere inside the string and reports that `/api/...`
  // is matched when Next would exclude it — a test that disagrees with the
  // runtime is worse than no test.
  const matches = (path: string) => new RegExp(`^${matcher}$`).test(path);

  it('excludes static assets, so a signed-out load still gets the logo', () => {
    // A redirect here returned HTML where the browser expected an SVG, and
    // next/image answered 400 for the same reason. It only reproduced on a cold
    // signed-out load, which is why it survived so long.
    expect(matches('/oxshare-mark.svg')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
    expect(matches('/_next/static/chunk.js')).toBe(false);
  });

  it('excludes the API rewrite, which the backend authenticates itself', () => {
    expect(matches('/api/admin/auth/me')).toBe(false);
  });

  it('still covers ordinary pages', () => {
    expect(matches('/withdrawals')).toBe(true);
    expect(matches('/kyc/builder')).toBe(true);
  });
});
