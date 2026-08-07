'use client';

import * as React from 'react';
import { AsyncBoundary } from '@/components/async-boundary';
import type { ResourceStatus } from '@/hooks/use-resource';
import { useChartTokens } from './chart-theme';
import { t } from '@/lib/i18n';

/**
 * The frame every chart on the dashboard sits in.
 *
 * It exists to make three things impossible to forget rather than to save
 * markup:
 *
 *  1. **Each card owns its own resource.** The `status`/`onRetry` pair is
 *     required, so a card whose endpoint failed renders its own retry inside
 *     its own border. One failed stats call must degrade one card, never blank
 *     the dashboard — which is what a single page-level boundary would do.
 *  2. **A refetch holds the frame.** `isFetching` dims the existing render
 *     instead of dropping back to a spinner. A dashboard that flashes a
 *     skeleton on every period change is one whose layout jumps every few
 *     seconds.
 *  3. **The plot area has a fixed height and the axis band is inside it.** The
 *     x-axis labels are part of the chart, not an overflow — sizing the box to
 *     the plot alone produces a card with its own tiny nested scrollbar.
 */
export function ChartCard({
  title,
  description,
  status,
  isFetching,
  onRetry,
  error,
  errorMessage,
  label,
  endpoints,
  action,
  height = 260,
  valuesInText = false,
  children,
}: {
  title: string;
  /** One line saying what is plotted and over what window. */
  description: string;
  status: ResourceStatus;
  isFetching: boolean;
  onRetry: () => unknown;
  error?: unknown;
  errorMessage: string;
  /** Screen-reader text for the loading state. */
  label: string;
  endpoints: string[];
  /** Optional control in the header — a legend, a link. */
  action?: React.ReactNode;
  /** Plot height INCLUDING the x-axis band. */
  height?: number;
  /**
   * True when every value this chart plots is ALSO on screen as text — in a
   * legend row, a labelled bar, or the header total. See the note where it is
   * used: it is an assertion about this panel, not a styling flag.
   */
  valuesInText?: boolean;
  children: React.ReactNode;
}) {
  const tokens = useChartTokens();

  return (
    <section className="rounded-xl border border-border bg-card shadow-xs flex flex-col">
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {action}
      </div>
      <div className="px-2 pb-4">
        <AsyncBoundary
          status={status}
          label={label}
          endpoints={endpoints}
          onRetry={onRetry}
          error={error}
          errorMessage={errorMessage}
        >
          {/*
           * `ready` is false until hydration, and nothing paints before it.
           *
           * Recharts measures its container to lay out; during a prerender that
           * container has no width, so it renders nothing and warns. Holding the
           * space with a same-height box means the card does not resize when the
           * chart arrives.
           */}
          <div
            style={{ height }}
            className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          >
            {tokens.ready ? (
              children
            ) : (
              <div className="h-full w-full" aria-hidden="true" role="presentation" />
            )}
          </div>
        </AsyncBoundary>
      </div>
      {/*
       * The non-visual route to the same numbers, when the card has one.
       *
       * Tooltips enhance and never gate, and two of the light-mode series sit
       * below 3:1 against this card — so a value reachable only by hovering a
       * low-contrast mark is a value some readers cannot get at all.
       *
       * OPT-IN rather than printed on every card, because it is a factual claim
       * about a specific panel: the composition charts state every figure as
       * text beside the mark, and the two time series carry their period total
       * in the header. Rendering it unconditionally would have asserted the
       * same of the throughput chart, whose per-day values genuinely are
       * tooltip-only — and an accessibility promise that is false is worse than
       * one that is absent, because it stops anyone looking for the gap.
       */}
      {valuesInText && <p className="sr-only">{t('dashboard.chartTableHint')}</p>}
    </section>
  );
}
