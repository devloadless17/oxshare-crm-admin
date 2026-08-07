'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import type { SequentialState } from '@/hooks/use-sequential-mutation';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * Progress and outcome for a batch that is really N separate requests.
 *
 * Rendered inside `DataTable`'s batch bar (`renderBatchActions`) and beneath
 * it. The shape of this component is dictated by one fact: the operation is not
 * atomic, so there are three things to say rather than one.
 *
 *  - WHILE RUNNING: how far through, and an offer to stop. "7 of 10" rather
 *    than a spinner, because the number is what tells an operator whether
 *    stopping is still worth anything.
 *  - ON PARTIAL FAILURE: which rows failed and why, kept on screen. This is the
 *    state a plain "something went wrong" toast would destroy — after a partial
 *    batch, "which ones went through?" is the only question that matters, and
 *    the answer disappears with the toast.
 *  - ON SUCCESS: nothing. The rows leave the queue, which says it already.
 *
 * The failure list shows the API's own message per row, for the same reason
 * every other screen here does: "this withdrawal was already settled by
 * another administrator" is the useful half of the refusal.
 */
export function BatchProgress<T>({
  state,
  onCancel,
  describe,
}: {
  state: SequentialState<T>;
  onCancel: () => void;
  /** How to name a row in the failure list — e.g. a client's name. */
  describe: (item: T) => string;
}) {
  if (state.isRunning) {
    return (
      <span className="inline-flex items-center gap-2" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t('batch.progress', { done: state.done, total: state.total })}
        <button
          type="button"
          onClick={onCancel}
          className="rounded bg-primary/15 px-2 py-1 font-medium transition-colors hover:bg-primary/20"
        >
          {t('batch.stop')}
        </button>
      </span>
    );
  }

  if (!state.hasFailures) return null;

  const failures = state.outcomes.filter((o) => !o.ok);
  const succeeded = state.outcomes.length - failures.length;

  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground"
    >
      <p className="flex items-center gap-2 font-semibold text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {/*
         * BOTH numbers, always. "2 failed" alone leaves the operator to work
         * out whether the other eight went through; on a queue of irreversible
         * decisions that is the whole question.
         */}
        {t('batch.partial', { done: succeeded, failed: failures.length })}
      </p>
      <ul className="space-y-1 ps-6">
        {failures.map((f, idx) => (
          <li key={idx} className="text-muted-foreground">
            <span className="font-medium text-foreground">{describe(f.item)}</span>
            {' — '}
            {apiErrorMessage(f.error, t('batch.rowFailed'))}
          </li>
        ))}
      </ul>
    </div>
  );
}
