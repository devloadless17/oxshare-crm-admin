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
  // NODE origin: this runs in Node, which cannot resolve `*.crm.localhost`.
  const probe = `${TOPOLOGY.realtimeNodeOrigin}/socket.io/?EIO=4&transport=polling`;
  try {
    const res = await fetch(probe, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) return;
    console.warn(`[e2e] the realtime server answered ${res.status} at ${probe}.`);
  } catch (error) {
    console.warn(
      `[e2e] the realtime server is NOT reachable at ${TOPOLOGY.realtimeNodeOrigin} ` +
        `(${error instanceof Error ? error.message : String(error)}).\n` +
        '      Live-update specs will fail. It starts with the API; check REALTIME_PORT.',
    );
  }
}

/**
 * Put the pooled KYC fixtures back to pending, once, before the run starts.
 *
 * The pool exists because `POST /auth/register` is capped at 10/hour per IP, so
 * the suite leases pre-seeded pending submissions instead of creating them. Those
 * fixtures exist to be DECIDED, so a run consumes them — and `seed.ts` only
 * re-asserts them at BOOT. That made the remedy "restart the backend", which is
 * one strict run per restart.
 *
 * That is not merely inconvenient. The second run of a session fails with ten red
 * tests naming fixtures rather than code, and the cheapest way to silence it is to
 * unset E2E_STRICT — which turns every skipped precondition back into a silent
 * pass, the exact failure the flag exists to prevent.
 *
 * Doing it HERE rather than on boot also survives the case that actually happens:
 * a run that dies mid-suite leaves fixtures decided, and the next run's setup
 * clears them with no restart involved.
 *
 * A WARNING, not a failure, and deliberately so. The route is development-only,
 * so it is absent whenever these tests are pointed at anything else — and a suite
 * that refuses to start because an optional convenience is missing is a suite
 * people route around. A consumed pool still reports itself precisely, at the
 * lease site, naming the label.
 */
async function resetReviewPool(): Promise<void> {
  const endpoint = `${TOPOLOGY.apiNodeOrigin}/v1/e2e/fixtures/review-pool`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      /*
       * `CsrfGuard` validates Origin on EVERY state change, session or not —
       * a Node fetch sends none, and the refusal reads as "failed anti-forgery
       * validation" rather than "you forgot a header". Send what the browser
       * would.
       */
      headers: { Origin: TOPOLOGY.adminOrigin },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const { reset } = (await res.json()) as { reset: number };
      // Progress, not a problem — same exemption the rate-limit backoff uses.
      // eslint-disable-next-line no-console
      console.log(`[e2e] review pool reset to pending (${reset} fixtures).`);
      return;
    }
    console.warn(
      `[e2e] the review-pool reset answered ${res.status} at ${endpoint}. ` +
        'Pooled KYC fixtures decided by a previous run will still be decided; ' +
        'restart the API to re-seed them.',
    );
  } catch (error) {
    console.warn(
      `[e2e] could not reset the review pool (${error instanceof Error ? error.message : String(error)}). ` +
        'It is development-only, so this is expected against a non-development API.',
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
  await resetReviewPool();
}
