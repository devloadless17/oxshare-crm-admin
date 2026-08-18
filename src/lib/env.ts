/*
 * THE BROWSER CALLS THE API DIRECTLY. It no longer goes through the `/api`
 * rewrite, and that is a security decision rather than a preference.
 *
 * The rewrite made every call same-origin, so the API's `Set-Cookie` reached the
 * browser through the FRONTEND's host and the session was stored there. The
 * realtime socket cannot use a rewrite — Vercel serves rewrites from serverless
 * functions, which cannot hold a WebSocket open — so it dials the API host
 * directly, found no cookie for that host, and every handshake was refused with
 * only a warning to show for it.
 *
 * Calling the API directly puts the cookie where the socket looks for it, and
 * keeps the session in an httpOnly `__Host-` cookie that JavaScript can never
 * read. The alternative — a token in the handshake — would work under any
 * topology but hands XSS something worth stealing.
 *
 * THE DEPLOYMENT REQUIREMENT THIS CREATES: the frontend and the API must be
 * SIBLING SUBDOMAINS of one registrable domain — `admin.example.com` and
 * `api.example.com`. `SameSite=Lax` sends a cookie on a same-SITE request and
 * withholds it on a cross-site one, and `*.vercel.app` is its own registrable
 * domain, so a Vercel-hosted frontend on the default URL is cross-site from the
 * API and gets no cookie at all. DEPLOYMENT.md states this; it is the one thing
 * that must be true wherever this is hosted.
 */

const DEV_SERVER_BASE_URL = 'http://localhost:3001';

const DEV_REALTIME_ORIGIN = 'http://localhost:3003';

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function requireAbsoluteUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError(
      `${name} must be an absolute URL including the scheme, e.g. https://api.example.com — received "${value}".`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`${name} must use http or https — received "${parsed.protocol}".`);
  }
  return value.replace(/\/+$/, '');
}

export function resolvePublicApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured && configured.trim() !== '') {
    return requireAbsoluteUrl(configured.trim(), 'NEXT_PUBLIC_API_BASE_URL');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ConfigError(
      'NEXT_PUBLIC_API_BASE_URL is required in production. It is the API origin the ' +
        'browser calls directly and the origin the CSP authorises; without it the app ' +
        'would fall back to http://localhost:3001 and either fail at the first request ' +
        'or, worse, reach whatever else is listening on that port.',
    );
  }

  return DEV_SERVER_BASE_URL;
}

function resolveRealtimeOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_ORIGIN;

  if (configured && configured.trim() !== '') {
    return requireAbsoluteUrl(configured.trim(), 'NEXT_PUBLIC_REALTIME_ORIGIN');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ConfigError(
      'NEXT_PUBLIC_REALTIME_ORIGIN is required in production. Without it the app would ' +
        'open its WebSocket against http://localhost:3003 and real-time updates would ' +
        'silently never arrive — which looks exactly like a quiet system.',
    );
  }

  return DEV_REALTIME_ORIGIN;
}

/**
 * The API's own origin — scheme and host, no path. Everything the BROWSER sends
 * to the API derives from this: `API_BASE_URL`, the asset URLs in
 * `asset-url.ts`, and the `connect-src`/`img-src` entries in `csp.ts`. One
 * definition, because a CSP naming a slightly different origin than the code
 * dials blocks the request with no error anyone sees.
 */
export const PUBLIC_API_ORIGIN: string = resolvePublicApiOrigin();

/**
 * `/v1` IS PART OF THIS, and the root convention was amended to say so.
 *
 * The old rule — "never reintroduce /v1 into a frontend base URL" — came from a
 * real incident where the apps called `/api/v1/...` while the rewrite was
 * already adding the segment, so every request 404'd. That rule assumed the
 * rewrite. Calling the API directly removes the thing that used to add the
 * version, so omitting it here would 404 every request for the mirror-image
 * reason. The version belongs wherever the LAST hop before the API is, and that
 * is now this constant.
 */
export const API_BASE_URL: string = `${PUBLIC_API_ORIGIN}/v1`;

export const REALTIME_ORIGIN: string | null = (() => {
  try {
    return resolveRealtimeOrigin();
  } catch (error) {
    console.error(
      `Real-time updates are DISABLED: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
})();

export { ConfigError, requireAbsoluteUrl, resolveRealtimeOrigin };
