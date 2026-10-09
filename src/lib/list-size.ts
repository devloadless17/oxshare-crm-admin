import { PAGE_SIZES, type PageSize } from '@/lib/page-param';

/**
 * Each list's rows-per-page, remembered in THIS browser (9 Oct 2026).
 *
 * A per-viewer convenience and nothing more: the URL's `?limit=` still wins, so
 * a pasted link opens at the size it was shared at, and a missing or blocked
 * storage simply means the default. Every access is guarded — storage throws in
 * private windows and when site data is blocked.
 */
const KEY = (listId: string) => `oxshare-admin-list-size:${listId}`;

export function readListSize(listId: string): PageSize | undefined {
  try {
    const raw = parseInt(window.localStorage.getItem(KEY(listId)) ?? '', 10);
    return PAGE_SIZES.find((size) => size === raw);
  } catch {
    return undefined;
  }
}

export function writeListSize(listId: string, size: PageSize): void {
  try {
    window.localStorage.setItem(KEY(listId), String(size));
  } catch {
    // Not remembered — the list still changes size for this visit.
  }
}
