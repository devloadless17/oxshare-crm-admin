'use client';

import type { QueryKey } from '@tanstack/react-query';
import { useDateRange } from '@/hooks/use-date-range';
import { useResource } from '@/hooks/use-resource';
import type { TableQueryState } from '@/hooks/use-table-query-state';
import type { DatePreset, ResolvedRange } from '@/lib/date-presets';

/**
 * A work queue's tab counts — each the number of rows its tab shows WHEN
 * CLICKED (the owner's call, 6 Oct 2026).
 *
 * The queues open each tab on its own period: a waiting tab (Pending…) on All
 * time, so an old request never hides, and a decided tab on Today. So the counts
 * are asked for once per GROUP, over that group's own period; a period the
 * reader chose carries across every tab, the two keys are then equal, and React
 * Query makes one request.
 *
 * ⚠️ The counts never come from the list on screen, and a count is shown only
 * over the period it was asked for. The list keeps its previous page while the
 * next loads (`placeholderData`), so switching from Waiting (All time) to
 * Deposited (Today) showed the all-time "3" for a moment before Today's "0"
 * (reported 9 Oct 2026). A number for the wrong period is a wrong number: a
 * blank is shown instead until the right one arrives.
 */
export function useTabCounts<C extends Partial<Record<string, number>>>({
  url,
  isWaiting,
  key,
  fetchCounts,
  waitingDefault = 'all',
  decidedDefault = 'today',
}: {
  url: TableQueryState;
  /** Which tab values (as keyed in the counts) are waiting ones. */
  isWaiting: (tab: string) => boolean;
  /**
   * The SAME list's registry key, for one group's period. It must carry a
   * marker of its own: React Query ignores undefined fields, so `{ limit: 1 }`
   * would share a cache entry with a detail panel's `{ id: undefined, limit: 1 }`.
   */
  key: (range: ResolvedRange) => QueryKey;
  /** The same list, asked over one group's period, for its counts. */
  fetchCounts: (range: ResolvedRange, signal: AbortSignal) => Promise<C | undefined>;
  waitingDefault?: DatePreset;
  decidedDefault?: DatePreset;
}): (tab: string) => number | undefined {
  // Each group's period: its own default, or the period the reader chose.
  const waiting = useGroupCounts(useDateRange(url, waitingDefault).range, key, fetchCounts);
  const decided = useGroupCounts(useDateRange(url, decidedDefault).range, key, fetchCounts);

  return (tab: string) => {
    const source = isWaiting(tab) ? waiting : decided;
    // A loaded answer without the tab means none in its period: say 0, not a blank.
    return source ? (source[tab] ?? 0) : undefined;
  };
}

/** One group's counts — or nothing while the answer for THIS period is not in. */
function useGroupCounts<C>(
  range: ResolvedRange,
  key: (range: ResolvedRange) => QueryKey,
  fetchCounts: (range: ResolvedRange, signal: AbortSignal) => Promise<C | undefined>,
): C | undefined {
  const period = `${range.from ?? ''}|${range.to ?? ''}`;
  const query = useResource(key(range), async (signal) => ({
    period,
    counts: await fetchCounts(range, signal),
  }));
  // `useResource` keeps the previous key's answer while a new one loads.
  return query.data?.period === period ? query.data.counts : undefined;
}
