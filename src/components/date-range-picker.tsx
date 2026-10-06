'use client';

import { useState } from 'react';
import type { DateRange as DayRange } from 'react-day-picker';
import { Calendar as CalendarIcon, Check, ChevronDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DATE_PRESETS,
  customBounds,
  formatLocalBound,
  parseLocalBound,
  type DatePreset,
  type DateRangeChoice,
  type LocalBound,
} from '@/lib/date-presets';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * THE period control every list shares (`lib/date-presets.ts`,
 * `hooks/use-date-range.ts`).
 *
 * One trigger naming the period ("Today", "1 Oct, 08:00 – 6 Oct 2026, 17:30");
 * the popover lists the presets, and beside them a calendar for a custom
 * from → to with an optional time on each end. A blank time means the whole
 * day — what someone picking dates means.
 *
 * Dumb: it shows the choice it is given and reports the next one. The screen's
 * hook owns the URL write (and goes back to page one).
 *
 * The popover markup follows the api-keys expiry picker, which documents the
 * Base-UI gotchas (`PopoverTrigger` renders a real button, no `asChild`;
 * `active:!scale-100`; the `[--tw-enter-scale:1]` opt-outs).
 */

const PRESET_LABEL: Record<DatePreset, MessageKey> = {
  today: 'dateRange.today',
  yesterday: 'dateRange.yesterday',
  '7d': 'dateRange.last7',
  '30d': 'dateRange.last30',
  thisMonth: 'dateRange.thisMonth',
  lastMonth: 'dateRange.lastMonth',
  '3m': 'dateRange.last3Months',
  thisYear: 'dateRange.thisYear',
  '12m': 'dateRange.last12Months',
  all: 'dateRange.all',
};

export function datePresetLabel(preset: DatePreset): string {
  return t(PRESET_LABEL[preset]);
}

function boundLabel(value: LocalBound): string {
  const date = parseLocalBound(value);
  if (!date) return '';
  return value.includes('T')
    ? date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The trigger's words for a choice. */
export function dateRangeLabel(
  choice: DateRangeChoice,
  custom: { from: LocalBound; to: LocalBound },
): string {
  if (choice !== 'custom') return datePresetLabel(choice);
  const from = boundLabel(custom.from);
  const to = boundLabel(custom.to);
  if (from && to) return `${from} – ${to}`;
  if (from) return t('dateRange.since', { date: from });
  if (to) return t('dateRange.until', { date: to });
  return t('dateRange.all');
}

const timeOf = (value: LocalBound) => (value.includes('T') ? value.slice(11, 16) : '');

export function DateRangePicker({
  choice,
  custom,
  defaultChoice,
  onChange,
  prefix,
  className = '',
}: {
  /** What the period is OF, when not the obvious — "Registered" on the client list. */
  prefix?: string;
  choice: DateRangeChoice;
  custom: { from: LocalBound; to: LocalBound };
  /** The screen's default — marked in the list so the reader knows where "clear" returns. */
  defaultChoice?: DatePreset;
  onChange: (choice: DateRangeChoice, custom?: { from: LocalBound; to: LocalBound }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // The custom draft, started from the current custom bounds each time it opens.
  const [days, setDays] = useState<DayRange | undefined>();
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');

  const openWith = (next: boolean) => {
    if (next) {
      const start = custom.from ? parseLocalBound(custom.from) : undefined;
      const end = custom.to ? parseLocalBound(custom.to) : undefined;
      setDays(start || end ? { from: start, to: end } : undefined);
      setFromTime(timeOf(custom.from));
      setToTime(timeOf(custom.to));
    }
    setOpen(next);
  };

  const draft = (() => {
    if (!days?.from) return undefined;
    const withTime = (date: Date, time: string) => {
      const day = formatLocalBound(date, false);
      return time ? `${day}T${time}` : day;
    };
    return {
      from: withTime(days.from, fromTime),
      to: withTime(days.to ?? days.from, toTime),
    };
  })();
  // The same day with an end time before the start time is not a period.
  const draftValid = (() => {
    if (!draft) return false;
    const { start, end } = customBounds(draft.from, draft.to);
    return Boolean(start && end && start.getTime() < end.getTime());
  })();

  const pick = (preset: DatePreset) => {
    onChange(preset);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger
        type="button"
        aria-label={t('dateRange.label', { period: dateRangeLabel(choice, custom) })}
        className={`focus-outline inline-flex h-9 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm active:!scale-100 ${className}`}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">
          {prefix && <span className="text-muted-foreground">{prefix}: </span>}
          {dateRangeLabel(choice, custom)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-2rem)] p-0 [--tw-enter-scale:1] [--tw-exit-scale:1]"
        align="start"
      >
        <div className="flex max-h-[80vh] flex-col overflow-y-auto sm:flex-row">
          <ul
            className="grid grid-cols-2 gap-0.5 border-b border-border p-2 sm:flex sm:w-44 sm:flex-col sm:border-b-0 sm:border-e"
            aria-label={t('dateRange.presets')}
          >
            {DATE_PRESETS.map((preset) => {
              const active = choice === preset;
              return (
                <li key={preset}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => pick(preset)}
                    className={`focus-outline flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-muted ${
                      active ? 'bg-primary/10 font-semibold text-primary' : ''
                    }`}
                  >
                    <span>
                      {datePresetLabel(preset)}
                      {preset === defaultChoice && (
                        <span className="ms-1 text-xs font-normal text-muted-foreground">
                          {t('dateRange.defaultMark')}
                        </span>
                      )}
                    </span>
                    {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="p-2">
            <p className="px-1 pb-1 text-xs font-semibold text-muted-foreground">
              {t('dateRange.custom')}
            </p>
            <Calendar
              mode="range"
              selected={days}
              onSelect={setDays}
              numberOfMonths={1}
              defaultMonth={days?.from}
              disabled={{ after: new Date() }}
            />
            <div className="grid grid-cols-2 gap-2 px-1 pt-1">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('dateRange.fromTime')}
                <input
                  type="time"
                  value={fromTime}
                  onChange={(event) => setFromTime(event.target.value)}
                  className="focus-outline h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('dateRange.toTime')}
                <input
                  type="time"
                  value={toTime}
                  onChange={(event) => setToTime(event.target.value)}
                  className="focus-outline h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                />
              </label>
            </div>
            <p className="px-1 pt-1 text-xs text-muted-foreground">{t('dateRange.timeHint')}</p>
            <div className="flex justify-end px-1 pt-2">
              <button
                type="button"
                disabled={!draftValid}
                onClick={() => {
                  if (!draft) return;
                  onChange('custom', draft);
                  setOpen(false);
                }}
                className="focus-outline h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('dateRange.apply')}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * An empty list's way out when a PERIOD narrowed it: "Nothing in this period"
 * with one click to the last 30 days or to all time. A screen opening on Today
 * is empty most mornings, and that must read as "nothing yet today", never as
 * "this screen is broken".
 */
export function PeriodWiden({
  choice,
  onChange,
}: {
  choice: DateRangeChoice;
  onChange: (choice: DateRangeChoice) => void;
}) {
  if (choice === 'all') return null;
  const offer30 = choice === 'today' || choice === 'yesterday' || choice === '7d';
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-muted-foreground">{t('dateRange.emptyIn')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {offer30 && (
          <button
            type="button"
            onClick={() => onChange('30d')}
            className="focus-outline h-8 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
          >
            {t('dateRange.widen30')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange('all')}
          className="focus-outline h-8 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
        >
          {t('dateRange.widenAll')}
        </button>
      </div>
    </div>
  );
}
