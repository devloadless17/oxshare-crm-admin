/*
 * The idle clock (12 Oct 2026).
 *
 * The owner's rule: an administrator who does NOTHING on the console for the
 * idle window (15 minutes) signs in again; one who is working is never signed
 * out. "Doing something" is input — a mouse, a key, a scroll — in ANY tab, with
 * or without a request behind it: reading a document for twenty minutes while
 * scrolling it is working.
 *
 * This file is the clock and nothing else. `components/idle-guard.tsx` feeds it
 * and acts on it; `lib/api/client.ts` reports it with every refresh, and the
 * API issues tokens that die at "last activity + window" — so a closed laptop
 * is signed out by the server with no JavaScript running. This clock is the
 * courtesy; that is the rule.
 *
 * Two facts are kept, both shared by every tab of this browser:
 *
 *  - `activity` — when somebody last touched the console.
 *  - `reported` — the activity time the server last HEARD, which is what its
 *    deadline is counted from. The two differ, because a refresh is not sent on
 *    every mouse move; `needsReport` says when the gap has become dangerous.
 *
 * Neither is a secret and neither is trusted: they are two timestamps, and the
 * API decides what a session is worth.
 */

const ACTIVITY_KEY = 'oxshare-crm-admin-last-activity';
const REPORTED_KEY = 'oxshare-crm-admin-reported-activity';
const CHANNEL = 'oxshare-crm-admin-activity';

/** Written to storage at most this often; a mouse moves sixty times a second. */
const WRITE_EVERY_MS = 5_000;

/**
 * The server ends a session this long AFTER the window (the API's
 * `ADMIN_IDLE_GRACE_MS`), so an administrator back at 14:59 still renews.
 */
export const IDLE_GRACE_MS = 60_000;

/** The notice appears this long before the sign-out. */
export const IDLE_WARNING_MS = 60_000;

/** The proactive refresh's period when the window is unknown — what it was before the rule. */
const DEFAULT_REFRESH_EVERY_MS = 10 * 60_000;

let windowMs: number | null = null;
let memoryActivity = 0;
let memoryReported = 0;
let lastWriteAt = 0;

function readStamp(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    // Storage blocked: this tab's memory and the channel below still work.
    return 0;
  }
}

function writeStamp(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // See readStamp.
  }
}

type ActivityChannel = {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
};

let channel: ActivityChannel | null | undefined;

/**
 * A second road between tabs, for a browser that refuses storage. Without one, a
 * background tab would see no activity, conclude nobody is there, and sign out
 * the administrator working in the tab beside it.
 */
function activityChannel(): ActivityChannel | null {
  if (channel !== undefined) return channel;
  channel = null;
  if (typeof window === 'undefined') return channel;
  const Ctor = (window as { BroadcastChannel?: new (name: string) => ActivityChannel })
    .BroadcastChannel;
  if (typeof Ctor !== 'function') return channel;
  try {
    channel = new Ctor(CHANNEL);
    channel.onmessage = (e) => {
      const at = (e.data as { activity?: unknown } | null)?.activity;
      if (typeof at === 'number' && at > memoryActivity) memoryActivity = at;
    };
  } catch {
    channel = null;
  }
  return channel;
}

/** The idle window, from the session profile. The server's number, never a copy. */
export function setIdleWindow(seconds: number | null | undefined): void {
  windowMs = typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : null;
}

export function idleWindowMs(): number | null {
  return windowMs;
}

/** Somebody touched the console. Cheap enough to call on every pointer move. */
export function markActivity(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  memoryActivity = now;
  if (now - lastWriteAt < WRITE_EVERY_MS) return;
  lastWriteAt = now;
  writeStamp(ACTIVITY_KEY, now);
  activityChannel()?.postMessage({ activity: now });
}

/**
 * When the console was last touched, in any tab.
 *
 * A browser with no record at all reads as "just now": the page was opened by
 * somebody, and a session the API accepts is never ended on a missing stamp.
 */
export function lastActivityAt(now: number = Date.now()): number {
  if (typeof window === 'undefined') return now;
  activityChannel();
  const known = Math.max(memoryActivity, readStamp(ACTIVITY_KEY));
  if (known > 0) return Math.min(known, now);
  markActivity(now);
  return now;
}

export function idleMs(now: number = Date.now()): number {
  return Math.max(0, now - lastActivityAt(now));
}

/** What a refresh reports: whole seconds since the console was last touched. */
export function idleSeconds(now: number = Date.now()): number {
  return Math.floor(idleMs(now) / 1000);
}

/** Has the window passed with nobody there? Never true while it is unknown. */
export function isIdleExpired(now: number = Date.now()): boolean {
  return windowMs !== null && idleMs(now) >= windowMs;
}

/** Milliseconds until the sign-out, or `null` while the window is unknown. */
export function idleRemainingMs(now: number = Date.now()): number | null {
  return windowMs === null ? null : Math.max(0, windowMs - idleMs(now));
}

/**
 * A sign-in is activity, and a new session's deadline is counted from it.
 *
 * Load-bearing: without it, yesterday's stamp would be reported with the first
 * refresh and the API would end the session that had just begun.
 */
export function resetActivity(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  lastWriteAt = 0;
  markActivity(now);
  noteReported(now);
}

/** A refresh succeeded: the server's deadline is now counted from `activityAt`. */
export function noteReported(activityAt: number): void {
  if (typeof window === 'undefined') return;
  memoryReported = activityAt;
  writeStamp(REPORTED_KEY, activityAt);
}

/**
 * How often an open console renews: a quarter of the window, so the server
 * always hears of activity long before the tokens it issued run out.
 */
export function refreshEveryMs(): number {
  if (windowMs === null) return DEFAULT_REFRESH_EVERY_MS;
  return Math.min(DEFAULT_REFRESH_EVERY_MS, Math.max(60_000, windowMs / 4));
}

/**
 * Must the server hear of this activity NOW, rather than at the next renewal?
 *
 * Yes when the tokens it issued would run out before that renewal: the
 * administrator came back near the end of the window, or reloads have kept
 * restarting the renewal timer. Without this, somebody working would be signed
 * out by a deadline counted from activity the server last heard of long ago.
 *
 * No while the server's deadline is unknown (a session from before the rule):
 * the first ordinary renewal records it.
 */
export function needsReport(now: number = Date.now()): boolean {
  if (windowMs === null || typeof window === 'undefined') return false;
  const reported = Math.max(memoryReported, readStamp(REPORTED_KEY));
  if (reported === 0) return false;
  const serverDeadline = reported + windowMs + IDLE_GRACE_MS;
  return serverDeadline - now < refreshEveryMs() + IDLE_GRACE_MS;
}

/** The sign-in page reads this to say why the administrator is looking at it. */
export const IDLE_REASON_PARAM = 'reason';
export const IDLE_REASON = 'idle';

/** `/login?next=…` → the same, saying the session ended for inactivity. */
export function withIdleReason(loginPath: string): string {
  return `${loginPath}${loginPath.includes('?') ? '&' : '?'}${IDLE_REASON_PARAM}=${IDLE_REASON}`;
}

/** Tests only: forget everything, as a new browser would. */
export function resetIdleClockForTests(): void {
  windowMs = null;
  memoryActivity = 0;
  memoryReported = 0;
  lastWriteAt = 0;
  try {
    window.localStorage.removeItem(ACTIVITY_KEY);
    window.localStorage.removeItem(REPORTED_KEY);
  } catch {
    // Nothing to forget.
  }
}
