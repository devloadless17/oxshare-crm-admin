import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUrlSeededState } from './use-url-seeded-state';

/**
 * A desk's search box, seeded by the link that brought the reader — and
 * RE-seeded by the next one. The re-seed is the case this hook exists for:
 * following a second notification while already on the desk is a navigation to
 * the same route, nothing remounts, and a once-only seed keeps the first
 * client's filter while the address bar names the second.
 */

const search = { current: new URLSearchParams() };
vi.mock('next/navigation', () => ({ useSearchParams: () => search.current }));

beforeEach(() => {
  search.current = new URLSearchParams();
});

describe('useUrlSeededState', () => {
  it('starts from the URL', () => {
    search.current = new URLSearchParams('q=1000245');
    const { result } = renderHook(() => useUrlSeededState('q'));
    expect(result.current[0]).toBe('1000245');
  });

  it('keeps what the reader typed while the URL stays put', () => {
    search.current = new URLSearchParams('q=1000245');
    const { result, rerender } = renderHook(() => useUrlSeededState('q'));
    act(() => result.current[1]('ada'));
    rerender();
    expect(result.current[0]).toBe('ada');
  });

  it('re-seeds when a new link names another client, and says so once', () => {
    const onReseed = vi.fn();
    search.current = new URLSearchParams('q=1000245');
    const { result, rerender } = renderHook(() => useUrlSeededState('q', onReseed));
    act(() => result.current[1]('typed over'));

    search.current = new URLSearchParams('q=1000999');
    rerender();
    expect(result.current[0]).toBe('1000999');
    expect(onReseed).toHaveBeenCalledTimes(1);

    rerender();
    expect(onReseed).toHaveBeenCalledTimes(1);
  });

  it('reads an absent parameter as no filter', () => {
    const { result } = renderHook(() => useUrlSeededState('q'));
    expect(result.current[0]).toBe('');
  });
});
