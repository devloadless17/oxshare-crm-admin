import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useInfiniteResource, type CursorPage } from './use-infinite-resource';

/**
 * The feed behind the notification bell — "Load more" over a keyset cursor,
 * reporting the same six states `useResource` does, so `AsyncBoundary` renders
 * a feed exactly as it renders a table: a 403 as a closed door, a 404 as "not
 * built yet", never either as an empty list.
 */

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function failingWith(status: number) {
  // Shaped like an AxiosError: an Error carrying `response.status`.
  return () => Promise.reject(Object.assign(new Error(`HTTP ${status}`), { response: { status } }));
}

describe('useInfiniteResource', () => {
  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    // A route's own 404; only the API's ROUTE_NOT_FOUND is "not built yet".
    [404, 'notFound'],
    [500, 'error'],
  ] as const)('maps HTTP %i to %s', async (status, expected) => {
    const { wrapper } = harness();
    const { result } = renderHook(
      () => useInfiniteResource(['feed', status], failingWith(status)),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.status).toBe(expected));
    expect(result.current.items).toEqual([]);
  });

  it('follows the cursor the last page returned, and stops when there is none', async () => {
    const pages: Record<string, CursorPage<string>> = {
      first: { items: ['a', 'b'], nextCursor: 'c2' },
      c2: { items: ['c'], nextCursor: null },
    };
    const fetcher = vi.fn((cursor: string | undefined) =>
      Promise.resolve(pages[cursor ?? 'first'] as CursorPage<string>),
    );
    const { wrapper } = harness();
    const { result } = renderHook(() => useInfiniteResource(['feed', 'pages'], fetcher), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c']));
    expect(fetcher).toHaveBeenLastCalledWith('c2', expect.anything());
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps the rows on screen when a background refresh fails, and says so', async () => {
    let fail = false;
    const fetcher = vi.fn(() =>
      fail
        ? Promise.reject(Object.assign(new Error('HTTP 500'), { response: { status: 500 } }))
        : Promise.resolve({ items: ['a'], nextCursor: null }),
    );
    const { client, wrapper } = harness();
    const { result } = renderHook(() => useInfiniteResource(['feed', 'refresh'], fetcher), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fail = true;
    await act(() => client.invalidateQueries({ queryKey: ['feed', 'refresh'] }));
    await waitFor(() => expect(result.current.refreshFailed).toBe(true));
    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual(['a']);
  });

  it('lets a 403 on refresh take the rows away — somebody just refused them', async () => {
    let refuse = false;
    const fetcher = vi.fn(() =>
      refuse
        ? Promise.reject(Object.assign(new Error('HTTP 403'), { response: { status: 403 } }))
        : Promise.resolve({ items: ['a'], nextCursor: null }),
    );
    const { client, wrapper } = harness();
    const { result } = renderHook(() => useInfiniteResource(['feed', 'refused'], fetcher), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    refuse = true;
    await act(() => client.invalidateQueries({ queryKey: ['feed', 'refused'] }));
    await waitFor(() => expect(result.current.status).toBe('forbidden'));
  });
});
