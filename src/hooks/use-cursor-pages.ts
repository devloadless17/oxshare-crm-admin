'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Forward/back navigation over a cursor-paginated endpoint.
 *
 * PLATFORM-CONVENTIONS R-2.4. The API moved to keyset pagination because offset
 * paging over a list that is being WRITTEN TO skips rows: a client registers
 * while an admin is on page 3, every later page shifts by one, and one client is
 * never seen — silently, because the reviewer believes they looked at everyone.
 *
 * The visible consequence is that "jump to page 7" is gone, and it has to be:
 * a cursor names a ROW, so there is no way to ask for a page you have not
 * walked to. That is a real trade, and it is the right one here. On a list of
 * ~219,000 clients nobody navigates to page 4,382 — they filter and search.
 * Numbered pages at that scale are the illusion of control, and they were the
 * thing that was broken. This is the model Stripe's dashboard uses for the same
 * reason.
 *
 * Going BACK needs no API support: the cursor that produced each page is kept on
 * a stack, so "previous" is popping it. The stack lives here rather than in the
 * URL because a cursor is an opaque server-owned token — it is not something a
 * user should be pasting, bookmarking, or having go stale in a browser history
 * entry from last week.
 */
export interface CursorPages {
  /** Send as `?cursor=` — `undefined` on the first page. */
  cursor: string | undefined;
  /** 1-based, for display only. Never sent to the API. */
  pageNumber: number;
  canGoBack: boolean;
  /** Call with the `nextCursor` from the response. */
  goNext: (nextCursor: string | null | undefined) => void;
  goBack: () => void;
  /** Back to the first page — used whenever a filter changes. */
  reset: () => void;
}

export function useCursorPages(): CursorPages {
  /**
   * The cursor for each page visited, oldest first. `[]` means "first page".
   *
   * Storing the cursor that OPENED each page — rather than the one that would
   * close it — is what makes `goBack` a pop rather than an off-by-one puzzle.
   */
  const [stack, setStack] = useState<string[]>([]);

  const goNext = useCallback((nextCursor: string | null | undefined) => {
    // A null cursor means the server said this is the last page. Ignoring the
    // call is better than advancing to an empty one and making the user press
    // "previous" to recover from a button that should not have been active.
    if (!nextCursor) return;
    setStack((previous) => [...previous, nextCursor]);
  }, []);

  const goBack = useCallback(() => {
    setStack((previous) => previous.slice(0, -1));
  }, []);

  const reset = useCallback(() => setStack([]), []);

  return useMemo(
    () => ({
      cursor: stack[stack.length - 1],
      pageNumber: stack.length + 1,
      canGoBack: stack.length > 0,
      goNext,
      goBack,
      reset,
    }),
    [stack, goNext, goBack, reset],
  );
}
