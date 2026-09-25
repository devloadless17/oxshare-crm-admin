'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebounced } from '@/hooks/use-debounced';
import type { TableQueryState } from '@/hooks/use-table-query-state';

/**
 * A queue's search box, TYPED locally and kept in the URL — in both directions.
 *
 * Typed locally because binding the input to the router drops characters (the
 * Financial page records the production report). Kept in the URL so a refresh
 * or a pasted link shows the same rows. Those two halves were written inline on
 * three screens as "seed from the URL once, write the settled term back", and
 * that shape has a hole: a link followed while ALREADY on the screen (a
 * notification opened from the bell) changes the address bar without
 * remounting anything, the stale local term is written straight back over it,
 * and the operator lands on the unfiltered queue — or, where the link set other
 * filters, on an empty one.
 *
 * So the URL is re-read, and the two directions are told apart:
 *
 *  - an address-bar value this hook did NOT write replaces the box (a link);
 *  - a value it DID write is its own echo and is ignored — re-seeding from it
 *    would drop whatever was typed during the round trip;
 *  - the term is written when the TYPING settles, from the typing's own timer,
 *    never because the URL moved — and a link that lands mid-typing wins over
 *    the half-typed term, so a navigation is never answered with the old one.
 *
 * Writing the term clears `page` — page 4 of the old result is rarely a page of
 * the new one. `term` is the settled value, for the request.
 */
export function useUrlSearch(
  url: TableQueryState,
  delayMs = 300,
): { search: string; setSearch: (value: string) => void; term: string } {
  const fromUrl = url.get('q');
  const [search, setSearchState] = useState(fromUrl);
  const [seenInUrl, setSeenInUrl] = useState(fromUrl);
  const [written, setWritten] = useState<string | null>(null);

  if (fromUrl !== seenInUrl) {
    setSeenInUrl(fromUrl);
    if (fromUrl !== written) setSearchState(fromUrl);
  }

  // The latest address bar for the timer below, which outlives the render
  // that armed it.
  const latestUrl = useRef(url);
  useEffect(() => {
    latestUrl.current = url;
  }, [url]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // What this hook last wrote, for the timer (the render reads `written`).
  const lastWrite = useRef<string | null>(null);

  const setSearch = (value: string) => {
    setSearchState(value);
    clearTimeout(timer.current);
    // The address bar this edit was typed against. If a LINK replaces it before
    // the typing settles, the edit is stale and must not land over the link.
    const against = latestUrl.current.get('q');
    timer.current = setTimeout(() => {
      const now = latestUrl.current.get('q');
      if (now !== against && now !== lastWrite.current) return;
      const next = value.trim();
      if (next === now) return;
      lastWrite.current = next;
      setWritten(next);
      latestUrl.current.set({ q: next || undefined, page: undefined });
    }, delayMs);
  };

  return { search, setSearch, term: useDebounced(search.trim(), delayMs) };
}
