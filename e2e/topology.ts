/**
 * WHICH TOPOLOGY THIS RUN DRIVES — and the one reason a second topology exists.
 *
 * Locally the app and the API are both `localhost`, and cookies ignore the
 * port: the API's session and CSRF cookies are readable by the app, the
 * app's server can forward them, and a whole class of bug is invisible. In
 * production the app and the API are DIFFERENT hostnames (same site, different
 * host), the API's cookies are `__Host-` bound to the API, and anything that
 * read them from the app — a refresh timer, a "was I signed in?" check, a
 * server-side cookie forward — silently stops working. That is exactly the
 * class that took the proactive refresh and the KYC route gate down in
 * production while every local run stayed green.
 *
 * `E2E_TOPOLOGY=crosshost` reproduces the production property on one machine:
 *
 *   portal  http://portal.crm.localhost:PORTAL_PORT
 *   admin   http://admin.crm.localhost:ADMIN_PORT
 *   API     http://api.crm.localhost:API_PORT    (a SECOND backend: `npm run dev:crosshost`)
 *
 * Third-level labels under `.localhost`, on purpose: `localhost` is not on the
 * public-suffix list, so the fallback rule makes the LAST label the suffix and
 * `admin.localhost` / `api.localhost` would be different SITES — Lax cookies
 * would be withheld on every request. `*.crm.localhost` share the registrable
 * domain `crm.localhost`: same site (cookies ride), different host (nothing on
 * the app host can read them). Chromium resolves any depth of `*.localhost` to
 * loopback with no DNS; NODE DOES NOT, which is why everything Node dials —
 * `context.request`, the setup probe, the app's own server-side calls — keeps
 * plain `localhost` (`E2E_API_NODE_ORIGIN`, `API_BASE_URL`).
 *
 * Distinct ports from the localhost stack, so both can be up at once.
 *
 * Imported FIRST by helpers.ts and by playwright.config.ts, because the
 * constants in helpers.ts read these variables at import time and Playwright
 * hands its own environment to the dev server it starts and to every worker.
 * `??=` so an explicit variable always wins.
 */
export const CROSS = process.env.E2E_TOPOLOGY === 'crosshost';

const PORTS = CROSS
  ? { portal: 3010, admin: 3012, api: 3011, realtime: 3013 }
  : { portal: 3000, admin: 3002, api: 3001, realtime: 3003 };
const HOSTS = CROSS
  ? { portal: 'portal.crm.localhost', admin: 'admin.crm.localhost', api: 'api.crm.localhost' }
  : { portal: 'localhost', admin: 'localhost', api: 'localhost' };

export const TOPOLOGY = {
  portalOrigin: `http://${HOSTS.portal}:${PORTS.portal}`,
  adminOrigin: `http://${HOSTS.admin}:${PORTS.admin}`,
  /** What the BROWSER dials for the API. */
  apiOrigin: `http://${HOSTS.api}:${PORTS.api}`,
  /** What NODE dials for the API (the same server, by a name Node resolves). */
  apiNodeOrigin: `http://localhost:${PORTS.api}`,
  realtimeOrigin: `http://${HOSTS.api}:${PORTS.realtime}`,
  ports: PORTS,
} as const;

const defaults: Record<string, string> = {
  E2E_ADMIN_ORIGIN: TOPOLOGY.adminOrigin,
  E2E_PORTAL_ORIGIN: TOPOLOGY.portalOrigin,
  E2E_API_ORIGIN: TOPOLOGY.apiOrigin,
  E2E_API_NODE_ORIGIN: TOPOLOGY.apiNodeOrigin,
  E2E_BASE_URL: TOPOLOGY.adminOrigin,
  // For the dev server Playwright starts: what its BROWSER bundle dials.
  NEXT_PUBLIC_API_BASE_URL: TOPOLOGY.apiOrigin,
  NEXT_PUBLIC_REALTIME_ORIGIN: TOPOLOGY.realtimeOrigin,
  // …and what its SERVER dials (the /api rewrite), by a name Node resolves.
  API_BASE_URL: TOPOLOGY.apiNodeOrigin,
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
