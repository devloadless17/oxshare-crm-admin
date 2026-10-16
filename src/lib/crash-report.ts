import { API_BASE_URL } from '@/lib/env';

/**
 * TWIN of the same path in the sibling app (scripts/check-twins.sh).
 *
 * Sends a crash the error screen caught to the API log (`POST /client-errors`).
 *
 * Without it a crash in the browser leaves no trace on any server: on 16 Oct
 * 2026 a client's sign-up crashed and the only evidence was their screenshot.
 * The server keeps it as one `client.crash` warning.
 *
 * Only the PATH is sent, never the query string (a reset token, a code). The
 * server blanks emails and long numbers from the message and stack as well.
 * Best effort: a report that fails is dropped, and it can never throw into the
 * error screen that called it.
 */
// twin:config:start — the one line that differs from the portal's copy.
const APP = 'admin';
// twin:config:end

const sent = new Set<string>();

export function reportCrash(error: Error, boundary: 'page' | 'global'): void {
  try {
    const name = (error.name || 'Error').slice(0, 100);
    const message = String(error.message ?? '').slice(0, 1000);
    const path = window.location.pathname.slice(0, 500);
    // One report per distinct crash per page load: a re-render of the same
    // error screen must not send it again.
    const key = `${boundary}|${path}|${name}|${message}`;
    if (sent.has(key)) return;
    sent.add(key);

    const digest = (error as Error & { digest?: string }).digest;
    // Not always a string in the browser (Next may inline `false` when no
    // deployment id was built in), so it is checked rather than trusted.
    const deployment: unknown = process.env.NEXT_DEPLOYMENT_ID;
    const build = typeof deployment === 'string' && deployment ? deployment : undefined;
    void fetch(`${API_BASE_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      // Survives the reload the stale-build recovery may do right after.
      keepalive: true,
      body: JSON.stringify({
        app: APP,
        boundary,
        name,
        message,
        stack: error.stack?.slice(0, 8000),
        digest: digest?.slice(0, 100),
        path,
        build: build?.slice(0, 100),
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never break the screen that reports.
  }
}
