import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loginPathFor } from '@/lib/return-to';
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from '@/lib/csp';

const PUBLIC_PATHS = ['/login', '/invite/accept'];

/**
 * Public by whole path segments, never by string prefix.
 *
 * `pathname.startsWith('/login')` also matches `/login-help`, `/logins` and
 * anything else that happens to begin with those characters — so adding an
 * innocuous route later could silently make it unauthenticated. Matching on a
 * segment boundary means only `/login` and `/login/...` qualify, which is what
 * the list is meant to say.
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);
  /*
   * Gated on the REFRESH cookie, not the access cookie.
   *
   * httpOnly cookies are still sent to the server, so R-3.2 changed nothing
   * here. R-3.3 did: the access token now lives 15 minutes rather than 8 hours,
   * so gating on it would bounce a user who came back from lunch to the login
   * screen — while their 30-day refresh token sat there, perfectly valid, ready
   * to renew the session on the first request the page made.
   *
   * The refresh cookie is what actually means "a session exists". This is a
   * redirect hint either way: every route it guards is enforced again by the
   * API, which verifies signatures rather than presence.
   */
  const session =
    request.cookies.get('__Host-oxshare_crm_admin_rt')?.value ??
    request.cookies.get('oxshare_crm_admin_rt')?.value;

  if (!isPublic && !session) {
    /*
     * Carry where they were going.
     *
     * Landing every bounced operator on /dashboard threw away their intent:
     * somebody following a link to a specific KYC submission, or a bookmarked
     * client, signed in and then had to find it again. On a session that has
     * quietly expired — the common case, not the rare one — that happens
     * mid-task. The portal has done this for a while; this console did not.
     *
     * The query string travels with it, so filters and paging survive too.
     * `safeReturnTo` on the other end is what makes reading it back safe.
     */
    return withCsp(
      request,
      NextResponse.redirect(
        new URL(loginPathFor(request.nextUrl.pathname, request.nextUrl.search), request.url),
      ),
    );
  }
  return withCsp(request);
}

/**
 * Attaches the per-request `script-src` nonce — see lib/csp.ts.
 *
 * Every return path goes through this, including the redirect: a response
 * without the header would fall back to no `script-src` at all, and the one
 * page an unauthenticated visitor definitely loads is `/login`.
 *
 * The nonce is set on the REQUEST headers as well, because that is how Next's
 * renderer learns to stamp it onto the inline bootstrap and hydration scripts it
 * emits. Setting it only on the response would produce a strict policy and a
 * blank page.
 */
function withCsp(request: NextRequest, response?: NextResponse): NextResponse {
  const nonce = createNonce();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);

  const res = response ?? NextResponse.next({ request: { headers: requestHeaders } });
  if (response) response.headers.set(NONCE_HEADER, nonce);

  // The WHOLE policy, from one place. Merging with a header set in
  // next.config.ts does not work — config headers are applied after middleware
  // and replace it — and the failure is silent: the response goes out with
  // script-src alone and no default-src at all.
  res.headers.set(
    'Content-Security-Policy',
    contentSecurityPolicy(nonce, process.env.NODE_ENV === 'production'),
  );
  return res;
}

export const config = {
  /*
   * Everything except Next's internals, the API rewrite, and STATIC FILES.
   *
   * The last exclusion was missing, and it is why the logo rendered as a broken
   * image on the sign-in screen: `/oxshare-mark.svg` is not a public PATH, so an
   * unauthenticated request for it was redirected to /login. The browser got an
   * HTML redirect where it expected an SVG. `next/image` failed the same way one
   * level down — the optimizer fetches the source itself, got the redirect, and
   * answered 400.
   *
   * It hid well: anyone with a live session loaded the asset normally, and a
   * cached copy survived logging out, so it only appeared on a genuinely cold
   * signed-out load.
   *
   * The trailing pattern excludes any path with a file extension. Gating a
   * static asset behind a session was never the intent — nothing under
   * `public/` is private, and anything that ever is belongs behind an
   * authenticated route handler like the KYC uploads controller, not behind a
   * redirect that returns HTML.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.[\\w]+$).*)'],
};
