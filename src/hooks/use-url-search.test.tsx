import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { TableQueryState } from '@/hooks/use-table-query-state';
import { useUrlSearch } from './use-url-search';

/**
 * The search box that is typed locally and kept in the URL. The case that
 * broke three screens: a link followed while ALREADY on the page — a task
 * opened from the bell — changes the address bar without remounting, and a box
 * seeded once wrote its stale term straight back over the link's filter.
 */

/** An address bar the hook can read and write, the way `useTableQueryState` does. */
function addressBar(initial: string) {
  let params = new URLSearchParams(initial);
  const set = vi.fn((patch: Record<string, string | string[] | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    params = next;
  });
  // A NEW object per URL, as the real hook memoises on the search params.
  const read = (): TableQueryState => ({
    get: (key) => params.get(key) ?? '',
    list: (key) => params.getAll(key),
    sort: { order: 'desc' },
    set,
    setSort: vi.fn(),
    clear: vi.fn(),
    isFiltered: [...params.keys()].length > 0,
  });
  let current = read();
  return {
    set,
    url: () => current,
    /** What a link does: replace the address bar from outside. */
    navigate: (query: string) => {
      params = new URLSearchParams(query);
      current = read();
    },
    /** Pick up the hook's own writes, as a re-render after `router.replace` would. */
    sync: () => {
      current = read();
    },
    query: () => params.toString(),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useUrlSearch', () => {
  it('starts from the URL and writes nothing back for it', () => {
    const bar = addressBar('q=ada');
    const { result } = renderHook(() => useUrlSearch(bar.url()));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.search).toBe('ada');
    expect(bar.set).not.toHaveBeenCalled();
  });

  it('writes the SETTLED term to the URL, and resets the page', () => {
    const bar = addressBar('page=4');
    const { result } = renderHook(() => useUrlSearch(bar.url()));
    act(() => result.current.setSearch('ada '));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(bar.set).toHaveBeenCalledWith({ q: 'ada', page: undefined });
  });

  it('keeps what was typed during the round trip — its own echo re-seeds nothing', () => {
    const bar = addressBar('');
    const { result, rerender } = renderHook(() => useUrlSearch(bar.url()));
    act(() => result.current.setSearch('ab'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Typing continues while the router is still applying `q=ab`.
    act(() => result.current.setSearch('abc'));
    bar.sync();
    rerender();
    expect(result.current.search).toBe('abc');
  });

  it('takes a link followed while already on the page, and never writes the old term over it', () => {
    const bar = addressBar('q=ada');
    const { result, rerender } = renderHook(() => useUrlSearch(bar.url()));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    bar.navigate('state=pending&q=1000245');
    rerender();
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.search).toBe('1000245');
    expect(bar.query()).toBe('state=pending&q=1000245');
    expect(bar.set).not.toHaveBeenCalled();
  });

  it('lets a link REMOVE the term, and leaves the other filters the link set', () => {
    const bar = addressBar('q=jane');
    const { result, rerender } = renderHook(() => useUrlSearch(bar.url()));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    bar.navigate('userId=1000245&attention=true');
    rerender();
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.search).toBe('');
    expect(bar.query()).toBe('userId=1000245&attention=true');
  });

  it('lets a link that lands MID-TYPING win over the half-typed term', () => {
    const bar = addressBar('');
    const { result, rerender } = renderHook(() => useUrlSearch(bar.url()));
    act(() => result.current.setSearch('ja'));
    // Before the typing settles, the operator opens a task from the bell.
    bar.navigate('state=pending&q=1000245');
    rerender();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.search).toBe('1000245');
    expect(bar.set).not.toHaveBeenCalled();
  });
});
