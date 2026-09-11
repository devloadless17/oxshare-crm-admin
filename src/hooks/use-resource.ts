'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.
import { useQuery, type QueryKey } from '@tanstack/react-query';

/**
 * The four states every list screen in this app renders. `unavailable` is
 * distinct from `error` on purpose: a 404 means the backend endpoint is not
 * built yet (a to-do for the API owner) while an error means something broke.
 * Nine pages each declared this union locally, in two incompatible variants.
 */
/**
 * `forbidden` is a 403 and is NOT an error in the sense the retry card means.
 *
 * R-2.3: 401 means "no valid session", 403 means "session valid, not
 * permitted". Both used to land in `error`, which rendered "something went
 * wrong — try again" over a page the caller will never be allowed to see. On a
 * permission-gated back office that reads as a broken screen rather than a
 * closed door, and it invites an admin to retry forever and then raise a bug.
 *
 * Kept distinct from `unavailable` (404 = the endpoint is not built yet), which
 * is a to-do for the API owner rather than a statement about this caller.
 */
/**
 * `unauthenticated` is a 401 that reached the screen — and it reaches the screen
 * only for a moment, or not at all.
 *
 * The axios interceptor owns 401s: it refreshes, replays, and on a dead session
 * hard-navigates to sign-in. But the rejected promise still settles the query
 * in the window before that navigation lands, and it used to settle as `error`
 * — so the page painted "Something went wrong — Retry" over a session that was
 * being ended, with a Retry button that could never work. Named separately so
 * `AsyncBoundary` can render nothing alarming while the redirect is in flight.
 */
export type ResourceStatus =
  'loading' | 'ready' | 'unavailable' | 'forbidden' | 'unauthenticated' | 'error';

export function httpStatusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export interface Resource<T> {
  status: ResourceStatus;
  data: T | undefined;
  /** True while a background refetch runs and stale data is still on screen. */
  isFetching: boolean;
  error: unknown;
  /**
   * When `data` last arrived, as epoch milliseconds. `0` before the first
   * success.
   *
   * For screens whose figures go stale on their own — a live trading balance,
   * an open position's floating P/L — where "as of when" is part of the number.
   * Exposed from React Query rather than stamped by the caller in an effect:
   * `setState` inside an effect is a lint error in both apps, and a ref written
   * during render is a side effect in the render path. React Query already
   * holds the answer.
   */
  updatedAt: number;
  /**
   * Resolves once the refetch settles, so callers can await it — AND says
   * whether it worked.
   *
   * It returned `Promise<unknown>`, which let a caller await the settle and gave
   * it no way to know the outcome. React Query RESOLVES this promise with a
   * result object on failure rather than rejecting, so the natural-looking
   * `try { await refetch() } catch` is dead code — and the profile's session
   * list shipped exactly that, reporting a successful sign-out while the row it
   * failed to refresh stayed on screen.
   *
   * `isError` is the minimum a caller needs to tell "the screen is up to date"
   * from "the screen is stale and I know it".
   */
  refetch: () => Promise<{ isError: boolean }>;
  /**
   * THE LAST REFRESH FAILED AND YOU ARE LOOKING AT THE PREVIOUS ANSWER.
   *
   * Only ever true alongside `status: 'ready'` — a screen with no data at all
   * is an ERROR, and that is what the other five states are for. This is the
   * case none of them covers: the query HAS data, a refresh was attempted, and
   * it did not land.
   *
   * ── Why this cannot be read off the query ──────────────────────────────────
   *
   * It was measured, twice and in both apps, because the answer is not what
   * anyone expects. After a failed BACKGROUND refetch TanStack reports:
   *
   *   status success · isError false · fetchStatus idle · failureCount 0
   *   failureReason null · errorUpdateCount 0 · errorUpdatedAt 0 · error null
   *
   * Every field clean. A query that has just failed to refresh is indis-
   * tinguishable from one that succeeded, so `AsyncBoundary` renders the happy
   * branch over stale data and nothing anywhere says so. The only channel
   * TanStack offers is the value `refetch()` RESOLVES with — which reaches the
   * one caller that happened to await it, and no one else.
   *
   * So this is tracked here, in the one place every screen already goes
   * through. An ABORT is deliberately not a failure: React Query cancels
   * superseded requests on every keystroke of a search box, and counting those
   * would make the flag permanently true on exactly the screens that use it
   * most — a declaration that is always true is as useless as one that is
   * always false.
   *
   * ── Why it matters more here than it sounds ───────────────────────────────
   *
   * On a list of clients, stale means slightly old. On a WALLET it means a
   * BALANCE that is not the balance — and this project has already shipped that
   * failure twice from the other direction: a wallet reading `$0.00` to
   * somebody holding $700, and an accounts page telling a client with three
   * live accounts they had none. Both were fixed by making the screen render
   * what the database actually said. This is the third way to get there, and
   * the only one the six states could not express.
   */
  refreshFailed: boolean;
}

/**
 * One fetch primitive for every list screen.
 *
 * The query function receives React Query's AbortSignal, so a superseded
 * request is cancelled rather than left to land out of order — which is what
 * makes the search boxes race-free.
 */
export function useResource<T>(
  key: QueryKey,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { enabled?: boolean; retry?: number; refetchInterval?: number },
): Resource<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(signal),
    enabled: options?.enabled ?? true,
    /**
     * React Query's default is THREE retries, which is right for a cheap query
     * against our own API and wrong for an expensive one against somebody
     * else's server.
     *
     * Measured on the portal's trading screens: three panels each reading MT5
     * through the bridge, each attempt costing the full read timeout before it
     * failed, each retried three times — around forty requests and two minutes
     * of hammering for one page view. Worse, the bridge serialises every MT5
     * call behind one lock, so the retries queued behind each other and made
     * the failure they were retrying last longer.
     *
     * Callers that cross to an external service should pass a small number, or
     * `0` where a person is sitting in front of a retry button anyway.
     */
    retry: options?.retry,
    /**
     * Poll, for a screen whose value is written by something other than the
     * person looking at it.
     *
     * OPT-IN per caller rather than a default, and the split is the same one
     * `retry` above makes: what this costs depends entirely on what sits behind
     * the endpoint. A list served from our own database is one cheap read and
     * can be polled happily; anything crossing the bridge to MT5 must NOT be,
     * because every one of those calls takes the bridge's single MT5 session
     * lock and the throttle on those routes is 12/min per client.
     *
     * React Query pauses the interval while the tab is hidden, so this does not
     * run in the background — and with `refetchOnWindowFocus` on, coming back to
     * the tab refreshes immediately rather than waiting out the remainder.
     */
    refetchInterval: options?.refetchInterval,
    placeholderData: (previous) => previous, // keep the page visible while paging
  });

  /*
   * ── A FAILED REFRESH OVER DATA WE ALREADY HAVE IS NOT AN ERROR ────────────
   *
   * `query.isError` goes TRUE when a BACKGROUND refetch fails, even though the
   * previous answer is still in `data`. Deriving the status from `isError`
   * alone therefore replaced a populated screen with an error card on any
   * transient blip — a balance swapped for "something went wrong" because one
   * poll missed.
   *
   * ⚠️ AND IT DID IT NON-DETERMINISTICALLY, which is why it went unnoticed and
   * why two separate measurements of it were wrong. Read the observer straight
   * after the failed refetch and it still says `success`; force ANY unrelated
   * re-render — a sibling's state, a parent, a modal opening — and the same
   * query reports `error` with the data still sitting there. Measured:
   *
   *   AFTER REFETCH: success/isError=false | AFTER UNRELATED RE-RENDER: error/isError=true
   *
   * So whether a screen showed stale data or an error page depended on whether
   * something else happened to re-render it. Both outcomes were reachable from
   * the same failure, which is worse than either one.
   *
   * The rule below is deterministic: data we hold keeps being shown, and the
   * failure is reported through `refreshFailed` instead of by blanking the
   * screen. That is the same principle as the wallet card's — render what the
   * server actually said, never an invented emptiness.
   *
   * THE EXCEPTION IS AUTHORIZATION. A 401 or a 403 arriving on a refresh is not
   * a blip, it is the answer changing: the session ended, or the permission was
   * taken away. Continuing to show rows to somebody who has just been refused
   * them is exactly the leak RBAC-03 exists to prevent, so those two win over
   * the data we hold.
   */
  const httpStatus = httpStatusOf(query.error);
  const hasData = query.data !== undefined;
  const status: ResourceStatus = query.isPending
    ? 'loading'
    : query.isError
      ? httpStatus === 403
        ? 'forbidden'
        : httpStatus === 401
          ? 'unauthenticated'
          : hasData
            ? 'ready'
            : httpStatus === 404
              ? 'unavailable'
              : 'error'
      : 'ready';

  return {
    // Derived, never tracked: it is exactly "the last fetch failed AND we still
    // have the previous answer to show". Never true beside a spinner or an
    // error card, because those already say the screen is not current.
    refreshFailed: query.isError && hasData && status === 'ready',
    status,
    data: query.data,
    isFetching: query.isFetching,
    error: query.error,
    updatedAt: query.dataUpdatedAt,
    refetch: () => query.refetch(),
  };
}

/*
 * apiErrorMessage moved to lib/api/errors.ts — an error formatter is not a
 * fetching concern, and this file's copy silently dropped the `error.message`
 * fallback. Import it from '@/lib/api/errors'.
 */
