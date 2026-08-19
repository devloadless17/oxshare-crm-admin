/**
 * "This browser probably has a session" — the cheap, early answer the proxy and
 * the first server render are allowed to have.
 *
 * ## Why this exists
 *
 * `src/proxy.ts` records at length why it cannot read the session: the refresh
 * cookie is set by the API's host with a `__Host-` prefix and no `Domain`, so
 * the browser locks it to that host and never sends it to this one. Its comment
 * ends with the only safe way to give this host something to read:
 *
 *   > a separate, non-sensitive marker set with `Domain=` on the shared parent
 *   > domain, never the session cookie itself, which must keep `__Host-`.
 *
 * This is that marker, with one simplification: nothing on the API side has to
 * set it, because it is written by THIS app on THIS host from JavaScript. It is
 * a mirror of the last authoritative answer `/admin/auth/me` gave — set when
 * that call says "signed in", cleared when it says "signed out".
 *
 * ## What it is NOT
 *
 * It is not a credential, not a claim, and not an authorisation. Anyone can set
 * it with one line in a console, and doing so buys exactly one wasted hop:
 * `/` sends them to /dashboard, the layout's gate asks `/admin/auth/me`, the API
 * answers 401 and they land back on the sign-in screen with the marker cleared.
 * Nothing downstream trusts it — every private byte still comes from an endpoint
 * that verifies a signature, and every permission is still checked server-side.
 *
 * So the rule that governs it is: this value may only ever decide **what to
 * paint while the real answer is in flight**. The moment it is used to decide
 * whether somebody MAY see something, it has become a forgeable gate — which is
 * exactly the failure `proxy.ts` was stripped down to avoid.
 *
 * ## What it buys
 *
 * `app/page.tsx` was an unconditional `redirect('/login')`, so typing the bare
 * host or clicking a `/` bookmark landed a signed-in operator on a sign-in form
 * and moved them off it a round trip later. Being logged out is what that looks
 * like, and on a console this is also the screen where somebody's instinct is to
 * type their password again — minting a second thirty-day session over the first.
 *
 * The obvious fix — always hold the paint on the sign-in screen until
 * `/admin/auth/me` answers — was rejected in `redirect-if-authenticated.tsx` for
 * a good reason that still stands: almost everybody who loads that page has no
 * session, and making all of them watch a spinner to spare the few is the wrong
 * trade. The marker is what lets both cases be right, because it says which one
 * this is before any request is made.
 *
 * ## Why it is deliberately unprefixed
 *
 * `__Host-` would stop a sibling OxShare host writing it, and that is the right
 * call for the CSRF cookie. It is not worth it here: the prefix requires
 * `Secure`, which plain-HTTP localhost cannot satisfy, so it would mean two
 * spellings and two readers — including one inside the edge proxy — to defend a
 * value whose worst-case forgery is a redirect that corrects itself.
 *
 * The NAME is per-app all the same. Cookies ignore the port, so on localhost the
 * console (:3002) and the client portal (:3000) share one jar; a shared name
 * would mean signing into one app telling the other it had a session.
 */
export const SESSION_HINT_COOKIE = 'oxshare_crm_admin_session_hint';

/**
 * Matched to the REFRESH cookie's thirty days, not to the access token's fifteen
 * minutes.
 *
 * The marker answers "could this browser still resume a session", and that is
 * the refresh token's question. Expiring it in fifteen minutes would put the
 * sign-in flash back for every operator who left the tab and came back — which
 * is the exact case this exists for.
 */
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * Written with `document.cookie` rather than through `js-cookie`, because
 * `src/proxy.ts` imports the name from this module and runs in the edge runtime.
 * Keeping the file dependency-free means the proxy bundle does not grow a cookie
 * library to read one string.
 */
export function markSessionHint(): void {
  if (typeof document === 'undefined') return;
  // `Secure` only where the page is already on TLS — localhost is plain HTTP in
  // development, and a `Secure` cookie there is silently dropped, which would
  // make this whole mechanism a no-op in the one environment it is developed in.
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${THIRTY_DAYS_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Cleared on every path a session ends by — `clearAdminSession`, `logout`, and
 * the cross-tab `signed-out` broadcast — so that "this session is over" means
 * the same thing however it ended.
 *
 * A stale marker is self-correcting but not free: it costs the next visitor one
 * redirect to /dashboard and back, and on a shared back-office machine that hop
 * paints the console's loading state to somebody who never signed in.
 */
export function clearSessionHint(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * THERE IS NO BROWSER-SIDE READER HERE, deliberately.
 *
 * The read happens in `app/layout.tsx` with `cookies()` — SERVER-side — and the
 * value travels down as a prop. A client component reading `document.cookie`
 * instead renders `false` during SSR and `true` after hydration, so the sign-in
 * form ships inside the HTML and is swapped out a frame later. Painting it for
 * one frame instead of one round trip is a smaller version of the bug, not a fix
 * for it — which is why a `hasSessionHint()` helper is missing rather than
 * merely unused.
 */
