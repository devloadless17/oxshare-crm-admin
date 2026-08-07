'use client';

import { useId } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun = ['entry', 'entries'],
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Singular/plural label, e.g. ['entry', 'entries']. */
  noun?: [string, string];
}) {
  /*
   * `useId`, not a constant: two pagers can be on one screen (a page with two
   * tables), and a duplicated id would point both triggers' accessible name at
   * whichever label the document happened to contain first.
   */
  const rowsPerPageLabelId = useId();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(total, page * pageSize);

  // Generate page numbers array with intelligent ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      if (page <= 3) {
        end = 4;
      } else if (page >= totalPages - 2) {
        start = totalPages - 3;
      }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3 text-xs md:text-sm text-muted-foreground border-t border-border">
      {/* Left: Range text & Rows Per Page dropdown */}
      <div className="flex flex-wrap items-center gap-4">
        <span>
          {/*
            One key, not "Showing" + start + "to" + end + "of" + total + noun
            across seven JSX children with plural agreement inline. That shape
            does not survive translation into any language whose word order or
            plural rules differ, which is most of them. The bold on the numbers
            went with the fragments — emphasis that costs translatability is not
            worth keeping.
          */}
          {t('pagination.range', {
            start: startItem,
            end: endItem,
            total,
            noun: total === 1 ? noun[0] : noun[1],
          })}
        </span>

        <div className="flex items-center gap-2">
          {/*
           * The visible label is ASSOCIATED with the control, not merely next
           * to it.
           *
           * The trigger renders only the number, so without this it announced
           * as an unnamed combobox reading "25" — one of several on a screen,
           * with nothing to say which was rows-per-page. `aria-labelledby`
           * makes the text that is already on screen the accessible name rather
           * than duplicating it into an `aria-label` that could drift from it.
           */}
          <span id={rowsPerPageLabelId} className="text-xs font-medium text-muted-foreground">
            {t('pagination.rowsPerPage')}
          </span>
          {(() => {
            const sizeOptions = Array.from(new Set([10, 25, 50, 100, pageSize])).sort(
              (a, b) => a - b,
            );
            return (
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  // Not money: a page size from this component's own fixed list.
                  // See the note in cursor-pagination.tsx.
                  // eslint-disable-next-line no-restricted-syntax
                  const newSize = Number(val);
                  /*
                   * ONE call, and the RESET IS THE HANDLER'S JOB.
                   *
                   * This used to be `onPageSizeChange?.(newSize)` followed by
                   * `onPageChange(1)`, which silently discarded the size on
                   * every URL-backed table. Both handlers write the query
                   * string through `useTableQueryState.set`, and both read the
                   * SAME `searchParams` snapshot — the one from the render that
                   * is still on screen. So the second `replace` was built from
                   * a URL that did not contain the new limit and overwrote the
                   * first: the operator picked 100, the address bar ended up
                   * with neither `limit` nor `page`, and the table redrew at 25.
                   *
                   * Two writes cannot be merged from here, because this
                   * component cannot see the caller's URL state. So the page
                   * change is not made here at all: every caller writes the
                   * size and the page TOGETHER in one `set`, dropping the page,
                   * which is the same shape every filter on these screens
                   * already uses. `clientPagination` does the equivalent with
                   * its two `useState` setters in `data-table.tsx`.
                   *
                   * The reset is still REQUIRED of a caller — page 4 at 25 a
                   * page is past the end at 100 a page, which renders as an
                   * empty table and reads as "no results".
                   */
                  onPageSizeChange?.(newSize);
                }}
              >
                <SelectTrigger
                  aria-labelledby={rowsPerPageLabelId}
                  className="h-8 w-20 px-2.5 text-xs font-semibold"
                >
                  <SelectValue placeholder={String(pageSize)}>{pageSize}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      </div>

      {/* Right: First, Prev, Page Number Buttons, Next, Last */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* First Page Button */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title={t('pagination.firstTitle')}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-outline"
          aria-label={t('pagination.firstAria')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* Previous Page Button */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          title={t('pagination.previousTitle')}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-outline"
          aria-label={t('pagination.previous')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Numbered Page Buttons */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((pNum, idx) => {
            if (typeof pNum === 'string') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground select-none">
                  {t('pagination.ellipsis')}
                </span>
              );
            }

            const isActive = pNum === page;
            return (
              <button
                key={pNum}
                type="button"
                onClick={() => onPageChange(pNum)}
                className={`h-8 min-w-8 px-2.5 rounded-md text-xs font-semibold transition-all focus-outline ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                    : 'border border-input bg-card text-foreground hover:bg-muted'
                }`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Page ${pNum}`}
              >
                {pNum}
              </button>
            );
          })}
        </div>

        {/* Next Page Button */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title={t('pagination.nextTitle')}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-outline"
          aria-label={t('pagination.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last Page Button */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title={t('pagination.lastTitle')}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-outline"
          aria-label={t('pagination.lastAria')}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
