'use client';

import { useState } from 'react';
import type { Matcher } from 'react-day-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from '@/lib/i18n';

/**
 * An inclusive from/to date pair for a filter bar — two Popover+Calendar
 * fields emitting `YYYY-MM-DD` strings.
 *
 * Strings at the boundary, Dates only inside: the URL carries `YYYY-MM-DD`
 * (readable, paste-able, and exactly what the API's `from`/`to` take), and
 * the conversion goes through LOCAL date parts in both directions. Round-
 * tripping through `new Date('2026-08-24')` instead would parse as UTC
 * midnight and render as the 23rd for every operator west of Greenwich —
 * an off-by-one on a money filter.
 *
 * The popover markup follows the api-keys expiry field, which documents the
 * Base-UI trigger gotchas (`PopoverTrigger` renders a real button, no
 * `asChild`; `active:!scale-100`; the `[--tw-enter-scale:1]` opt-outs).
 */

function toParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromParam(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [, year, month, day] = match ?? [];
  if (!year || !month || !day) return undefined;
  const date = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function DateField({
  label,
  value,
  onChange,
  disabledDays,
}: {
  label: string;
  /** `YYYY-MM-DD`, or empty for unset. */
  value: string;
  onChange: (next: string | undefined) => void;
  disabledDays?: Matcher;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromParam(value) : undefined;

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          aria-label={label}
          className={`focus-outline flex h-9 w-36 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm active:!scale-100 ${selected ? 'pr-8' : ''}`}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={selected ? '' : 'text-muted-foreground'}>
            {selected ? selected.toLocaleDateString() : label}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 [--tw-enter-scale:1] [--tw-exit-scale:1]"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? toParam(date) : undefined);
              setOpen(false);
            }}
            disabled={disabledDays}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {/*
        Clearing is its own control INSIDE the field, so unsetting one bound
        does not require reopening a calendar and hunting for the already-
        selected day — react-day-picker's single mode has no "no date" cell.
      */}
      {selected && (
        <button
          type="button"
          aria-label={t('financial.dateClear')}
          onClick={() => onChange(undefined)}
          className="focus-outline absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  /** `YYYY-MM-DD` or empty — the URL's own values. */
  from: string;
  to: string;
  /** Called with the next pair; `undefined` clears a bound. */
  onChange: (next: { from: string | undefined; to: string | undefined }) => void;
}) {
  const fromDate = from ? fromParam(from) : undefined;
  const toDate = to ? fromParam(to) : undefined;

  return (
    <div className="flex items-center gap-2">
      <DateField
        label={t('financial.filterFrom')}
        value={from}
        onChange={(next) => onChange({ from: next, to: to || undefined })}
        // The calendar refuses an impossible range outright rather than
        // letting the API answer an empty list for a reason nobody can see.
        disabledDays={toDate ? { after: toDate } : undefined}
      />
      <DateField
        label={t('financial.filterTo')}
        value={to}
        onChange={(next) => onChange({ from: from || undefined, to: next })}
        disabledDays={fromDate ? { before: fromDate } : undefined}
      />
    </div>
  );
}
