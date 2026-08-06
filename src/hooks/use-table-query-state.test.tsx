import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableQueryState } from './use-table-query-state';

/**
 * Filters live in the URL so a segment can be LINKED TO.
 *
 * The forcing call site is `/tags`, which shows a client count per tag and has
 * to make it clickable — `/clients?tag=high-risk`. Under client scoping it
 * matters twice over: "look at these forty clients" is a conversation between
 * two administrators with different territories, and a shared URL that resolves
 * per-viewer is exactly right where a screenshot is not.
 */

const searchParams = { current: new URLSearchParams() };
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
  usePathname: () => '/clients',
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
});

/**
 * Render once, then act on the result.
 *
 * `renderHook(...).result.current` INSIDE an `act()` is null — the render has
 * not flushed yet — so the hook has to be created first and only its methods
 * called within `act`.
 */
const mount = () => renderHook(() => useTableQueryState()).result;
const state = () => mount().current;

describe('reading', () => {
  it('returns an empty string for an absent key, never undefined', () => {
    // So call sites stay flat. `url.get('q')` feeding straight into a
    // controlled input is the common case, and `undefined` there flips React
    // from controlled to uncontrolled with a console warning nobody reads.
    expect(state().get('q')).toBe('');
  });

  it('reads a repeated parameter as a list', () => {
    searchParams.current = new URLSearchParams('tag=alpha&tag=beta');
    expect(state().list('tag')).toEqual(['alpha', 'beta']);
  });

  it('defaults the sort order to desc', () => {
    searchParams.current = new URLSearchParams('sort=email');
    expect(state().sort).toEqual({ key: 'email', order: 'desc' });
  });

  it('treats an unrecognised order as desc rather than passing it through', () => {
    // The API answers 400 for an unknown order (R-2.5), so sending one turns a
    // stale bookmark into an error page instead of a list.
    searchParams.current = new URLSearchParams('sort=email&order=sideways');
    expect(state().sort.order).toBe('desc');
  });
});

describe('writing', () => {
  it('uses replace, not push', () => {
    /*
     * With `push`, the debounced search box creates one history entry per
     * keystroke burst and Back walks backwards through typing. One entry per
     * screen is what a filter bar should produce.
     */
    const r = mount();
    act(() => r.current.set({ q: 'alpha' }));
    expect(replace).toHaveBeenCalledWith('/clients?q=alpha', { scroll: false });
  });

  it('merges into the existing query rather than replacing it', () => {
    searchParams.current = new URLSearchParams('status=active');
    const r = mount();
    act(() => r.current.set({ q: 'alpha' }));
    const [url] = replace.mock.calls[0] as [string];
    expect(url).toContain('status=active');
    expect(url).toContain('q=alpha');
  });

  it('DROPS a key set to an empty value', () => {
    // `?country=` is a different request from no country at all — it reaches
    // the API as an empty string, and a filter that is present-but-blank is a
    // filter nobody can see and nobody meant.
    searchParams.current = new URLSearchParams('country=Lebanon');
    const r = mount();
    act(() => r.current.set({ country: '' }));
    expect(replace).toHaveBeenCalledWith('/clients', { scroll: false });
  });

  it('REPLACES a repeated parameter rather than appending to it', () => {
    // Otherwise every tag toggle accumulates and the third click sends
    // `?tag=a&tag=a&tag=a`.
    searchParams.current = new URLSearchParams('tag=alpha');
    const r = mount();
    act(() => r.current.set({ tag: ['beta'] }));
    const [url] = replace.mock.calls[0] as [string];
    expect(url).toBe('/clients?tag=beta');
  });

  it('writes both halves of a sort together', () => {
    // A `sort` with no `order` would leave the API defaulting while the header
    // arrow points the other way.
    const r = mount();
    act(() => r.current.setSort('email', 'asc'));
    const [url] = replace.mock.calls[0] as [string];
    expect(url).toContain('sort=email');
    expect(url).toContain('order=asc');
  });

  it('clears to a bare pathname, so "am I filtered?" is visible in the address bar', () => {
    searchParams.current = new URLSearchParams('q=alpha&status=active');
    const r = mount();
    act(() => r.current.clear());
    expect(replace).toHaveBeenCalledWith('/clients', { scroll: false });
  });
});

describe('isFiltered', () => {
  it('is false on a clean list', () => {
    expect(state().isFiltered).toBe(false);
  });

  it('is true when any filter is set', () => {
    searchParams.current = new URLSearchParams('status=active');
    expect(state().isFiltered).toBe(true);
  });

  it('ignores paging — page three of an unfiltered table is not filtered', () => {
    // Otherwise the "clear filters" control appears on a list with no filters,
    // and clicking it appears to do nothing.
    searchParams.current = new URLSearchParams('cursor=abc&limit=50');
    expect(state().isFiltered).toBe(false);
  });
});
