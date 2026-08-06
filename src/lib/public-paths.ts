/**
 * Which console paths a visitor may reach without a session.
 *
 * ONE list, two readers — `src/proxy.ts`, which gates requests before any
 * JavaScript runs, and `src/lib/api/client.ts`, which decides whether a dead
 * session should be evicted to the sign-in screen.
 *
 * ## Why it lives here rather than in either of them
 *
 * `client.ts` needed to answer "is the page I am on public?" and had no way to
 * ask, so it used a proxy for the question: *does the CSRF cookie exist* — on
 * the reasoning that the cookie is set and cleared alongside the session, so its
 * absence means nobody was ever signed in.
 *
 * That reasoning is wrong in two situations, and both are ordinary:
 *
 *  - The CSRF cookie lives **8 hours** while the refresh cookie lives **30
 *    days**, so a returning admin routinely holds one and not the other. If
 *    their session has also died, the eviction is suppressed and the console
 *    renders a spinner with no error and no way out — forever.
 *  - Signing out in one tab clears the CSRF cookie **for the whole browser**, so
 *    every other tab concludes nobody was signed in and keeps rendering the
 *    console, indefinitely, on a machine the operator has walked away from.
 *
 * The portal's copy of that heuristic carries an objection to fixing it with a
 * path list: a second list "would have to be kept in step with proxy.ts", and a
 * page added to one and not the other fails the same way again. That objection
 * is right, and it is an argument against a SECOND list — not against this one,
 * which is the first and only. `proxy.ts` imports it too, so there is nothing to
 * keep in step.
 *
 * It cannot live in `proxy.ts` itself: that file imports `next/server` and is
 * compiled for the edge runtime, so importing it from a client component would
 * pull the middleware into the browser bundle.
 */

/**
 * Reachable with no session.
 *
 * `/invite/accept` in particular MUST be here: the whole point is that the
 * person following the emailed link does not have an account yet.
 */
export const PUBLIC_PATHS = [
  '/login',
  '/invite/accept',
  /*
   * `/reset-password` for the same reason — DECISIONS D-44. The person
   * following the link is an administrator who CANNOT sign in; that is the
   * entire premise. Gating it would make every reset link undeliverable, and it
   * would do so silently, since the redirect looks like a working login page.
   */
  '/reset-password',
] as const;

/**
 * Public by whole path SEGMENTS, never by string prefix.
 *
 * `pathname.startsWith('/login')` also matches `/login-help`, `/logins` and
 * anything else beginning with those characters — so adding an innocuous route
 * later could silently make it unauthenticated. Matching on a segment boundary
 * means only `/login` and `/login/...` qualify, which is what the list is meant
 * to say.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
