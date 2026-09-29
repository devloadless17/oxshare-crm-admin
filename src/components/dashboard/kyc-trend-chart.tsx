'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_RESIZE_DEBOUNCE_MS } from './chart-resize';
import type { KycTrendPoint } from '@/lib/api/admin';
import { useChartTokens } from './chart-theme';
import { ChartTooltip } from './chart-tooltip';
import { axisDate, longDate, tickCount } from './format';
import { t } from '@/lib/i18n';

/**
 * KYC submissions against approvals — two LINES on one axis.
 *
 * ## Why two lines and not a stacked area
 *
 * The two series are not parts of a whole and must not be drawn as one. They
 * bucket on different columns: `submitted` on `submitted_at`, `approved` on
 * `reviewed_at`. A submission made Monday and approved Thursday appears once in
 * each series on its own day, so stacking them would sum a case with itself and
 * claim a total that describes nothing. Two lines let the reader see the real
 * question — whether review is keeping pace with intake — as the gap between
 * them, which is what a backlog actually looks like.
 *
 * ## Why one y-axis
 *
 * Both series are counts of the same kind of thing on the same scale, so they
 * share an axis. Even if their magnitudes diverged, a second y-scale would be
 * the wrong fix: two scales aligned arbitrarily invent a correlation that is
 * not in the data.
 *
 * Two series means a legend is mandatory — identity is never carried by colour
 * alone. Slots 1 and 2 in fixed order; their adjacent CVD separation is what
 * the palette was validated for.
 */
export function KycTrendChart({ points }: { points: KycTrendPoint[] }) {
  const tokens = useChartTokens();
  const submittedColour = tokens.series[0] ?? '#2a78d6';
  const approvedColour = tokens.series[2] ?? '#1baf7a';

  const series = [
    { key: 'submitted' as const, name: t('dashboard.kycSubmitted'), colour: submittedColour },
    { key: 'approved' as const, name: t('dashboard.kycApproved'), colour: approvedColour },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
          allowDecimals={false}
          width={40}
          tickCount={tickCount}
          tick={{ fill: tokens.axis, fontSize: 11 }}
          stroke={tokens.grid}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            /*
             * One tooltip listing EVERY series at that x, so the pointer never
             * has to land on a particular line to get its number. Read off the
             * series definition rather than off `payload` order, so a row keeps
             * its colour and name even on a day where one series is missing.
             */
            const point = payload[0]?.payload as KycTrendPoint | undefined;
            if (!point) return null;
            return (
              <ChartTooltip
                heading={longDate(String(label))}
                rows={series.map((s) => ({
                  name: s.name,
                  value: String(point[s.key]),
                  color: s.colour,
                }))}
              />
            );
          }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.colour}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, fill: s.colour, stroke: tokens.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
