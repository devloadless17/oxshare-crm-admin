import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from '@/lib/csp';

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
 */
export function proxy(request: NextRequest) {
  return withCsp(request);
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
