import { API_BASE_URL } from '@/lib/env';

/**
 * TWIN of the same path in the sibling app (scripts/check-twins.sh).
 *
 * What went wrong in the browser, sent to the API log (`POST /client-errors`),
 * where it becomes one `client.crash` warning. Before this existed a broken
 * screen on a client's phone left no trace on any server; on 16 Oct 2026 the
 * only evidence was screenshots.
 *
 * Three ways in: an error screen (`page`, `global`), an error no screen caught
 * (`uncaught`), and a promise nobody handled (`rejection`); the last two come
 * from `installCrashListeners`, mounted once by `<CrashReporter />`.
 *
 * KEPT ON THE DEVICE UNTIL DELIVERED. A phone that crashes with no connection,
 * or while the API is mid-deploy, would otherwise lose the report for good. It
 * waits in localStorage and goes on the next page load, or as soon as the
 * connection returns, carrying the time it really happened (`occurredAt`) and an
 * `id`, so a report delivered twice (two tabs, a reload mid-send) reads as one.
 * A report the API REFUSES is dropped: sending it again cannot change the answer.
 *
 * Only the PATH is sent, never the query string (a reset token, a code). The
 * server blanks emails and long numbers in the message as well. Nothing here
 * may ever throw into the screen that reports.
 */
// twin:config:start — the one line that differs from the portal's copy.
const APP = 'admin';
// twin:config:end

export type CrashBoundary = 'page' | 'global' | 'uncaught' | 'rejection';

interface CrashReport {
  id: string;
  app: string;
  boundary: CrashBoundary;
  name: string;
  message: string;
  stack?: string;
  digest?: string;
  path: string;
  build?: string;
  occurredAt: string;
}

const QUEUE_KEY = 'oxshare-crash-reports';
/** A phone offline for a day keeps the first ten (the cause), not a thousand. */
const QUEUE_MAX = 10;
/** A loop that throws every second sends five reports, not three hundred. */
const PER_PAGE_MAX = 5;
/** Older than this is no longer worth reading. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const seen = new Set<string>();
let reportedThisPage = 0;
let flushing = false;
let flushAgain = false;
/** Where reports wait when the browser refuses localStorage (private mode). */
let memoryQueue: CrashReport[] = [];

export function reportCrash(error: unknown, boundary: CrashBoundary): void {
  try {
    const { name, message, stack, digest } = describe(error);
    const path = window.location.pathname.slice(0, 500);
    // The same failure reaching two channels (a screen and a listener), or a
    // re-render of the same screen, is one report.
    const key = `${path}|${name}|${message}`;
    if (seen.has(key) || reportedThisPage >= PER_PAGE_MAX) return;
    seen.add(key);
    reportedThisPage += 1;

    // Not always a string in the browser (Next may inline `false` when no
    // deployment id was built in), so it is checked rather than trusted.
    const deployment: unknown = process.env.NEXT_DEPLOYMENT_ID;
    const build = typeof deployment === 'string' && deployment ? deployment : undefined;
    enqueue({
      id: newId(),
      app: APP,
      boundary,
      name,
      message,
      stack: stack?.slice(0, 8000),
      digest: digest?.slice(0, 100),
      path,
      build: build?.slice(0, 100),
      occurredAt: new Date().toISOString(),
    });
    void flushCrashReports();
  } catch {
    // Reporting must never break the screen that reports.
  }
}

/** Sends every report still waiting on this device, oldest first. */
export async function flushCrashReports(): Promise<void> {
  // One sender at a time. A report queued while it is busy is not left for the
  // next page load: the running sender goes round again for it.
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      const done: string[] = [];
      let offline = false;
      for (const report of readQueue()) {
        if ((await send(report)) === 'retry') {
          offline = true; // the rest wait with it, for `online` or the next load
          break;
        }
        done.push(report.id);
      }
      // Re-read before writing: another tab may have queued meanwhile.
      if (done.length) writeQueue(readQueue().filter((r) => !done.includes(r.id)));
      if (offline) break;
    } while (flushAgain);
  } catch {
    // Best effort, always.
  } finally {
    flushing = false;
  }
}

/**
 * The window's own listeners, for what no error screen catches. Returns the
 * cleanup. Filters what is noise, not a fault of this app.
 */
export function installCrashListeners(): () => void {
  const onError = (event: ErrorEvent) => {
    // "Script error." with nothing attached is another origin's script (an
    // extension, a translator) the browser will not describe: nothing to act on.
    if (!event.error && (!event.message || event.message === 'Script error.')) return;
    // The browser's own layout warning, harmless and very frequent.
    if (/ResizeObserver loop/.test(event.message ?? '')) return;
    reportCrash(event.error ?? new Error(event.message), 'uncaught');
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isCancellation(event.reason)) return;
    reportCrash(event.reason, 'rejection');
  };
  const onOnline = () => void flushCrashReports();
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('online', onOnline);
  void flushCrashReports();
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('online', onOnline);
  };
}

async function send(report: CrashReport): Promise<'done' | 'retry'> {
  try {
    const response = await fetch(`${API_BASE_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      // Survives the reload the stale-build recovery may do right after.
      keepalive: true,
      body: JSON.stringify(report),
    });
    // Delivered, or refused for good (a 4xx will refuse it again). A busy or
    // restarting API (429, 5xx) is worth another try later.
    return response.status === 429 || response.status >= 500 ? 'retry' : 'done';
  } catch {
    return 'retry';
  }
}

function describe(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  digest?: string;
} {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: string }).digest;
    return {
      name: (error.name || 'Error').slice(0, 100),
      message: `${String(error.message ?? '')}${requestOf(error)}`.slice(0, 1000),
      stack: error.stack,
      digest: typeof digest === 'string' ? digest : undefined,
    };
  }
  let text: string;
  try {
    text = typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    text = String(error);
  }
  return { name: 'NonError', message: String(text).slice(0, 1000) };
}

/** " (GET /kyc/status)" for a failed API call: the path only, never the query. */
function requestOf(error: Error): string {
  const config = (error as Error & { config?: { method?: unknown; url?: unknown } }).config;
  if (!config || typeof config.url !== 'string') return '';
  const method = typeof config.method === 'string' ? config.method.toUpperCase() : 'GET';
  return ` (${method} ${config.url.split(/[?#]/, 1)[0]})`;
}

/** A request this app cancelled on purpose (a page left, a search retyped). */
function isCancellation(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const { name, code } = reason as { name?: unknown; code?: unknown };
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED';
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Not a secure context: fall through.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function enqueue(report: CrashReport): void {
  const queue = readQueue();
  if (queue.length >= QUEUE_MAX) return;
  writeQueue([...queue, report]);
}

function readQueue(): CrashReport[] {
  let list: unknown;
  try {
    list = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    list = memoryQueue;
  }
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return (list as CrashReport[]).filter(
    (r) =>
      r &&
      typeof r.id === 'string' &&
      typeof r.occurredAt === 'string' &&
      now - Date.parse(r.occurredAt) < MAX_AGE_MS,
  );
}

function writeQueue(queue: CrashReport[]): void {
  try {
    if (queue.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    memoryQueue = queue;
  }
}
