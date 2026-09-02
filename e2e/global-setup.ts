/**
 * Fail fast, and say what to start.
 *
 * The portal is started by `webServer`, but the API is not — it needs Postgres,
 * and starting the whole stack from here would make a database problem look like
 * a failing test. Without this check the first spec instead times out waiting
 * for a page that will never load, and the report says "expected to see Sign in"
 * rather than "the backend is not running".
 *
 * One request, before any browser opens, with a sentence naming the fix.
 */
const API_HEALTH = `${TOPOLOGY.apiNodeOrigin}/health`;

import { CROSS, TOPOLOGY } from './topology';

/**
 * Cross-host mode needs a SECOND backend, started with the cross-host origins
 * in its CORS allowlist (`npm run dev:crosshost` in oxshare-crm-backend). The
 * API's CORS echo is the cheapest proof that it is that backend and not the
 * ordinary one: without it the whole run would fail thirty tests later with a
 * wall of 401s that read as "sessions are broken".
 */
async function assertCrossHostBackend(appOrigin: string): Promise<void> {
  if (!CROSS) return;
  const probe = `${TOPOLOGY.apiNodeOrigin}/v1/admin/auth/me`;
  let allowed: string | null = null;
  try {
    const res = await fetch(probe, {
      headers: { Origin: appOrigin },
      signal: AbortSignal.timeout(5_000),
    });
    allowed = res.headers.get('access-control-allow-origin');
  } catch (error) {
    throw new Error(
      `Cross-host mode: the API at ${TOPOLOGY.apiNodeOrigin} is not reachable ` +
        `(${error instanceof Error ? error.message : String(error)}).\n\n` +
        '  cd ../oxshare-crm-backend && npm run dev:crosshost\n',
    );
  }
  if (allowed !== appOrigin) {
    throw new Error(
      `Cross-host mode: the API at ${TOPOLOGY.apiNodeOrigin} does not allow the origin ` +
        `${appOrigin} (Access-Control-Allow-Origin was ${allowed ?? 'absent'}).\n\n` +
        'Start the cross-host backend, which sets PORTAL_URL/ADMIN_URL to the *.crm.localhost origins:\n' +
        '  cd ../oxshare-crm-backend && npm run dev:crosshost\n',
    );
  }
}

/**
 * The realtime server is a SECOND listener, and nothing else here would notice
 * it is down.
 *
 * `REALTIME_ENGINE=uws` (the default) runs Socket.IO on uWebSockets.js, which
 * owns its own TCP listener on `REALTIME_PORT` — so the API answering /health
 * says nothing about whether live updates work. Without this probe the
 * live-update specs fail at their five-second budget with a message about a
 * badge that did not move, which reads as a broken feature rather than a
 * server that was never up.
 *
 * A WARNING, not a failure: most specs do not need the socket, and a whole
 * suite refusing to run because one optional server is down is the kind of
 * gate people disable. The specs that DO need it fail on their own assertions,
 * now with this line above them in the log.
 */
async function warnIfRealtimeIsDown(): Promise<void> {
  const probe = `${TOPOLOGY.realtimeOrigin}/socket.io/?EIO=4&transport=polling`;
  try {
    const res = await fetch(probe, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) return;
    console.warn(`[e2e] the realtime server answered ${res.status} at ${probe}.`);
  } catch (error) {
    console.warn(
      `[e2e] the realtime server is NOT reachable at ${TOPOLOGY.realtimeOrigin} ` +
        `(${error instanceof Error ? error.message : String(error)}).\n` +
        '      Live-update specs will fail. It starts with the API; check REALTIME_PORT.',
    );
  }
}

export default async function globalSetup(): Promise<void> {
  let reachable = false;
  let detail = '';

  try {
    const res = await fetch(API_HEALTH, { signal: AbortSignal.timeout(5_000) });
    reachable = res.ok;
    if (!res.ok) detail = `responded ${res.status}`;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  if (!reachable) {
    throw new Error(
      [
        `The API is not reachable at ${API_HEALTH}${detail ? ` (${detail})` : ''}.`,
        '',
        'These tests drive the real stack. Start it first:',
        '',
        `  cd ../oxshare-crm-backend && docker compose up -d && npm run ${CROSS ? 'dev:crosshost' : 'dev'}`,
        '',
        'Postgres must be up before the API — the API refuses to start without it.',
      ].join('\n'),
    );
  }

  await assertCrossHostBackend(TOPOLOGY.adminOrigin);
  await warnIfRealtimeIsDown();
}
