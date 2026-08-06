/**
 * "Where was this client trying to go", encoded into a URL and decoded safely.
 *
 * NOT a route guard. Route gating — which paths are public, which are private,
 * who gets redirected where — lives entirely in `src/proxy.ts` and nowhere else.
 * This module answers a narrower question that four unrelated places all need to
 * answer identically:
 *
 *   proxy.ts                    writes `?next=` when it bounces a visitor
 *   auth/login/page.tsx         reads it after a successful sign-in
 *   components/auth/*           reads it when the client gate redirects
 *   lib/api/client.ts           writes it when a session dies mid-request
 *
 * `proxy.ts` cannot be the home for it, because it imports `next/server` and is
 * compiled for the edge runtime — importing it from a client component would
 * drag the middleware into the browser bundle. So the encoding lives here, and
 * the routing decisions live there.
 *
 * The reason it is a module at all rather than four inline snippets is the
 * `safeReturnTo` half. That is an open-redirect check, and an open-redirect
 * check that exists in four slightly different copies is an open redirect.
 */

/**
 * The sign-in screen.
 *
 * Unlike the portal, this console has no `/auth/*` segment and no redirect
 * stubs — `/login` IS the page. That is the only shape difference between this
 * module and its twin; everything below is deliberately identical, because the
 * half that matters is an open-redirect check and a check that exists in two
 * slightly different copies is an open redirect.
 */
export const LOGIN_PATH = '/login';

/** Where a client with a live session belongs when they asked for nothing in particular. */
export const DEFAULT_SIGNED_IN_PATH = '/dashboard';

/** The query parameter carrying where the visitor was trying to go. */
export const RETURN_TO_PARAM = 'next';

/**
 * Destinations that are same-origin and still wrong to return to.
 *
 * Signing in and being delivered back to the sign-in page is a loop the client
 * cannot break out of. Listed here rather than imported from proxy.ts because
 * this module must stay free of edge-runtime imports; the overlap is four short
 * strings, and the two lists answer different questions — proxy.ts asks "may a
 * signed-out visitor see this", this asks "is this a sane place to land".
 */
const NEVER_RETURN_TO = [
  '/login',
  /*
   * `/invite/accept` is same-origin and still wrong to land on. The token has
   * been consumed by the time anyone is signed in, so returning there shows a
   * dead invite screen to somebody who just successfully became an admin.
   */
  '/invite/accept',
];

/**
 * The sign-in URL that remembers where the visitor was going.
 *
 * Landing every bounced client on /dashboard threw away their intent: an operator
 * who followed a link to a specific KYC submission signed in and
 * then had to navigate there again. On a session that has quietly expired —
 * which is the common case, not the rare one — that happens mid-task.
 *
 * The root is excluded because there is nothing to return to: `/` is itself a
 * routing decision, and round-tripping it would send a freshly signed-in client
 * back to a redirect.
 */
export function loginPathFor(pathname: string, search = ''): string {
  if (!pathname || pathname === '/') return LOGIN_PATH;
  return `${LOGIN_PATH}?${RETURN_TO_PARAM}=${encodeURIComponent(`${pathname}${search}`)}`;
}

/**
 * The `next` parameter, made safe to navigate to — or the dashboard.
 *
 * This value comes out of a URL, so it is attacker-controlled even though we
 * are the ones who put it there: anybody can send a client a link to
 * `/auth/login?next=https://evil.example/login`, and a portal that redirects
 * there after a successful sign-in has handed over a phishing page wearing our
 * own flow. That is a textbook open redirect, and it is worth more here than on
 * most sites, because the page the victim arrives at is the one they reach in
 * the instant after typing their password.
 *
 * Resolved through `URL` against an opaque base rather than pattern-matched,
 * because the browser's own parser is the authority on what a string navigates
 * to and hand-rolled checks keep losing to it. `//evil.example` is
 * protocol-relative, `/\evil.example` is treated as `//` by every browser, and
 * `\/\/evil.example` is too. One parse settles all of them: if the resolved
 * origin is not the opaque base, the string was never same-origin.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback: string = DEFAULT_SIGNED_IN_PATH,
): string {
  if (!raw) return fallback;

  // Control characters never appear in a path we generated, and they are the
  // raw material for response-splitting and for hiding a real target from a
  // human reading the link.

  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  const BASE = 'https://admin.invalid';
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  if (url.pathname === '/') return fallback;
  const loops = NEVER_RETURN_TO.some(
    (entry) => url.pathname === entry || url.pathname.startsWith(`${entry}/`),
  );
  if (loops) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
