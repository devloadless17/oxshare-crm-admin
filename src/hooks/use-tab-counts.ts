'use client';

import type { QueryKey } from '@tanstack/react-query';
import { useResource } from '@/hooks/use-resource';
import type { TableQueryState } from '@/hooks/use-table-query-state';
import { resolveRange, type DatePreset, type ResolvedRange } from '@/lib/date-presets';

/**
 * A work queue's tab counts — each the number of rows its tab shows WHEN
 * CLICKED (the owner's call, 6 Oct 2026).
 *
 * The queues open each tab on its own period: a waiting tab (Pending…) on All
 * time, so an old request never hides, and a decided tab on Today. The list on
 * screen comes back with counts over ITS period only, so on Approved/Today the
 * Pending tab read nothing while 65 were waiting — a to-do number that went
 * blank exactly when somebody was looking elsewhere.
 *
 * So the other group's counts are asked for once more, over THAT group's own
 * period, and each tab takes its count from the request whose period it opens
 * on. When the reader picked a period themselves it carries across every tab,
 * so the one request already answers all of them and no second one is made.
 */
export function useTabCounts<C extends Partial<Record<string, number>>>({
  url,
  activeWaiting,
  current,
  isWaiting,
  key,
  fetchCounts,
  waitingDefault = 'all',
  decidedDefault = 'today',
}: {
  url: TableQueryState;
  /** Is the tab on screen a waiting one? */
  activeWaiting: boolean;
  /** The counts the list on screen came back with — over its own period. */
  current: C | undefined;
  /** Which tab values (as keyed in the counts) are waiting ones. */
  isWaiting: (tab: string) => boolean;
  /**
   * The SAME list's registry key, for the other group's period. It must carry a
   * marker of its own: React Query ignores undefined fields, so `{ limit: 1 }`
   * would share a cache entry with a detail panel's `{ id: undefined, limit: 1 }`.
   */
  key: (range: ResolvedRange) => QueryKey;
  /** The same list, asked over the other group's period, for its counts. */
  fetchCounts: (range: ResolvedRange, signal: AbortSignal) => Promise<C | undefined>;
  waitingDefault?: DatePreset;
  decidedDefault?: DatePreset;
}): (tab: string) => number | undefined {
  // A period the reader chose is in the URL, and every tab shows it.
  const chosen = Boolean(url.get('range') || url.get('from') || url.get('to'));
  // Resolved on each render: the strings change only when the day does.
  const otherRange = resolveRange(activeWaiting ? decidedDefault : waitingDefault);
  const other = useResource(key(otherRange), (signal) => fetchCounts(otherRange, signal), {
    enabled: !chosen,
  });

  return (tab: string) => {
    const source = chosen || isWaiting(tab) === activeWaiting ? current : other.data;
    // A loaded answer without the tab means none in its period: say 0, not a blank.
    return source ? (source[tab] ?? 0) : undefined;
  };
}
