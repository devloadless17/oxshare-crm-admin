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
 * Unchanged by the move to direct calls, for the same arithmetic: the base now
 * ENDS with the version (`https://api.example.com/v1`) where it used to be added
 * by the proxy, so a stored value that already carries the segment would still
 * produce `/v1/v1/uploads/…`. Strip it here, add it once in the base.
 *
 * ## Why `API_BASE_URL` is now the right source
 *
 * This deliberately used a same-origin `/api` prefix, because `API_BASE_URL` was
 * `http://localhost:3001` during server rendering and baking that into an
 * `<img src>` would ship a localhost URL to a real browser.
 *
 * That hazard is gone: `API_BASE_URL` derives from `NEXT_PUBLIC_API_BASE_URL`,
 * which is required in production and identical on the server and in the client
 * bundle — there is no longer a context where it means something private. Using
 * it is now the SAFER choice, because an image and an API call resolve the API
 * from one constant instead of two that can drift.
 */

/* twin:config:start */
/**
 * The API's own origin plus the version — the SAME value the axios client uses,
 * imported rather than rewritten, so an asset and an API call can never disagree
 * about where the API is.
 *
 * This was `/api`, a same-origin path the rewrite forwarded. It cannot stay that
 * way: a KYC document is an AUTHENTICATED read, and the session cookie now
 * belongs to the API's host, so a request routed through the frontend's origin
 * arrives with no cookie and is refused. The browser must ask the API directly,
 * which it may because both hosts are siblings under one registrable domain —
 * see the deployment requirement in `env.ts`.
 */
import { API_BASE_URL } from './env';

const BROWSER_API_BASE = API_BASE_URL;
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
