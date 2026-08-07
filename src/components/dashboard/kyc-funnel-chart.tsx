'use client';

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KycStats } from '@/lib/api/admin';
import { useChartTokens } from './chart-theme';
import { ChartTooltip } from './chart-tooltip';
import { formatCount, tickCount } from './format';
import { t } from '@/lib/i18n';

/**
 * Where every client sits in identity verification — a HORIZONTAL bar chart on
 * an ordinal ramp.
 *
 * ## The form
 *
 * Horizontal, because the category names are long ("Under review", "Not
 * started") and rotated x-axis labels are unreadable. Bars, not a pie: this is
 * a magnitude comparison across six classes and the interesting cases are
 * usually the small ones, which a pie renders as slivers.
 *
 * ## Why an ordinal ramp, not six identities
 *
 * The stages have a real order — a client moves not-started → in-progress →
 * submitted → under-review → approved — so reordering the categories would
 * change the meaning. That makes it ORDINAL, and ordinal takes one hue in
 * monotone lightness steps so the reader sees the progression in the colour
 * itself. Six categorical hues would spend the identity channel on a sequence
 * that colour can express for free, and would leave the eye no cue as to which
 * end is "further along".
 *
 * ## Why `rejected` is not on the ramp
 *
 * It is not a deeper stage; it is the terminal outcome that leaves the
 * sequence. Painting it as step 6 would claim it sits past "approved". It wears
 * the reserved `critical` status colour instead — with its written label
 * beside it, never colour alone — which is the one case where a status token
 * belongs in a chart: the series genuinely means an adverse outcome.
 */

/** The five ordered stages, shallowest first. `rejected` is handled apart. */
const STAGES = ['not_started', 'in_progress', 'submitted', 'under_review', 'approved'] as const;

const STAGE_LABEL: Record<string, string> = {
  not_started: 'dashboard.kycNotStarted',
  in_progress: 'dashboard.kycInProgress',
  submitted: 'dashboard.kycStatusSubmitted',
  under_review: 'dashboard.kycUnderReview',
  approved: 'dashboard.kycStatusApproved',
  rejected: 'dashboard.kycRejected',
};

export function KycFunnelChart({ stats }: { stats: KycStats }) {
  const tokens = useChartTokens();

  /*
   * Built from a FIXED stage list rather than from `Object.entries(byStatus)`.
   * The API guarantees every status is present — a status with no submissions
   * is 0, never absent — and reading a fixed list preserves the funnel order
   * regardless of JSON key order, while making a renamed status show as an
   * empty bar rather than silently reordering the chart.
   */
  const rows = [
    ...STAGES.map((status, index) => ({
      status,
      label: t(STAGE_LABEL[status] as Parameters<typeof t>[0]),
      count: stats.byStatus[status] ?? 0,
      colour: tokens.ordinal[index] ?? tokens.ordinal[0] ?? '#2a78d6',
    })),
    {
      status: 'rejected' as const,
      label: t('dashboard.kycRejected'),
      count: stats.byStatus['rejected'] ?? 0,
      colour: tokens.status.critical,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        layout="vertical"
        // Right margin leaves room for the value labels at each bar's tip —
        // without it the widest bar's number is clipped by the plot edge.
        margin={{ top: 4, right: 44, bottom: 0, left: 0 }}
        // The 2px surface gap that separates touching bars. It is the gap doing
        // the separating, not a stroke drawn around each mark.
        barCategoryGap={6}
      >
        <XAxis
          type="number"
          allowDecimals={false}
          tickCount={tickCount}
          tick={{ fill: tokens.axis, fontSize: 11 }}
          stroke={tokens.grid}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={96}
          tick={{ fill: tokens.axis, fontSize: 11 }}
          stroke={tokens.grid}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          // On bars the mark is the hit target, so no crosshair — a soft wash
          // behind the hovered bar is how it acknowledges the pointer.
          cursor={{ fill: tokens.grid, fillOpacity: 0.45 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as (typeof rows)[number] | undefined;
            if (!row) return null;
            return (
              <ChartTooltip
                heading={row.label}
                rows={[
                  {
                    name: t('dashboard.kycClientsInStage'),
                    value: formatCount(row.count),
                    color: row.colour,
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="count"
          name={t('dashboard.kycClientsInStage')}
          // Capped rather than filling the slot — the band's leftover is air.
          maxBarSize={18}
          // 4px rounded data-end, square at the baseline. On a horizontal bar
          // that is [top-left, top-right, bottom-right, bottom-left] with the
          // rounding on the right, where the bar ends.
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          {/*
           * A Cell per row, because the colour follows the STAGE — the entity —
           * and not the bar's rank. Sorting or filtering this chart must never
           * repaint the survivors.
           */}
          {rows.map((row) => (
            <Cell key={row.status} fill={row.colour} />
          ))}
          {/*
           * The value at the bar's TIP, outside the fill.
           *
           * Outside rather than inside because these bars are 18px and several
           * are short: a label inside a small bar is either clipped or crops
           * its own first characters, and text set on a fill has to fight that
           * fill's luminance. Outside, it wears the muted text token and always
           * clears contrast.
           *
           * This is also what makes the card's `valuesInText` claim true — six
           * bars is few enough that labelling all of them is a readout rather
           * than the "a number on every point" clutter the rule warns about,
           * and without it these counts would exist only inside a tooltip.
           */}
          <LabelList
            dataKey="count"
            position="right"
            /*
             * Recharts types the label as `RenderableText`, a wide union, because
             * a `dataKey` may address any field on the row. Narrowing at runtime
             * rather than asserting `number`: a non-numeric value then renders as
             * itself instead of as `NaN`, which is what the cast would have put
             * on screen. The parameter is left to be inferred from
             * `LabelFormatter` so the union stays whatever Recharts says it is.
             */
            formatter={(value) => (typeof value === 'number' ? formatCount(value) : String(value))}
            style={{ fill: tokens.axis, fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
