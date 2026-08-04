import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/invite/accept'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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
