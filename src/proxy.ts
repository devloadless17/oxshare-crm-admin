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
  // httpOnly cookies ARE sent to the server, and this runs server-side, so the
  // gate is unaffected by R-3.2 — only the NAME changed. Both spellings are
  // accepted because the `__Host-` prefix appears only where TLS makes it valid
  // (see the backend's common/security/session-cookies.ts).
  const token =
    request.cookies.get('__Host-oxshare_crm_admin_at')?.value ??
    request.cookies.get('oxshare_crm_admin_at')?.value;

  if (!isPublic && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
