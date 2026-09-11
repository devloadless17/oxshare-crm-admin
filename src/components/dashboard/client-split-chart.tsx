'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ClientStats } from '@/lib/api/admin';
import { useChartTokens } from './chart-theme';
import { ChartTooltip } from './chart-tooltip';
import { formatCount } from './format';
import { t } from '@/lib/i18n';

/**
 * The account-status split — a DONUT, with the total in the hole.
 *
 * ## When a donut is the right answer, and why this is one of those times
 *
 * A pie is wrong for comparing close values and wrong past about six segments.
 * This is neither: three mutually-exclusive states that sum to every client, of
 * a shape an operator reads as "almost all active, a sliver suspended" rather
 * than by comparing arc lengths. Part-to-whole at a glance is the one job the
 * form does better than a bar, and the hole is not decoration — it is where the
 * total goes, which is the number a reader wants next.
 *
 * The precise values are NOT gated behind the arcs: each segment is
 * direct-labelled in the legend beside its count, so the chart is readable
 * without hovering and without distinguishing two similar wedges by eye. That
 * is also the relief the palette requires — two light-mode slots sit below 3:1
 * on the card, so every value has a text route.
 *
 * Up to three segments, so slots 1–3 in fixed order. Those three are the set the
 * palette validates under `--pairs all`, which is the harder test and the right
 * one here: any two wedges can end up adjacent. In practice it renders TWO,
 * because `pending` is unreachable — see the note beside the segment list.
 */

interface Segment {
  key: string;
  label: string;
  count: number;
  colour: string;
}

export function ClientSplitChart({ stats }: { stats: ClientStats }) {
  const tokens = useChartTokens();

  /*
   * PENDING IS OMITTED WHILE IT IS ZERO, and that is not a cosmetic tidy.
   *
   * `user_status` is active | pending | suspended, but NO CODE PATH PRODUCES
   * pending: registration writes `active`, and `setClientStatus` is typed
   * 'active' | 'suspended', so there is no way in and no way out. The count is
   * therefore permanently 0 — not "0 right now".
   *
   * A legend reading "Pending — 0" is read by an operator as a fact about
   * CLIENTS ("nobody is pending") when it is a fact about the PRODUCT ("nobody
   * can be"), and nothing on the card tells those apart. That is the identical
   * defect removed from the client-status FILTER, on a second surface: a control
   * the DATA cannot back, rather than one the API cannot.
   *
   * Kept CONDITIONAL rather than deleted, which is the same shape as the filter
   * fix — the offer goes, the handling stays. If a real pending state is ever
   * wired, the segment comes back on its own WITH its transitions rather than
   * ahead of them, and no one has to remember this file.
   *
   * The colour is bound to the KEY, not to the position, so dropping a segment
   * cannot re-skin the two that remain. Suspended stays slot 3 whether pending
   * is shown or not.
   *
   * Deliberately NOT a general "hide any zero segment" rule. Zero SUSPENDED is
   * a true and useful statement about a reachable state, and hiding it would
   * lose information. Only an unreachable state is a lie.
   */
  const segments: Segment[] = [
    {
      key: 'active',
      label: t('dashboard.statusActive'),
      count: stats.byStatus.active,
      colour: tokens.series[0] ?? '#2a78d6',
    },
    {
      key: 'pending',
      label: t('dashboard.statusPending'),
      count: stats.byStatus.pending,
      colour: tokens.series[1] ?? '#eb6834',
    },
    {
      key: 'suspended',
      label: t('dashboard.statusSuspended'),
      count: stats.byStatus.suspended,
      colour: tokens.series[2] ?? '#1baf7a',
    },
  ].filter((segment) => segment.key !== 'pending' || segment.count > 0);

  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  /*
   * A donut of nothing is a grey ring that reads as a rendering failure. With
   * no clients at all, say so in words.
   */
  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('dashboard.noClientsYet')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative h-full flex-1 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const segment = payload[0]?.payload as Segment | undefined;
                if (!segment) return null;
                return (
                  <ChartTooltip
                    heading={segment.label}
                    rows={[
                      {
                        name: t('dashboard.clientsUnit'),
                        value: formatCount(segment.count),
                        color: segment.colour,
                      },
                    ]}
                  />
                );
              }}
            />
            <Pie
              data={segments}
              dataKey="count"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              // The 2px surface gap between segments, in the card colour. It is
              // the gap that separates them, not a stroke around each arc.
              stroke={tokens.surface}
              strokeWidth={2}
              paddingAngle={1}
              isAnimationActive={false}
            >
              {segments.map((segment) => (
                <Cell key={segment.key} fill={segment.colour} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/*
         * The total, in the hole. `pointer-events-none` so it never steals a
         * hover from the arc behind it, and proportional figures rather than
         * `tabular-nums` — equal-width digits make a standalone number look
         * loose at this size.
         */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-semibold text-foreground">{formatCount(total)}</span>
          <span className="text-[11px] text-muted-foreground">{t('dashboard.clientsUnit')}</span>
        </div>
      </div>
      {/*
       * The legend, always present for more than one series — and carrying the
       * counts, so identity and value are both reachable without colour.
       */}
      <ul className="space-y-2 shrink-0 pe-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: segment.colour }}
            />
            <span className="text-xs text-muted-foreground">{segment.label}</span>
            <span className="text-xs font-semibold tabular text-foreground ms-auto">
              {formatCount(segment.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
