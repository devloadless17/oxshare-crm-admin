import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { proxy, config } from './proxy';
import { SESSION_HINT_COOKIE } from './lib/session-hint';

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
 * These tests pin what remains true — a request with no session cookie is never
 * redirected, and every response carries a Content-Security-Policy — and one
 * thing that is new: the `session-hint` MARKER, which this app writes on its own
 * host and which therefore IS readable here.
 *
 * The marker is not a session and decides nothing about access. It moves a
 * visitor between two public screens, and the cases below are mostly about where
 * it must NOT do that.
 */

/** A request the gate can read, with whatever cookies the case needs. */
function requestFor(
  pathname: string,
  cookies: Record<string, string> = {},
  search = '',
): NextRequest {
  return {
    nextUrl: { pathname, search },
    url: `http://localhost:3002${pathname}${search}`,
    headers: new Headers(),
    cookies: {
      get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined),
      // `has`, not only `get`. The real `NextRequest` has both, and the marker
      // check reads presence rather than value — a stub that omits it turns a
      // shape mismatch into a passing test everywhere else in the file.
      has: (name: string) => name in cookies,
    },
  } as unknown as NextRequest;
}

/** A browser that has been signed in on this host. */
const SIGNED_IN_BEFORE = { [SESSION_HINT_COOKIE]: '1' };

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

  /*
   * The marker says "this browser has been signed in", never "this request is
   * authorised". A private route must still be served on it and gated by
   * `/admin/auth/me`, because anybody can write the cookie in a console — if
   * this ever redirects, the gate has been rebuilt on a forgeable signal.
   */
  it('does not gate a private route on the marker, in either direction', () => {
    expect(redirectTarget(proxy(requestFor('/withdrawals', SIGNED_IN_BEFORE)))).toBeNull();
    expect(redirectTarget(proxy(requestFor('/withdrawals')))).toBeNull();
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

describe('the sign-in screen, for a browser that has been signed in', () => {
  /*
   * THE REGRESSION THIS BLOCK EXISTS FOR.
   *
   * `/` used to redirect to `/login` unconditionally, so the URL every operator
   * types was guaranteed to show a sign-in form to somebody who was already
   * signed in — held for a full `/admin/auth/me` round trip before it corrected
   * itself. It reads as having been logged out, and the natural response is to
   * type the password again, which mints a second thirty-day session over the
   * first.
   */
  it('never sends the form to a browser carrying the marker', () => {
    expect(redirectTarget(proxy(requestFor('/login', SIGNED_IN_BEFORE)))).toBe('/dashboard');
  });

  it('returns them to where they were going, not to the dashboard', () => {
    expect(
      redirectTarget(proxy(requestFor('/login', SIGNED_IN_BEFORE, '?next=%2Fwithdrawals'))),
    ).toBe('/withdrawals');
  });

  /*
   * `next` arrives in a URL, so anybody can mail an operator a sign-in link
   * carrying any value at all. Following one unchecked would land them on an
   * attacker's page in the instant they expect to be signed in — and this is a
   * console that approves payouts.
   */
  it('refuses an off-site next, rather than following it', () => {
    expect(
      redirectTarget(
        proxy(requestFor('/login', SIGNED_IN_BEFORE, '?next=https%3A%2F%2Fevil.example%2Fx')),
      ),
    ).toBe('/dashboard');
  });

  /*
   * PUBLIC and AUTH-ONLY are different properties, and collapsing them locks
   * people out. The person following an invitation may be signed in as somebody
   * else on this machine; the person following a reset link is locked out on a
   * device that still holds a stale session cookie (D-44). Redirecting either to
   * the dashboard makes the link they were sent useless, with no way back except
   * clearing cookies by hand.
   */
  it('leaves the invitation and reset screens alone', () => {
    expect(redirectTarget(proxy(requestFor('/invite/accept', SIGNED_IN_BEFORE)))).toBeNull();
    expect(redirectTarget(proxy(requestFor('/reset-password', SIGNED_IN_BEFORE)))).toBeNull();
  });

  /*
   * Whole segments, never a string prefix. `startsWith('/login')` also matches
   * `/login-help`, so a page added later would start redirecting signed-in
   * operators away from it and nobody would connect the two.
   */
  it('matches the sign-in path by segment, not by prefix', () => {
    expect(redirectTarget(proxy(requestFor('/login-help', SIGNED_IN_BEFORE)))).toBeNull();
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

  /*
   * The extension list is a STRING, so its dots need `\\.`, not `\.`.
   *
   * JS drops an unrecognised escape, which turns `\.` into a bare `.` meaning
   * "any character" — and a page whose path merely LOOKS like an asset then
   * falls outside the matcher and ships with no Content-Security-Policy, which
   * is the exact hole the explicit list exists to close. It reads correctly
   * either way, so only an assertion catches it.
   */
  it('excludes an asset by its real dot, not by any character', () => {
    expect(matches('/oxshare-mark.svg')).toBe(false);
    expect(matches('/clientsXsvg')).toBe(true);
    expect(matches('/reportXcsv')).toBe(true);
  });
});
