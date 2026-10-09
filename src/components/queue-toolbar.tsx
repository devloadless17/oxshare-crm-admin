'use client';

import { Input } from '@/components/ui/input';

/**
 * The filter strip and search box that sits above a review queue.
 *
 * ## Why this is a component and not markup on three pages
 *
 * KYC, partner applications and withdrawals are the same screen with different
 * nouns: a status-filtered, searchable backlog somebody works down. They had
 * three different toolbars — KYC had pills with counts and a search box, the
 * partner queue had neither, withdrawals had a `<select>` — so an operator
 * moving between them had to relearn the controls each time, and "filter by
 * status" meant a different interaction on each screen.
 *
 * Lifted from the KYC page, which had the version worth keeping.
 *
 * ## The COUNT is on the tab, and it comes from the server
 *
 * A backlog's size is the thing a reviewer is deciding from — "should I be in
 * here at all" — so it belongs on the control that selects it rather than
 * discovered by clicking through. Every endpoint behind these screens returns
 * per-status counts for exactly this, computed across the whole filtered set
 * rather than the page.
 *
 * `undefined` renders no badge at all, rather than a zero: "none" and "not
 * counted yet" are different claims, and a 0 that turns into 47 a moment later
 * is the kind of flicker that makes somebody distrust the number.
 *
 * ## Searching RESETS the page, and that is the caller's job
 *
 * Both callbacks fire on every keystroke and every tab click. A caller that
 * changes the filter without returning to page 1 leaves the reader on page 4 of
 * a result set that now has two pages, which renders as an empty queue — the
 * failure mode this whole family of screens is most often wrong about.
 */
export interface QueueFilter<T extends string> {
  /** The value passed back. Use `''` for "all". */
  value: T;
  label: string;
  /** Server-side count. Omit when the endpoint does not report one. */
  count?: number;
}

export function QueueToolbar<T extends string>({
  filters,
  active,
  onFilterChange,
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  extra,
}: {
  filters: readonly QueueFilter<T>[];
  active: T;
  onFilterChange: (value: T) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Named for the QUEUE — "Search withdrawals", not "Search". */
  searchAriaLabel: string;
  /** Controls beside the search — the period picker. */
  extra?: React.ReactNode;
}) {
  return (
    /*
     * `justify-between` is what puts the search on the RIGHT of every one of
     * these screens. KYC used a plain `gap-4` row, so its box sat immediately
     * after the last tab and moved horizontally as the tab labels changed —
     * three queues with the search control in three different places.
     */
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/*
        The tabs live INSIDE a bordered strip, which is the shape the KYC queue
        already had and the other two did not. It is not decoration: it groups
        the filters into one control so they read as alternatives to each other
        rather than as loose buttons sharing a row with the search box.
      */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1"
        role="group"
      >
        {filters.map((filter) => {
          const selected = filter.value === active;
          return (
            <button
              key={filter.value || 'all'}
              type="button"
              onClick={() => onFilterChange(filter.value)}
              /*
               * `aria-pressed` rather than `role="tab"`, and the distinction is
               * not pedantry: a tablist owns tabpanels and moves selection with
               * the arrow keys, which is not what these do — they re-query a
               * single table. Announcing them as tabs would promise a keyboard
               * model they do not implement.
               */
              aria-pressed={selected}
              className={`focus-outline flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? 'bg-primary/10 font-semibold text-link'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{filter.label}</span>
              {filter.count !== undefined && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {filter.count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <Input
          className="h-9 max-w-xs"
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
