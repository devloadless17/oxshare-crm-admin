'use client';

import { STATS_WINDOWS, type StatsWindow } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/**
 * The 7 / 30 / 90 day window, in ONE row above everything it scopes.
 *
 * Not per-chart, deliberately. Every time series on this dashboard re-fetches
 * against the same window, so the numbers on screen always describe the same
 * slice — a chart carrying its own range control is how two panels come to
 * disagree while both being correct.
 *
 * `radiogroup` rather than three buttons: these are mutually-exclusive options
 * with exactly one selected, which is what a radio group means, and it gives a
 * screen reader "2 of 3 selected" instead of three unrelated buttons. Arrow-key
 * movement between them comes from the same roles.
 */
export function PeriodSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: StatsWindow;
  onChange: (next: StatsWindow) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={t('dashboard.periodLabel')}
      className="inline-flex items-center rounded-lg border border-border bg-card p-1 shadow-xs"
    >
      {STATS_WINDOWS.map((days) => {
        const selected = days === value;
        return (
          <button
            key={days}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(days)}
            className={`h-7 px-3 rounded-md text-xs font-semibold focus-outline disabled:opacity-50 ${
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('dashboard.periodDays', { days })}
          </button>
        );
      })}
    </div>
  );
}
