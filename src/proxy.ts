import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from '@/lib/csp';
import { DEFAULT_SIGNED_IN_PATH, RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';
// The single definition of "a screen that exists only for signed-out people",
// shared with lib/api/client.ts. Never a bare string prefix — see the file.
import { isAuthOnlyPath } from '@/lib/public-paths';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';

/**
 * CSP only. THE SESSION GATE THAT USED TO LIVE HERE COULD NOT WORK.
 *
 * ── Why it was removed ──────────────────────────────────────────────────────
 *
 * This function ran on the FRONTEND host (`admin.example.com`) and read
 * `__Host-oxshare_crm_admin_rt` off the incoming request. That cookie is set by
 * the API host (`api.example.com`), and `session-cookies.ts` sets it with no
 * `domain` and a `__Host-` prefix — "deliberately and permanently", because a
 * `Domain` attribute is the only way a CRM cookie could reach another OxShare
 * site. The `__Host-` prefix is the browser ENFORCING that: such a cookie is
 * locked to the exact host that set it.
 *
 * So the cookie is stored under the API's host and is never sent to this one.
 * The gate read `undefined` for every request from a perfectly valid session,
 * and bounced every private route to `/login?next=…`. Signing in succeeded, the
 * session cookie was set, `GET /admin/auth/me` returned the admin — and the
 * navigation to `/dashboard` was redirected straight back to the login screen.
 *
 * ── Why it looked fine in development ───────────────────────────────────────
 *
 * COOKIES IGNORE THE PORT. On localhost the API (:3001) and this app (:3002)
 * are the same cookie host, so the gate saw the cookie and worked. Only a
 * deployment on real, distinct hostnames separates them — which is why this
 * survived every local test and failed on the first real domain.
 *
 * Note this is a consequence of the browser calling the API DIRECTLY rather
 * than through the `/api` rewrite; `lib/env.ts` documents why that call had to
 * become direct (the realtime socket cannot go through a rewrite). Under a
 * same-origin rewrite the cookie did land on this host. It no longer does.
 *
 * ── What enforces access now ────────────────────────────────────────────────
 *
 * What always did. This was only ever a redirect hint — every route it guarded
 * is enforced again by the API, which verifies signatures rather than presence.
 * The eviction path is `endDeadSession` in `lib/api/client.ts`: a 401 clears the
 * session and hard-navigates to `loginPathFor(pathname, search)`, carrying the
 * destination exactly as this gate used to. A signed-out visitor to a private
 * route now loads the shell, gets a 401 on the first call, and lands on
 * `/login?next=…`.
 *
 * DO NOT reinstate a cookie check here without first giving this host a cookie
 * to read. That means a separate, non-sensitive marker set with `Domain=` on the
 * shared parent domain — never the session cookie itself, which must keep
 * `__Host-`.
 *
 * ── That marker now exists, and this file reads it ──────────────────────────
 *
 * `lib/session-hint.ts`. It is written by THIS app on THIS host from JavaScript
 * whenever `/admin/auth/me` answers "signed in", so nothing about it depends on
 * the API's cookie domain and every paragraph above still holds — the session
 * cookie is still invisible here and still must be.
 *
 * What it is allowed to decide is bounded, and the boundary is the point: it
 * moves a visitor between two PUBLIC screens, and never decides whether somebody
 * may see a private one. Reinstating the old gate on top of it would be the
 * original bug wearing a new cookie — a marker any visitor can write is not an
 * authorisation, and on a console that approves payouts the difference is not
 * academic. Access is still decided by `/admin/auth/me` and by the API, which
 * verify a signature rather than the presence of a string.
 *
 * It is here rather than only in `app/page.tsx` because `/login` needs it too: a
 * signed-in operator following a bookmark to the sign-in screen should never be
 * sent the form at all, and answering that in the proxy means no HTML for it is
 * ever generated.
 */
export function proxy(request: NextRequest) {
  const decision = decideRoute(
    request.nextUrl.pathname,
    hasSessionHint(request),
    request.nextUrl.search,
  );

  return decision.allow
    ? withCsp(request)
    : withCsp(request, NextResponse.redirect(new URL(decision.redirectTo, request.url)));
}

export type GuardDecision = { allow: true } | { allow: false; redirectTo: string };

const ALLOW: GuardDecision = { allow: true };

/**
 * NOT the session — see the note above and lib/session-hint.ts.
 *
 * Everything it decides is cosmetic: which of two public screens to send a
 * visitor to. Forging it buys one redirect to /dashboard, where the console
 * layout asks the API, gets a 401, clears this marker and sends them back.
 */
function hasSessionHint(request: NextRequest): boolean {
  return request.cookies.has(SESSION_HINT_COOKIE);
}

/**
 * PURE, and it takes the marker as an argument rather than reading a cookie, so
 * every branch is a table test rather than something you find by clicking.
 *
 * The site ROOT is handled by `app/page.tsx`, which reads the same cookie and
 * shares the same two constants; this covers the sign-in screen, which a
 * bookmark or a stale link reaches directly.
 *
 * `isAuthOnlyPath`, not `isPublicPath`. The difference is the whole reason
 * public-paths.ts now keeps two lists: `/invite/accept` and `/reset-password`
 * must work WITH a session — the person following an invitation may be signed in
 * as somebody else, and recovery runs from the device that still holds a stale
 * cookie. Redirecting those to the dashboard makes an invitation undeliverable
 * and a reset link useless.
 *
 * `?next=` is honoured, through `safeReturnTo`: an operator who followed a link
 * to /withdrawals, was bounced here, and turns out to still be signed in belongs
 * at /withdrawals rather than at the dashboard. The value arrives in a URL, so it
 * is attacker-supplied and is never navigated to unchecked.
 */
export function decideRoute(pathname: string, hasHint: boolean, search = ''): GuardDecision {
  if (hasHint && isAuthOnlyPath(pathname)) {
    const next = new URLSearchParams(search).get(RETURN_TO_PARAM);
    return { allow: false, redirectTo: safeReturnTo(next, DEFAULT_SIGNED_IN_PATH) };
  }
  return ALLOW;
}

/**
 * Attaches the per-request `script-src` nonce — see lib/csp.ts.
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
   * Still meaningful with the session gate gone: this decides which responses
   * get a Content-Security-Policy. A path that skips the matcher ships with no
   * CSP at all.
   *
   * The trailing exclusion names ASSET EXTENSIONS rather than "any path with a
   * dot in it". It was `.*\.[\w]+$`, which excludes every path ending in
   * `.something` — so a dynamic segment carrying a dot (`/clients/foo.bar`,
   * `/kyc/user@example.com`) skipped `withCsp()` entirely, shipping a response
   * with no policy. Low impact while ids are UUIDs, and a hole keyed on
   * user-supplied data either way.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|txt|xml|json|webmanifest|woff|woff2|ttf|otf|eot|map|mp4|webm|pdf|csv)$).*)',
  ],
};
