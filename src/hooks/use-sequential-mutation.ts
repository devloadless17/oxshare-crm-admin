'use client';

import * as React from 'react';

/**
 * Apply one mutation to many rows, one at a time, and report what happened.
 *
 * ## Why this is not a bulk endpoint call
 *
 * There is no bulk endpoint. Nothing in the generated API types accepts more
 * than one id — every approve, reject and settle is a single-row route — so a
 * "batch approve" button can only be a loop over N requests.
 *
 * That is a materially different operation from a bulk endpoint, and this hook
 * exists to stop the UI from pretending otherwise:
 *
 *  - **It is not atomic.** Request 7 of 10 can fail while 1–6 have already
 *    committed. There is no rollback, because each one is a separate,
 *    independently-audited decision on the server. So the result is a
 *    PER-ROW outcome list, not a boolean.
 *  - **It is not fast.** Requests run in SEQUENCE rather than concurrently.
 *    Ten parallel approvals would race the list's own refetch and, on a money
 *    system, would hammer the same rows a human is still reading. Sequential
 *    also means the first failure is visible while the rest are still pending,
 *    which is what makes stopping meaningful.
 *  - **It is interruptible.** `cancel()` stops before the NEXT request. It
 *    cannot recall the ones already sent, and the summary says so by counting
 *    what was actually done.
 *
 * ## What the caller must still do
 *
 * Invalidate its queries when `isRunning` goes false. This hook deliberately
 * does not touch the query client: the rows it mutated are the caller's
 * business, and a hook that guessed the key would be wrong on the first screen
 * that used two.
 */
export interface SequentialOutcome<T> {
  item: T;
  ok: boolean;
  error?: unknown;
}

export interface SequentialState<T> {
  /** True from the first request until the last one settles or it is cancelled. */
  isRunning: boolean;
  /** How many items have been attempted so far. */
  done: number;
  /** How many were requested when this run started. */
  total: number;
  /** Per-item results, in the order attempted. Populated as it goes. */
  outcomes: SequentialOutcome<T>[];
  /** True once a run has finished and at least one item failed. */
  hasFailures: boolean;
}

export function useSequentialMutation<T>(mutate: (item: T) => Promise<unknown>) {
  const [state, setState] = React.useState<SequentialState<T>>({
    isRunning: false,
    done: 0,
    total: 0,
    outcomes: [],
    hasFailures: false,
  });

  /*
   * A ref, not state: it is read INSIDE the loop between awaits, and a state
   * value captured in that closure would be the one from the render that
   * started the run — so cancelling would set a flag the loop cannot see.
   */
  const cancelled = React.useRef(false);

  const run = React.useCallback(
    async (items: T[]): Promise<SequentialOutcome<T>[]> => {
      cancelled.current = false;
      setState({ isRunning: true, done: 0, total: items.length, outcomes: [], hasFailures: false });

      const outcomes: SequentialOutcome<T>[] = [];

      for (const item of items) {
        if (cancelled.current) break;

        try {
          await mutate(item);
          outcomes.push({ item, ok: true });
        } catch (error) {
          /*
           * A failure does NOT stop the run.
           *
           * One row refused — a withdrawal already settled by a colleague, a
           * client whose KYC was withdrawn — says nothing about the other
           * nine, and aborting would leave the operator to work out which of
           * their selection had been processed. Every failure is collected and
           * reported together instead.
           */
          outcomes.push({ item, ok: false, error });
        }

        setState((prev) => ({
          ...prev,
          done: outcomes.length,
          outcomes: [...outcomes],
        }));
      }

      setState((prev) => ({
        ...prev,
        isRunning: false,
        outcomes: [...outcomes],
        hasFailures: outcomes.some((o) => !o.ok),
      }));

      return outcomes;
    },
    [mutate],
  );

  /** Stop before the next request. Already-sent ones cannot be recalled. */
  const cancel = React.useCallback(() => {
    cancelled.current = true;
  }, []);

  /** Clear the last run's summary, e.g. when the selection changes. */
  const reset = React.useCallback(() => {
    setState({ isRunning: false, done: 0, total: 0, outcomes: [], hasFailures: false });
  }, []);

  return { ...state, run, cancel, reset };
}
