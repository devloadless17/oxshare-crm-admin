import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
