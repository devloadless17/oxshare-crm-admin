'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RegistrationPoint } from '@/lib/api/admin';
import { useChartTokens } from './chart-theme';
import { ChartTooltip } from './chart-tooltip';
import { axisDate, longDate, tickCount } from './format';
import { t } from '@/lib/i18n';

/**
 * Registrations per day — an AREA chart, one series.
 *
 * Area rather than line because there is exactly one series and the quantity is
 * a count accumulating from a true zero baseline; the wash under the line
 * carries "how many" without a second colour. One series therefore needs no
 * legend — the card title says what is plotted, and a legend box with a single
 * swatch would restate it.
 *
 * The fill is the series hue at ~10% opacity via a gradient that fades to
 * nothing at the baseline, never a saturated block. The line itself is 2px with
 * round joins, and there is no dot on every point: at 90 days that is 90 dots
 * on one line. Only the hovered position gets a marker, ringed in the surface
 * colour so it stays legible where it crosses the line.
 */
export function RegistrationsChart({ points }: { points: RegistrationPoint[] }) {
  const tokens = useChartTokens();
  const colour = tokens.series[0] ?? '#2a78d6';
  const gradientId = React.useId();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.18} />
            <stop offset="100%" stopColor={colour} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/*
         * Horizontal only, and solid. Vertical gridlines on a dense daily series
         * become a hatch; dashed ones read as a projection or a threshold when
         * they are just a grid.
         */}
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
          // The crosshair finds the X: a reader aims at a date, never at a
          // 2px line. `cursor` draws it in the gridline colour so it reads as
          // chrome rather than as data.
          cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const value = payload[0]?.value;
            return (
              <ChartTooltip
                heading={longDate(String(label))}
                rows={[
                  {
                    name: t('dashboard.registrationsSeries'),
                    value: String(value ?? 0),
                    color: colour,
                  },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          name={t('dashboard.registrationsSeries')}
          stroke={colour}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill={`url(#${gradientId})`}
          // No dot per point; the active dot carries a 2px surface ring so it
          // stays visible where it sits on top of the line.
          dot={false}
          activeDot={{ r: 4, fill: colour, stroke: tokens.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
