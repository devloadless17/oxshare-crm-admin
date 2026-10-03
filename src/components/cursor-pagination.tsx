'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/**
 * Previous / Next navigation for a cursor-paginated list.
 *
 * PLATFORM-CONVENTIONS R-2.4. The numbered pages this replaces could not be
 * kept: a cursor names a ROW, so there is no way to ask for a page you have not
 * walked to. That is the cost of the fix, and the fix is worth it — offset
 * paging over a list being written to skips rows, silently, and an admin
 * reviewing a client base believes they saw everyone.
 *
 * Two deliberate choices in what this shows:
 *
 *  - **No total, unless one is passed.** Counting 219,000 rows is a full scan of
 *    the filtered set on every single page view, run purely to render a number
 *    nobody acts on. Where a total IS cheap and useful — a filtered view with a
 *    handful of results — the caller passes it and it appears.
 *  - **The page number is shown but is not a control.** People use it to know
 *    where they are, and losing that is a real cost of cursors; putting it back
 *    as text keeps the orientation without pretending you can jump.
 */
export function CursorPagination({
  pageNumber,
  pageSize,
  showing,
  total,
  canGoBack,
  canGoForward,
  onBack,
  onNext,
  onPageSizeChange,
  noun = ['entry', 'entries'],
}: {
  pageNumber: number;
  pageSize: number;
  /** Rows on THIS page — the honest number, since there is no offset to compute from. */
  showing: number;
  /** Only when the caller asked the API to count. */
  total?: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onNext: () => void;
  onPageSizeChange?: (pageSize: number) => void;
  noun?: [string, string];
}) {
  const sizeOptions = Array.from(new Set([10, 25, 50, 100, pageSize])).sort((a, b) => a - b);

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3 text-xs md:text-sm text-muted-foreground border-t border-border">
      <div className="flex flex-wrap items-center gap-4">
        {/*
          One key per sentence, not "Showing" + count + noun + "of" + total
          assembled from five JSX children. Word order moves between languages
          and count/noun agreement moves with it, so the fragments were
          untranslatable. The bold on the numbers went with them: emphasis that
          costs translatability is not worth keeping.
        */}
        <span>
          {total === undefined
            ? t('pagination.summary', { showing, noun: showing === 1 ? noun[0] : noun[1] })
            : t('pagination.summaryOfTotal', {
                showing,
                noun: showing === 1 ? noun[0] : noun[1],
                total,
              })}
        </span>

        {/*
          Only when the caller can act on it. `onPageSizeChange` is optional, and
          this control used to render regardless — so on /ledger and /audit-log,
          which do not pass it, an operator could open "Rows per page", choose
          50, and watch the list stay at 25. A dropdown that silently does
          nothing is worse than no dropdown: it reads as a broken page.
        */}
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('pagination.rowsPerPage')}
            </span>
            <Select
              value={String(pageSize)}
              // Not money: a page size, from a fixed list this component renders
              // (10/25/50/100). The money-path rule is right to be broad — every
              // other Number() on these screens is a balance — so the exception is
              // disabled narrowly and stated rather than the rule being widened.
              // eslint-disable-next-line no-restricted-syntax
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger
                aria-label={t('pagination.rowsPerPage').replace(/:$/, '')}
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
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/*
          Interpolated, not concatenated — the same rule the note above states,
          which this line broke. `t('pagination.page')` on its own returns the
          template verbatim, so the footer of every paginated screen read
          "Page {number} 1": the literal placeholder, then the number beside it.
        */}
        <span className="px-2 text-xs font-medium">
          {t('pagination.page', { number: pageNumber })}
        </span>
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label={t('pagination.previous')}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent focus-outline"
        >
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
          {t('pagination.previous')}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoForward}
          aria-label={t('pagination.next')}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent focus-outline"
        >
          {t('pagination.next')}
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
