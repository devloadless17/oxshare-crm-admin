'use client';

import { useCallback, useMemo, useState } from 'react';
import type { TableQueryState } from '@/hooks/use-table-query-state';
import { readListSize, writeListSize } from '@/lib/list-size';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageDir, type PageSize } from '@/lib/page-param';

/** What a cursor-paged list response carries, whatever its row shape. */
export interface CursorPageInfo {
  nextCursor?: string | null;
  prevCursor?: string | null;
  total?: number;
  totalCapped?: boolean;
}

export interface ListPaging {
  /** Send these with the list request. */
  params: { limit: PageSize; cursor?: string; dir?: PageDir; page?: number };
  /** Props for the table's pager, from the response on screen. */
  pager: (
    page: CursorPageInfo | undefined,
    showing: number,
    noun?: [string, string],
  ) => {
    pageSize: number;
    showing: number;
    total?: number;
    totalCapped?: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    onFirst: () => void;
    onBack: () => void;
    onNext: () => void;
    onLast: () => void;
    onPageSizeChange: (size: number) => void;
    page?: number;
    pageCount?: number;
    onPage?: (page: number) => void;
    noun?: [string, string];
  };
}

/**
 * First / Previous / Next / Last for a cursor-paged list, its place kept in the
 * URL (`?cursor=` + `?dir=`), so a refresh, Back and a pasted link all reopen the
 * same rows (9 Oct 2026). Each page costs the server the same at any depth.
 *
 * The size is the URL's `?limit=` when valid, else the one this browser last
 * chose for this list (`listId`), else 25. Changing it starts again at the
 * first page — the old cursor named a position in pages of a different size.
 *
 * Any filter, search or sort change drops the cursor by itself
 * (`useTableQueryState.set`), so no screen can forget to.
 */
export function useListPaging(url: TableQueryState, listId: string): ListPaging {
  const [stored, setStored] = useState(() => readListSize(listId));
  const fromUrl = PAGE_SIZES.find((size) => size === parseInt(url.get('limit'), 10));
  const limit: PageSize = fromUrl ?? stored ?? DEFAULT_PAGE_SIZE;
  const cursor = url.get('cursor') || undefined;
  const rawDir = url.get('dir');
  const dir: PageDir | undefined = rawDir === 'prev' || rawDir === 'last' ? rawDir : undefined;

  const go = useCallback(
    (next: { cursor?: string; dir?: PageDir }) =>
      url.set({ cursor: next.cursor, dir: next.dir, page: undefined }),
    [url],
  );

  const setSize = useCallback(
    (size: number) => {
      const chosen = PAGE_SIZES.find((s) => s === size) ?? DEFAULT_PAGE_SIZE;
      writeListSize(listId, chosen);
      setStored(chosen);
      url.set({
        limit: chosen === DEFAULT_PAGE_SIZE ? undefined : String(chosen),
        cursor: undefined,
        dir: undefined,
        page: undefined,
      });
    },
    [listId, url],
  );

  // Numbered while within the first TOTAL_CAP rows; a cursor beyond them.
  const page = cursor || dir ? undefined : Math.max(1, parseInt(url.get('page'), 10) || 1);
  const params = useMemo(() => ({ limit, cursor, dir, page }), [limit, cursor, dir, page]);
  const setPage = useCallback(
    (n: number) =>
      url.set({ page: n > 1 ? String(n) : undefined, cursor: undefined, dir: undefined }),
    [url],
  );

  const pager: ListPaging['pager'] = (data, showing, noun) =>
    hybridPager(data, showing, noun, limit, page, setPage, go, setSize);

  return { params, pager };
}

/**
 * NUMBERED pages for the first TOTAL_CAP rows — an offset that deep is a few
 * milliseconds at any table size — and the cursor beyond them, so Next and Last
 * still cost the same however large the list grows (owner, 9 Oct 2026).
 */
function hybridPager(
  data: CursorPageInfo | undefined,
  showing: number,
  noun: [string, string] | undefined,
  limit: PageSize,
  page: number | undefined,
  setPage: (n: number) => void,
  go: (next: { cursor?: string; dir?: PageDir }) => void,
  setSize: (size: number) => void,
): ReturnType<ListPaging['pager']> {
  const counted = Math.min(data?.total ?? 0, TOTAL_CAP);
  const pageCount = Math.max(1, Math.ceil(counted / limit));
  const deep = page === undefined;
  return {
    pageSize: limit,
    showing,
    total: data?.total,
    totalCapped: data?.totalCapped,
    canGoBack: deep ? Boolean(data?.prevCursor) : page > 1,
    canGoForward: Boolean(data?.nextCursor),
    onFirst: () => setPage(1),
    onBack: () => {
      if (!deep) setPage(page - 1);
      else if (data?.prevCursor) go({ cursor: data.prevCursor, dir: 'prev' });
    },
    onNext: () => {
      if (!deep && page < pageCount) setPage(page + 1);
      else if (data?.nextCursor) go({ cursor: data.nextCursor });
    },
    onLast: () => (data?.totalCapped ? go({ dir: 'last' }) : setPage(pageCount)),
    onPageSizeChange: setSize,
    page,
    pageCount,
    onPage: setPage,
    noun,
  };
}

/** The most rows a list counts, and the deepest numbered page reaches. */
const TOTAL_CAP = 10_000;

/**
 * The same paging for a list that is part of a larger page (a client profile's
 * tab): its position is held in component state, so it does not fight the
 * page's own URL. The size is still remembered per list in this browser.
 * `resetKey` — the list's filters, joined — starts again at the first page
 * whenever it changes.
 */
export function useLocalListPaging(listId: string, resetKey = ''): ListPaging {
  const [stored, setStored] = useState(() => readListSize(listId));
  const [position, setPosition] = useState<{
    cursor?: string;
    dir?: PageDir;
    page?: number;
    key: string;
  }>({ key: resetKey });
  // A changed filter starts again at the first page — adjusted during render,
  // React's pattern for state that follows a prop, with no stale-page flash.
  const current = position.key === resetKey ? position : { key: resetKey };
  if (current !== position) setPosition(current);

  const limit: PageSize = stored ?? DEFAULT_PAGE_SIZE;
  const page = current.cursor || current.dir ? undefined : (current.page ?? 1);
  const params = useMemo(
    () => ({ limit, cursor: current.cursor, dir: current.dir, page }),
    [limit, current.cursor, current.dir, page],
  );
  const go = (next: { cursor?: string; dir?: PageDir }) => setPosition({ ...next, key: resetKey });
  const setPage = (n: number) => setPosition({ page: n, key: resetKey });
  const setSize = (size: number) => {
    const chosen = PAGE_SIZES.find((s) => s === size) ?? DEFAULT_PAGE_SIZE;
    writeListSize(listId, chosen);
    setStored(chosen);
    go({});
  };

  const pager: ListPaging['pager'] = (data, showing, noun) =>
    hybridPager(data, showing, noun, limit, page, setPage, go, setSize);

  return { params, pager };
}
