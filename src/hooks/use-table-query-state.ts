'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface TableQueryState {
  /** A single value, or `''` when absent — never undefined, so callers stay flat. */
  get: (key: string) => string;
  /** A repeated parameter, e.g. `?tag=a&tag=b`. */
  list: (key: string) => string[];
  sort: { key?: string; order: 'asc' | 'desc' };
  /** Merge a patch; empty values remove their key. */
  set: (patch: Record<string, string | string[] | undefined>) => void;
  /** `null` on both clears the sort entirely — see the implementation. */
  setSort: (key: string | null, order: 'asc' | 'desc' | null) => void;
  clear: () => void;
  /** Whether anything is filtered — for showing a "clear filters" control. */
  isFiltered: boolean;
}

/**
 * Table filters, sort and PAGE NUMBER all live in the URL.
 *
 * ── Why filters belong there ────────────────────────────────────────────────
 *
 * `/tags` shows a client count per tag, and that count has to be clickable —
 * `/clients?tag=high-risk`. Without URL state that link cannot exist and the
 * tags screen becomes a read-only list of numbers.
 *
 * It also matters under client scoping: "look at these forty clients" is a
 * conversation between two administrators with DIFFERENT territories, and a
 * shared URL that resolves per-viewer is exactly right where a screenshot is
 * not. And today, changing a filter is invisible to browser history, so Back
 * leaves the page entirely — which is worse than either alternative.
 *
 * ── Why the PAGE NUMBER belongs there too ───────────────────────────────────
 *
 * It did not, once. The paginated tables navigated by CURSOR — an opaque,
 * server-owned token naming a ROW — and the argument for keeping that out of
 * the URL was sound on its own terms: it is not something a person should paste
 * or have go stale in a history entry from last week.
 *
 * What it cost was everything a page number is for. A cursor cannot express
 * "page 7", so an operator had Previous/Next and no way back to where they had
 * been; a refresh, a shared link and the Back button all returned them to page
 * one. `?page=7` survives all three, and it is an ORDINAL — meaningless to
 * paste into a different filter, but harmless there too, since a page past the
 * end of a list renders as an empty one rather than an error.
 *
 * Every caller therefore writes the page and the filter TOGETHER, dropping the
 * page whenever a filter or the sort changes — see `pageParam` in
 * `lib/page-param.ts` for the read side. `isFiltered` below excludes `page` for
 * the same reason: paging is not filtering.
 *
 * ── `replace`, not `push` ───────────────────────────────────────────────────
 *
 * With `push`, the debounced search box creates one history entry per keystroke
 * burst and Back walks backwards through typing. One entry per screen is what a
 * filter bar should produce; deep-linking still works either way.
 *
 * ⚠️ `useSearchParams()` in a client component requires a `<Suspense>` boundary
 * at prerender, or `npm run build` fails — and `next dev` does NOT, so CI is
 * where you find out. `src/app/invite/accept/page.tsx` has the shape to copy: a
 * default export that is a Suspense shell around a `…Content` component.
 */
/** Keys that move WITHIN a list rather than change which list it is. */
const PAGING_KEYS = new Set(['cursor', 'dir', 'page', 'limit', 'open']);
/** Keys that never make a list "filtered". */
const NOT_FILTERS = new Set([...PAGING_KEYS, 'sort', 'order']);

export function useTableQueryState(): TableQueryState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);
  const list = useCallback((key: string) => searchParams.getAll(key), [searchParams]);

  const write = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      // A bare pathname when nothing is set, so "am I filtered?" is answerable
      // at a glance from the address bar rather than by reading a trailing `?`.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const set = useCallback(
    (patch: Record<string, string | string[] | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      /*
       * A cursor names a position in ONE filtered, sorted list. Any change to
       * what the list is — a filter, the search, the sort, the period — makes it
       * meaningless, so it goes with the change, here, rather than every screen
       * having to remember (9 Oct 2026). Paging itself and the record panel
       * leave it alone.
       */
      if (Object.keys(patch).some((key) => !PAGING_KEYS.has(key))) {
        next.delete('cursor');
        next.delete('dir');
        next.delete('page');
      }
      for (const [key, value] of Object.entries(patch)) {
        // Delete first, so a repeated parameter is REPLACED rather than
        // appended to — otherwise every tag toggle would accumulate.
        next.delete(key);
        if (Array.isArray(value)) {
          for (const entry of value) if (entry !== '') next.append(key, entry);
        } else if (value !== undefined && value !== '') {
          next.set(key, value);
        }
      }
      write(next);
    },
    [searchParams, write],
  );

  /*
   * `null` clears the sort — the third click of the asc → desc → off cycle.
   *
   * Both params are dropped together rather than one being left behind: a
   * lingering `order=desc` with no `sort` is a URL that means nothing, and the
   * API is entitled to 400 on it. `set` deletes any key it is handed
   * `undefined`, so this is the same write path as every other filter.
   */
  const setSort = useCallback(
    (key: string | null, order: 'asc' | 'desc' | null) =>
      set({ sort: key ?? undefined, order: order ?? undefined }),
    [set],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const sort = useMemo(() => {
    const key = searchParams.get('sort') ?? undefined;
    const raw = searchParams.get('order');
    return { key, order: raw === 'asc' ? ('asc' as const) : ('desc' as const) };
  }, [searchParams]);

  // `page`, `cursor` and `limit` are paging, not filtering — a list showing
  // page three of an unfiltered table must not offer to "clear filters".
  //
  // `page` joined this list when the tables moved from cursors to numbered
  // pages: without it, walking to page 2 of an unfiltered list lit up the
  // "clear filters" control, which then appeared to do nothing an operator had
  // asked for.
  //
  // Nor is the SORT or the open record panel: sorting a list is not filtering
  // it, and a "Clear filters" that appeared after a header click read as a
  // filter the reader never set.
  const isFiltered = useMemo(
    () => [...searchParams.keys()].some((key) => !NOT_FILTERS.has(key)),
    [searchParams],
  );

  return { get, list, sort, set, setSort, clear, isFiltered };
}
