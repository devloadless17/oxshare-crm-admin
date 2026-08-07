'use client';

import { useChartTokens } from './chart-theme';

export interface TooltipRow {
  /** The series name, already translated. */
  name: string;
  /** The value as it should READ — a formatted money string stays a string. */
  value: string;
  /** The series colour, for the line key. */
  color: string;
}

/**
 * One tooltip shape for every chart here.
 *
 * Two rules from the visualisation standard are load-bearing:
 *
 *  - **Values lead, labels follow.** The number is the high-contrast element
 *    and the series name is secondary. That is the legend's hierarchy inverted,
 *    and it is right here because the reader already knows which series they
 *    are pointing at — what they came for is the number.
 *  - **Line keys, not boxes.** A short stroke of the series colour, not a filled
 *    swatch: at this density a box is data-weight ink doing a label's job.
 *
 * Series names arrive as props and are rendered as React children, so they are
 * inserted as text nodes — never assembled into markup.
 */
export function ChartTooltip({ heading, rows }: { heading: string; rows: TooltipRow[] }) {
  const tokens = useChartTokens();

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md"
      /*
       * The popover token, not the card: a tooltip that matches the card it
       * floats over has no edge, and the border alone is not enough separation
       * on the dark surface.
       */
      style={{ pointerEvents: 'none' }}
    >
      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{heading}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="inline-block rounded-full"
              style={{ width: 10, height: 2, backgroundColor: row.color }}
            />
            <span className="font-semibold tabular text-popover-foreground">{row.value}</span>
            <span className="text-muted-foreground">{row.name}</span>
          </li>
        ))}
      </ul>
      {/* `tokens` is read so the component re-renders on a theme change. */}
      <span hidden data-mode={tokens.mode} />
    </div>
  );
}
