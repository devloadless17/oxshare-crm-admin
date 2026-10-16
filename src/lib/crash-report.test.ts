import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TWIN of the same path in the sibling app (scripts/check-twins.sh).
 *
 * A crash on a phone with no connection must still reach the log, a refused
 * report must not be retried for ever, and noise must not crowd out the real
 * failures. Each wrong version loses reports silently, so each is pinned here.
 */
type Module = typeof import('./crash-report');

async function freshModule(): Promise<Module> {
  vi.resetModules(); // a new page load: no reports seen yet on this page
  return import('./crash-report');
}

function stored(): Array<{ id: string; name: string; occurredAt: string }> {
  return JSON.parse(window.localStorage.getItem('oxshare-crash-reports') ?? '[]') as Array<{
    id: string;
    name: string;
    occurredAt: string;
  }>;
}

function sentBodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(
    (call) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('crash reports reach the log even without a connection', () => {
  it('keeps a report the phone could not send, and sends it on the next page load', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', offline);
    const first = await freshModule();
    first.reportCrash(new TypeError('boom'), 'page');
    await vi.waitFor(() => expect(offline).toHaveBeenCalledTimes(1));
    await first.flushCrashReports();
    expect(stored()).toHaveLength(1);
    const [kept] = stored();
    if (!kept) throw new Error('the report was not kept');

    const online = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', online);
    const next = await freshModule();
    await next.flushCrashReports();
    // The SAME report: its id and the time it really happened travel with it.
    expect(sentBodies(online)).toEqual([
      expect.objectContaining({ id: kept.id, occurredAt: kept.occurredAt, name: 'TypeError' }),
    ]);
    expect(stored()).toHaveLength(0);
  });

  it('drops a report the server refuses, and keeps one the server was too busy for', async () => {
    const refused = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', refused);
    const m = await freshModule();
    m.reportCrash(new Error('refused'), 'page');
    await vi.waitFor(() => expect(refused).toHaveBeenCalled());
    await m.flushCrashReports();
    expect(stored()).toHaveLength(0);

    const busy = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', busy);
    const again = await freshModule();
    again.reportCrash(new Error('busy'), 'page');
    await vi.waitFor(() => expect(busy).toHaveBeenCalled());
    await again.flushCrashReports();
    expect(stored().map((r) => r.name)).toEqual(['Error']);
  });
});

describe('the window listeners report real failures, not noise', () => {
  it('ignores noise, sends each failure once, and at most five a page', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', ok);
    const m = await freshModule();
    const stop = m.installCrashListeners();
    try {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'ResizeObserver loop completed with undelivered notifications.',
        }),
      );
      const cancelled = Object.assign(new Event('unhandledrejection'), {
        reason: Object.assign(new Error('canceled'), { name: 'CanceledError' }),
      });
      window.dispatchEvent(cancelled);
      await m.flushCrashReports();
      expect(ok).not.toHaveBeenCalled();

      const failure = Object.assign(new Event('unhandledrejection'), {
        reason: Object.assign(new Error('Request failed with status code 500'), {
          config: { method: 'post', url: '/kyc/upload?x=1' },
        }),
      });
      window.dispatchEvent(failure);
      window.dispatchEvent(failure); // the same failure again: one report
      for (let i = 0; i < 6; i += 1) {
        window.dispatchEvent(
          new ErrorEvent('error', { error: new Error(`loop ${i}`), message: '' }),
        );
      }
      await vi.waitFor(() => expect(ok).toHaveBeenCalledTimes(5));
      const bodies = sentBodies(ok);
      expect(bodies[0]).toMatchObject({
        boundary: 'rejection',
        message: 'Request failed with status code 500 (POST /kyc/upload)',
      });
      expect(bodies.slice(1).every((b) => b.boundary === 'uncaught')).toBe(true);
    } finally {
      stop();
    }
  });
});
