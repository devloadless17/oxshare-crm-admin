'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { QueryKey } from '@tanstack/react-query';
import { useResource, type Resource } from '@/hooks/use-resource';

/** The URL parameter naming the ONE record a link opened — `?open=<uuid>`. */
export const OPEN_PARAM = 'open';

/** Every record a task opens is named by a uuid; anything else names nothing. */
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The record open on this desk — named by the URL, so a notification, a row
 * click, a pasted link and a refresh all open the same thing.
 *
 * A notification names a RECORD, so its link names the record — never a search
 * typed into the box on the reader's behalf, which filtered by client (showing
 * every row of theirs), looked like something the reader had typed, and stayed
 * on the queue after they moved on. The desk opens normally, unfiltered, with
 * the record's detail panel over it.
 *
 * Opening and closing touch only `open`: any filter the reader set stays. Both
 * REPLACE rather than push, so Back leaves the desk rather than stepping through
 * every record looked at — through the History API, which the App Router syncs
 * into `useSearchParams`, so this needs no router (a page rendered without one,
 * as in a unit test, still opens and closes).
 */
export function useOpenRecord(): {
  openId: string | undefined;
  open: (id: string) => void;
  close: () => void;
} {
  // Null outside the App Router — an absent URL opens nothing.
  const openId = useSearchParams()?.get(OPEN_PARAM) || undefined;

  const write = useCallback((id: string | undefined) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(OPEN_PARAM, id);
    else url.searchParams.delete(OPEN_PARAM);
    window.history.replaceState(null, '', url);
  }, []);
  const open = useCallback((id: string) => write(id), [write]);
  const close = useCallback(() => write(undefined), [write]);

  return { openId, open, close };
}

/** The opened record's fetch, and what `RecordSheet` needs to draw it. */
export interface OpenedRecordState<D> {
  openId: string | undefined;
  /**
   * The link names no record at all (a mangled or hand-edited URL). Answered as
   * unavailable at once: asking would earn a 400 that React Query retries,
   * holding "Opening the record…" on screen for seconds before failing.
   */
  malformed: boolean;
  open: (id: string) => void;
  close: () => void;
  query: Resource<D>;
}

/**
 * `useOpenRecord` plus the fetch: the desk's OWN list endpoint asked for that
 * one id, in any state, under the desk's own list key — so every refresh of
 * the queue (a colleague's decision arriving over the socket included) moves
 * the opened record with it.
 */
export function useOpenedRecord<D>(
  listKey: (params: { id: string | undefined; limit: number }) => QueryKey,
  fetchList: (params: { id?: string; limit: number }, signal: AbortSignal) => Promise<D>,
): OpenedRecordState<D> {
  const { openId, open, close } = useOpenRecord();
  const malformed = openId !== undefined && !RECORD_ID.test(openId);
  const params = { id: openId, limit: 1 };
  const query = useResource(listKey(params), (signal) => fetchList(params, signal), {
    enabled: Boolean(openId) && !malformed,
  });
  return { openId, malformed, open, close, query };
}
