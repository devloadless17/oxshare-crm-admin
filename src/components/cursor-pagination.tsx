'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/** The rows-per-page a cursor list offers (the buyer asked for 500, 9 Oct 2026). */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

/** "10,000" in the reader's own grouping; `+` when the server stopped counting. */
function totalText(total: number, capped?: boolean): string {
  return `${total.toLocaleString()}${capped ? '+' : ''}`;
}

/**
 * First / Previous / Next / Last for a cursor-paginated list.
 *
 * PLATFORM-CONVENTIONS R-2.4. A cursor names a ROW, so every page — the last
 * one included — costs the server the same at any depth, and nothing is skipped
 * or repeated while the list is being written to. What it cannot do is jump to
 * "page 4,317"; the period and the filters do that job.
 *
 *  - **The total is the server's**, and stops at 10,000 ("10,000+") so counting
 *    costs the same however large the table grows. Absent when not asked for.
 *  - **First and Last are real**: Last is the server reading the same index
 *    backwards, not an offset computed from a total.
 *  - **The size control renders only when the caller can act on it.** A
 *    dropdown that silently does nothing was the buyer's report on Deposits and
 *    Positions (9 Oct 2026).
 */
export function CursorPagination({
  pageSize,
  showing,
  total,
  totalCapped,
  canGoBack,
  canGoForward,
  onFirst,
  onBack,
  onNext,
  onLast,
  onPageSizeChange,
  page,
  pageCount,
  onPage,
  noun = ['entry', 'entries'],
}: {
  pageSize: number;
  /** Rows on THIS page — the honest number, since there is no offset to compute from. */
  showing: number;
  /** Only when the caller asked the API to count. */
  total?: number;
  /** The server stopped counting at `total`: render it with a `+`. */
  totalCapped?: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onFirst?: () => void;
  onBack: () => void;
  onNext: () => void;
  onLast?: () => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** The numbered page on screen; absent past the numbered range (cursor). */
  page?: number;
  /** How many numbered pages there are — the first 10,000 rows. */
  pageCount?: number;
  /** Jump to a numbered page. With it, the page numbers render. */
  onPage?: (page: number) => void;
  noun?: [string, string];
}) {
  const sizeOptions = Array.from(new Set([...PAGE_SIZE_OPTIONS, pageSize])).sort((a, b) => a - b);
  const button =
    'inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent focus-outline';

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3 text-xs md:text-sm text-muted-foreground border-t border-border">
      <div className="flex flex-wrap items-center gap-4">
        {/*
          One key per sentence, not "Showing" + count + noun + "of" + total
          assembled from JSX children: word order moves between languages.
        */}
        <span>
          {total === undefined
            ? t('pagination.summary', { showing, noun: showing === 1 ? noun[0] : noun[1] })
            : t('pagination.summaryOfTotal', {
                showing,
                noun: showing === 1 ? noun[0] : noun[1],
                total: totalText(total, totalCapped),
              })}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('pagination.rowsPerPage')}
            </span>
            <Select
              value={String(pageSize)}
              // Not money: a page size, from a fixed list this component renders.
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

      <div className="flex items-center gap-1.5">
        {onFirst && (
          <button
            type="button"
            onClick={onFirst}
            disabled={!canGoBack}
            aria-label={t('pagination.firstAria')}
            title={t('pagination.firstTitle')}
            className={button}
          >
            <ChevronsLeft className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label={t('pagination.previous')}
          className={button}
        >
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
          {t('pagination.previous')}
        </button>
        {onPage &&
          pageCount !== undefined &&
          pageWindow(page, pageCount).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1 text-xs">
                {t('pagination.ellipsis')}
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                aria-current={n === page ? 'page' : undefined}
                aria-label={t('pagination.page', { number: n })}
                className={
                  n === page
                    ? `${button} border-primary bg-primary text-primary-foreground hover:bg-primary`
                    : button
                }
              >
                {n.toLocaleString()}
              </button>
            ),
          )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoForward}
          aria-label={t('pagination.next')}
          className={button}
        >
          {t('pagination.next')}
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
        </button>
        {onLast && (
          <button
            type="button"
            onClick={onLast}
            disabled={!canGoForward}
            aria-label={t('pagination.lastAria')}
            title={t('pagination.lastTitle')}
            className={button}
          >
            <ChevronsRight className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The page numbers to draw: the first, the last, and two either side of the
 * current one, with a gap (`null`) where numbers are skipped. Past the numbered
 * range (`current` undefined) only the first few are drawn, to jump back.
 */
function pageWindow(current: number | undefined, count: number): (number | null)[] {
  const wanted = new Set<number>([1, count]);
  // Five consecutive numbers around the current page, kept whole at either end.
  const centre = current ?? 1;
  const from = Math.max(1, Math.min(centre - 2, count - 4));
  const to = Math.min(count, Math.max(centre + 2, 5));
  for (let n = from; n <= to; n += 1) wanted.add(n);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - (sorted[i - 1] ?? n) > 1) out.push(null);
    out.push(n);
  });
  return out;
}
