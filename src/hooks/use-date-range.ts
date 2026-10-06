'use client';

import { useCallback, useMemo } from 'react';
import type { TableQueryState } from '@/hooks/use-table-query-state';
import {
  isDatePreset,
  resolveRange,
  type DatePreset,
  type DateRangeChoice,
  type LocalBound,
  type ResolvedRange,
} from '@/lib/date-presets';

export interface DateRangeState {
  /** What the reader chose — or the screen's default. */
  choice: DateRangeChoice;
  /** A custom period's bounds as the URL holds them (local wall time); empty otherwise. */
  custom: { from: LocalBound; to: LocalBound };
  /** What to send the API: `from` / `to` instants with offset, `to` exclusive. */
  range: ResolvedRange;
  /** The screen's own default — the picker marks it, and "clear" returns to it. */
  defaultChoice: DatePreset;
  /** Choose a preset, or `custom` with its bounds. Always back to page one. */
  set: (choice: DateRangeChoice, custom?: { from: LocalBound; to: LocalBound }) => void;
}

/**
 * The period a list shows, kept in the URL (`lib/date-presets.ts`).
 *
 * `?range=` holds the PRESET, and only when it differs from the screen's
 * default — so a screen opening on Today has a clean URL, and a bookmark of
 * "Last month" stays last month. A custom period writes `range=custom` and its
 * bounds. A legacy link carrying only `?from=&to=` (dates) is read as custom,
 * so links pasted into tickets before the presets still open what they showed.
 *
 * The default is per screen and may follow its tab: a work queue's Pending tab
 * opens on All time (an old pending request must never hide behind "Today"),
 * its decided tabs on Today.
 */
export function useDateRange(url: TableQueryState, defaultChoice: DatePreset): DateRangeState {
  const raw = url.get('range');
  const from = url.get('from');
  const to = url.get('to');

  const choice: DateRangeChoice =
    raw === 'custom' || (!raw && (from || to)) ? 'custom' : isDatePreset(raw) ? raw : defaultChoice;

  // Re-resolved when the DAY changes, so "Today" left open overnight moves on.
  const day = new Date().toDateString();
  const range = useMemo(
    () => resolveRange(choice, { from, to }),
    // `day` is the clock this depends on; it is read inside resolveRange as `now`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choice, from, to, day],
  );

  const set = useCallback(
    (next: DateRangeChoice, custom?: { from: LocalBound; to: LocalBound }) => {
      url.set({
        range: next === defaultChoice ? undefined : next,
        from: next === 'custom' ? custom?.from || undefined : undefined,
        to: next === 'custom' ? custom?.to || undefined : undefined,
        page: undefined,
      });
    },
    [url, defaultChoice],
  );

  return {
    choice,
    custom: { from: choice === 'custom' ? from : '', to: choice === 'custom' ? to : '' },
    range,
    defaultChoice,
    set,
  };
}
