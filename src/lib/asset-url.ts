/**
 * Turn a file path the API gave us into one a BROWSER can fetch.
 *
 * TWIN of the same path in the sibling app. Behaviour changes belong in both;
 * `scripts/check-twins.sh` compares everything outside the `twin:config` block.
 *
 * ## The bug this exists to fix
 *
 * `POST /admin/payment-methods/logo` answers with `/v1/uploads/payment-logos/…`.
 * That path is correct — but it is correct relative to the API ORIGIN, and this
 * app is served from its own. Putting it straight into an `<img src>` made the
 * browser resolve it against the Next server, which has no `/v1` route, so every
 * uploaded logo 404'd. The upload succeeded, the URL stored fine, and the image
 * was simply missing — the kind of failure that looks like a broken file rather
 * than a broken path.
 *
 * ## Why `/v1` is stripped rather than kept
 *
 * The rewrite in `next.config.ts` is `/api/:path*` → `<API_ORIGIN>/v1/:path*`, so
 * the version segment is ADDED by the proxy. Passing a path that already carries
 * it would produce `/v1/v1/uploads/…`. The root convention states this directly:
 * `/v1` lives in the rewrite destination and nowhere else in a frontend. This
 * function is the one place that knows the API spells it, and it removes it.
 *
 * ## Always the browser base, never `API_BASE_URL`
 *
 * `API_BASE_URL` is `http://localhost:3001` during server rendering, and baking
 * that into an `<img src>` would ship a localhost URL to a real browser. An
 * image is fetched by the BROWSER whether the markup was rendered on the server
 * or not, so the same-origin `/api` path is the correct answer in both cases.
 */

/* twin:config:start */
/** The same-origin prefix `next.config.ts` rewrites to the API. */
const BROWSER_API_BASE = '/api';
/* twin:config:end */

/**
 * `null` in, `undefined` out — so a caller can hand the result straight to an
 * optional `src` prop without deciding what an absent logo means. A stored value
 * that is already absolute (the seeded Whish logo is an https URL on a CDN) is
 * returned untouched: it names its own origin and needs no proxy.
 */
export function assetUrl(stored: string | null | undefined): string | undefined {
  if (!stored) return undefined;

  const trimmed = stored.trim();
  if (trimmed === '') return undefined;

  // Absolute already — an operator-set https URL, or a data: preview. The API's
  // own validator allows only https and its own upload paths, so this is not a
  // hole: it is the branch that carries the first of those through.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;

  // `/v1/uploads/x.png` → `/uploads/x.png`. Anchored, and requiring the slash
  // after it, so a bucket that ever begins with the letters `v1` is untouched.
  const path = trimmed.replace(/^\/v1(?=\/)/, '');

  return `${BROWSER_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
