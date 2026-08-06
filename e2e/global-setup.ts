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
const API_HEALTH = 'http://localhost:3001/health';

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
        '  cd ../oxshare-crm-backend && docker compose up -d && npm run dev',
        '',
        'Postgres must be up before the API — the API refuses to start without it.',
      ].join('\n'),
    );
  }
}
