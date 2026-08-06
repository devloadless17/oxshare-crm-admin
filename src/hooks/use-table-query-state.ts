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
  setSort: (key: string, order: 'asc' | 'desc') => void;
  clear: () => void;
  /** Whether anything is filtered — for showing a "clear filters" control. */
  isFiltered: boolean;
}

/**
 * Table FILTERS live in the URL. The cursor does not.
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
 * ── Why the cursor does not ─────────────────────────────────────────────────
 *
 * `use-cursor-pages.ts` already argues this at length: a cursor is an opaque
 * server-owned token naming a ROW, not something a person should be pasting or
 * having go stale in a history entry from last week. A shared link lands on
 * page one, which is correct.
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

  const setSort = useCallback(
    (key: string, order: 'asc' | 'desc') => set({ sort: key, order }),
    [set],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const sort = useMemo(() => {
    const key = searchParams.get('sort') ?? undefined;
    const raw = searchParams.get('order');
    return { key, order: raw === 'asc' ? ('asc' as const) : ('desc' as const) };
  }, [searchParams]);

  // `cursor` and `limit` are paging, not filtering — a list showing page three
  // of an unfiltered table must not offer to "clear filters".
  const isFiltered = useMemo(
    () => [...searchParams.keys()].some((key) => key !== 'cursor' && key !== 'limit'),
    [searchParams],
  );

  return { get, list, sort, set, setSort, clear, isFiltered };
}
