'use client';

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { httpStatusOf, type ResourceStatus } from './use-resource';

/** One keyset page, the shape every cursor-paged endpoint here returns (R-2.4). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface InfiniteResource<T> {
  /** The same six states `useResource` reports — `AsyncBoundary` renders them. */
  status: ResourceStatus;
  /** Every page loaded so far, in order. */
  items: T[];
  error: unknown;
  isFetching: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<{ isError: boolean }>;
  /** A refresh failed over rows already on screen — see `useResource`. */
  refreshFailed: boolean;
}

/**
 * `useResource` for a feed that grows at the bottom — "Load more" over a keyset
 * cursor.
 *
 * A feed, not a table: rows arrive at the TOP while the reader scrolls, so
 * numbered offset pages would shift under them (the reason the backend pages by
 * cursor at all). Each page's cursor is the last row's own position, so a
 * row landing above never duplicates or skips one below.
 *
 * The status rule is `useResource`'s, word for word, and for the same reasons:
 * rows already on screen survive a failed background refresh (reported through
 * `refreshFailed`, never by blanking the list), while a 401 or 403 wins over
 * them — somebody just refused these rows must stop seeing them.
 *
 * Invalidating the key refetches every loaded page in order, so a realtime
 * "your notifications changed" leaves the reader where they were, with the
 * rows beneath them current.
 */
export function useInfiniteResource<T>(
  key: QueryKey,
  fetcher: (cursor: string | undefined, signal: AbortSignal) => Promise<CursorPage<T>>,
  options?: { enabled?: boolean },
): InfiniteResource<T> {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => fetcher(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });

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
              ? (query.error as { response?: { data?: { code?: unknown } } })?.response?.data
                  ?.code === 'ROUTE_NOT_FOUND'
                ? 'unavailable'
                : 'notFound'
              : 'error'
      : 'ready';

  return {
    status,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    error: query.error,
    isFetching: query.isFetching,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refetch: () => query.refetch(),
    refreshFailed: query.isError && hasData && status === 'ready',
  };
}
