'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_RESIZE_DEBOUNCE_MS } from './chart-resize';
import type { WithdrawalVolumePoint } from '@/lib/api/admin';
import { formatMoney } from '@/lib/money';
import { useChartTokens } from './chart-theme';
import { ChartTooltip } from './chart-tooltip';
import { axisDate, formatCount, longDate, tickCount } from './format';
import { plotAmount } from './plot-money';
import { t } from '@/lib/i18n';

/**
 * Withdrawal value requested per day — COLUMNS, one series.
 *
 * ## The form
 *
 * Columns rather than a line, because each day is a discrete settled quantity
 * rather than a continuously-varying level: there is no meaningful value
 * "between" Tuesday and Wednesday, and a line drawn through daily totals
 * invites the eye to read one. Columns also make a zero day legible as a gap at
 * the baseline instead of as a dip that could be a small number.
 *
 * ## Money
 *
 * Every amount on this path is a string and stays one. `plotAmount` converts at
 * the single documented plotting boundary — a bar's HEIGHT is a float and there
 * is no string-based alternative to an SVG y-scale — and its output is never
 * shown to anybody. The tooltip's figure and the caption's total are both
 * rendered from the original strings through `formatMoney`, which is decimal.js
 * underneath. The displayed number and the drawn number therefore come from the
 * same source and never from each other.
 *
 * The y-axis is deliberately UNLABELLED beyond its ticks, and the ticks show
 * raw magnitudes rather than formatted currency: an axis tick is a scale
 * reference, and putting `$1,234.57` on four of them at 11px is unreadable
 * clutter. The exact figure lives in the tooltip, where it is formatted
 * properly, and the period total sits under the chart.
 *
 * ## One axis
 *
 * The daily COUNT is in this data too and is deliberately not plotted here.
 * Value and count are different measures on different scales, and putting them
 * on two y-axes would align two scales arbitrarily and invent a relationship.
 * The count reaches the reader through the tooltip, which carries both numbers
 * for the hovered day without implying a shared scale.
 */
export function WithdrawalVolumeChart({ points }: { points: WithdrawalVolumePoint[] }) {
  const tokens = useChartTokens();
  const colour = tokens.series[1] ?? '#eb6834';

  /*
   * PLOTTING BOUNDARY. `amount` is a float used only to position a rectangle;
   * `totalAmount` — the string — travels alongside it so the tooltip formats
   * from the original rather than from the float.
   */
  const data = points.map((point) => ({
    ...point,
    amount: plotAmount(point.totalAmount),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={tokens.grid} strokeDasharray="" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={axisDate}
          tick={{ fill: tokens.axis, fontSize: 11 }}
          stroke={tokens.grid}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          width={52}
          tickCount={tickCount}
          tick={{ fill: tokens.axis, fontSize: 11 }}
          stroke={tokens.grid}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: tokens.grid, fillOpacity: 0.45 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as (typeof data)[number] | undefined;
            if (!point) return null;
            return (
              <ChartTooltip
                heading={longDate(String(label))}
                rows={[
                  {
                    name: t('dashboard.withdrawalValue'),
                    // From the STRING, never from `point.amount`.
                    value: formatMoney(point.totalAmount, 'USD'),
                    color: colour,
                  },
                  {
                    name: t('dashboard.withdrawalRequests'),
                    value: formatCount(point.count),
                    color: tokens.axis,
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="amount"
          name={t('dashboard.withdrawalValue')}
          fill={colour}
          maxBarSize={18}
          // 4px rounded cap, square at the baseline.
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
