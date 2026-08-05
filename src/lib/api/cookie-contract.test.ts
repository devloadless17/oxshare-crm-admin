import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import type { NextRequest } from 'next/server';
import { CSRF_COOKIE_NAMES, CSRF_HEADER } from './client';

/**
 * The cookie names this app hardcodes, pinned from THIS side.
 *
 * They are literals because the backend is a separate repository with no shared
 * package — there is nothing to import. The backend pins the same values in
 * `test/cookie-contract.spec.ts`, so a rename fails on whichever side made it,
 * with a list of the files that must change together.
 *
 * Why it matters more than it looks: renaming a cookie compiles, passes every
 * type check (a cookie name is in no response body, so the generated OpenAPI
 * types cannot see it) and then logs every admin out with no error pointing at
 * the cause. The route gate stops seeing a session and every write comes back
 * 403 "failed anti-forgery validation".
 */

function requestWith(cookies: Record<string, string>): NextRequest {
  return {
    nextUrl: { pathname: '/withdrawals' },
    url: 'http://localhost:3002/withdrawals',
    cookies: {
      get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined),
    },
  } as unknown as NextRequest;
}

const admitted = (cookies: Record<string, string>) =>
  proxy(requestWith(cookies)).headers.get('location') === null;

describe('the session cookie the route gate reads', () => {
  it('is the admin REFRESH cookie, bare spelling', () => {
    expect(admitted({ oxshare_crm_admin_rt: 'x' })).toBe(true);
  });

  it('is the admin refresh cookie, __Host- spelling', () => {
    // The name gains this prefix once the deployment has TLS. Reading only the
    // bare spelling would work locally and log out every production admin.
    expect(admitted({ '__Host-oxshare_crm_admin_rt': 'x' })).toBe(true);
  });

  it('is NOT the portal cookie — the two surfaces are separate sessions (R-3.1)', () => {
    // Cookies ignore the port, so on localhost both apps share one jar. Reading
    // the wrong name here would let a signed-in client walk into the admin app's
    // shell.
    expect(admitted({ oxshare_crm_portal_rt: 'x' })).toBe(false);
  });

  it('is NOT the access cookie', () => {
    expect(admitted({ oxshare_crm_admin_at: 'x' })).toBe(false);
  });
});

describe('the CSRF cookie this app reads', () => {
  it('is named for the ADMIN surface, prefixed spelling first', () => {
    // Preference order matters: if both somehow exist, the `__Host-` one is the
    // only one a sibling oxshare.com site could not have written.
    expect(CSRF_COOKIE_NAMES).toEqual(['__Host-oxshare_crm_admin_csrf', 'oxshare_crm_admin_csrf']);
  });

  it('sends the header the API expects', () => {
    // Express lower-cases it on arrival; the backend constant is
    // `x-oxshare-csrf`, which is the same header and looks like a mismatch.
    expect(CSRF_HEADER).toBe('X-OxShare-CSRF');
  });
});
