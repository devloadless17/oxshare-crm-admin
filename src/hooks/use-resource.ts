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
export type ResourceStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export function httpStatusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export interface Resource<T> {
  status: ResourceStatus;
  data: T | undefined;
  /** True while a background refetch runs and stale data is still on screen. */
  isFetching: boolean;
  error: unknown;
  /** Resolves once the refetch settles, so callers can await it. */
  refetch: () => Promise<unknown>;
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
  options?: { enabled?: boolean },
): Resource<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(signal),
    enabled: options?.enabled ?? true,
    placeholderData: (previous) => previous, // keep the page visible while paging
  });

  const status: ResourceStatus = query.isPending
    ? 'loading'
    : query.isError
      ? httpStatusOf(query.error) === 404
        ? 'unavailable'
        : 'error'
      : 'ready';

  return {
    status,
    data: query.data,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => query.refetch(),
  };
}

/*
 * apiErrorMessage moved to lib/api/errors.ts — an error formatter is not a
 * fetching concern, and this file's copy silently dropped the `error.message`
 * fallback. Import it from '@/lib/api/errors'.
 */
