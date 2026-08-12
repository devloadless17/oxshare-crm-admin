/**
 * Configuration, validated once at module load — PLATFORM-CONVENTIONS R-8.5.
 *
 * TWIN of the same path in the sibling app. Behaviour changes belong in both;
 * `scripts/check-twins.sh` compares everything outside the `twin:config` block.
 *
 * ## What was wrong
 *
 * `client.ts` read the API host as
 *
 *     process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'
 *
 * so a deployment that forgot the variable started perfectly and then talked to
 * localhost. The failure surfaces at the first server-rendered request as a
 * connection refused, far from the missing config that caused it — and in the
 * worse case where something IS listening on 3001, it succeeds against the
 * wrong backend.
 *
 * The backend already refuses to boot on bad config (`src/config/env.validation.ts`,
 * zod). The frontends were the half of that rule nobody had implemented. This
 * closes it in the same shape: state what is required, fail loudly, and fail at
 * startup rather than at first use.
 *
 * ## Why the localhost default is kept in development
 *
 * It is correct there, and it is what makes `npm run dev` work with no `.env` —
 * the three-terminal workflow in the root CLAUDE.md depends on it. What was
 * wrong was applying that convenience to production, where an unset variable is
 * a mistake and not a default. So the fallback survives, scoped to where it is
 * true.
 */

/** In the browser the API is always same-origin: `next.config.ts` rewrites `/api`. */
const BROWSER_BASE_URL = '/api';

/** Only correct in development — see the note above. */
const DEV_SERVER_BASE_URL = 'http://localhost:3001';

/**
 * Where the WebSocket lives, in development only — same reasoning as above.
 *
 * A different PORT from the API, because the realtime engine (uWebSockets.js)
 * owns its own listener. In production it must stay on the same HOSTNAME as the
 * API: cookies ignore the port, but `__Host-` session cookies are host-scoped,
 * so a realtime subdomain would receive no cookie and every handshake would be
 * refused.
 */
const DEV_REALTIME_ORIGIN = 'http://localhost:3003';

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Absolute `http(s)` URL, no trailing slash.
 *
 * A relative value would silently resolve against whatever origin the server
 * happens to render from, which is the same class of "works locally, wrong in
 * production" bug this file exists to prevent. The trailing slash is trimmed
 * because axios joins with a path that already starts with one, and
 * `//admin/auth/login` does not route.
 */
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

function resolveServerBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured && configured.trim() !== '') {
    return requireAbsoluteUrl(configured.trim(), 'NEXT_PUBLIC_API_BASE_URL');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ConfigError(
      'NEXT_PUBLIC_API_BASE_URL is required in production. Without it the server would ' +
        'fall back to http://localhost:3001 and either fail at the first request or, worse, ' +
        'reach whatever else is listening on that port.',
    );
  }

  return DEV_SERVER_BASE_URL;
}

/**
 * The realtime origin, resolved the same way and for the same reason.
 *
 * This one is read in the BROWSER, which is why it must be `process.env.NAME`
 * spelled statically: Next inlines that at build time, and a computed lookup
 * (`process.env[name]`) is not inlined — it would read `undefined` in the
 * browser and silently fall back to localhost in every environment.
 */
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
 * Resolved once, at import.
 *
 * Deliberately not a function called per request: the point is that a
 * misconfigured build fails immediately and visibly, not on the unlucky request
 * that first needs it.
 */
export const API_BASE_URL: string =
  typeof window !== 'undefined' ? BROWSER_BASE_URL : resolveServerBaseUrl();

/**
 * The realtime origin, or `null` when it is not configured.
 *
 * NULL RATHER THAN A THROW, and the asymmetry with `API_BASE_URL` above is
 * deliberate rather than an oversight.
 *
 * `API_BASE_URL` throws because talking to the WRONG backend is dangerous —
 * there is no safe way to carry on. A missing realtime origin is not in that
 * class: both apps keep a slow poll underneath the socket precisely so the bell
 * still works, so the honest response is to turn realtime off, say so loudly,
 * and let the rest of the app run.
 *
 * Throwing here would be far worse than it looks. This constant is evaluated at
 * MODULE SCOPE and this module is imported by the API client, so the exception
 * would land during import — a blank page in the browser and a 500 on every
 * server render, because a notification transport was unset. It would also make
 * the `try/catch` in `csp.ts` unreachable, since the import fails before the
 * function it guards can run.
 */
export const REALTIME_ORIGIN: string | null = (() => {
  try {
    return resolveRealtimeOrigin();
  } catch (error) {
    // Loud, and once, at startup. The variable is named so the fix is obvious.
    console.error(
      `Real-time updates are DISABLED: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
})();

export { ConfigError, requireAbsoluteUrl, resolveServerBaseUrl, resolveRealtimeOrigin };
