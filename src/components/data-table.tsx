'use client';

import * as React from 'react';
import { type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { PageLoader } from './ui/loader';
import { compareValues, type SortType } from '@/lib/table-sort';

// Re-exported: the comparators live in lib/table-sort.ts now, but they are part
// of this component's public surface and callers should not have to know where
// they moved.
export { compareValues, type SortType };
import { Pagination } from './pagination';
import { CursorPagination } from './cursor-pagination';
import { t } from '@/lib/i18n';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  cellClassName?: string;
  headerClassName?: string;
  /** Key used for sorting. If true, header is sortable by row property matching index or header */
  sortable?: boolean;
  sortKey?: string;
  /**
   * How this column's values compare. Defaults to `text`.
   *
   * `money` is not decoration: amounts are decimal STRINGS, and the default
   * text comparison sorted '100.00000000' below '9.00000000'. Any column
   * rendering an amount must declare it.
   */
  sortType?: SortType;
  /**
   * Pin this column to the trailing edge, so it survives horizontal scroll.
   *
   * This exists for exactly one column: the row-actions menu. A wide table
   * scrolls its actions off the right-hand side, and an operator then has to
   * scroll to reach the control they came for — on every row, every time.
   *
   * `end` rather than `right` because the app is being prepared for RTL (see
   * lib/i18n `direction()`), where the trailing edge is the LEFT one. The
   * implementation therefore uses logical `end-0` and a leading border, not
   * `right-0`.
   *
   * Only ONE column should carry this. Two pinned columns need cumulative
   * offsets computed from their widths, which nothing here measures — the
   * second would sit on top of the first.
   */
  sticky?: 'end';
}

export interface DataTableProps<T> {
  caption?: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  /** Dim table during background fetching */
  dimmed?: boolean;
  /** Display centered loader */
  loading?: boolean;
  /** Text shown alongside loader */
  loadingText?: string;
  /**
   * Fill the available height, scroll the rows, and pin the header and footer.
   *
   * The default (`false`) is the document-flow table: it is as tall as its rows
   * and the page scrolls. `fill` makes the table itself the scroll container,
   * so the pagination footer is always on screen instead of being however many
   * rows below the fold — which is where an operator has to go to change page,
   * on every page, every time.
   *
   * This requires an ANCESTOR WITH A BOUNDED HEIGHT. `layout/admin-layout.tsx`
   * provides one (`h-screen` plus `min-h-0` on `<main>`); a page nesting this
   * inside its own `flex-col` must pass `min-h-0` down or the table resolves
   * against `auto` and quietly reverts to growing. That is a layout bug with no
   * error message, so it is stated here rather than discovered.
   */
  fill?: boolean;

  // --- Row Selection Props ---
  selectable?: boolean;
  selectedRowKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  renderBatchActions?: (selectedKeys: string[]) => ReactNode;

  // --- Expandable / Collapsible Row Props ---
  renderExpandedRow?: (row: T) => ReactNode;
  expandedRowKeys?: string[];
  onExpandedChange?: (keys: string[]) => void;

  // --- Sorting Props ---
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  /**
   * Server-side sort handler. Passing it switches off the client-side fallback.
   *
   * `columnKey` is `null` when the operator has cycled the column back OFF —
   * the third click. The caller should drop its sort params entirely and let
   * the endpoint apply its own default ordering, rather than substituting a
   * guess: "no sort" and "sorted by whatever I picked as a default" are
   * different result sets, and only the API knows which one it promises.
   */
  onSortChange?: (columnKey: string | null, direction: 'asc' | 'desc' | null) => void;

  // --- Pagination Props ---
  /**
   * Offset pagination. The path being retired (R-2.4) — kept for lists that are
   * small and static enough that a skipped row is not a risk.
   */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    noun?: [string, string];
  };
  /**
   * Page the rows this table is HOLDING, with the same footer as everyone else.
   *
   * For the endpoints that return their whole list — tags, currencies, payment
   * methods, roles, admin users. They had no pager at all, so `fill` gave them
   * the inert "Showing all N" bar: two grey arrows and a count, a different
   * shape and height from the real footer next door. Two tables that differ
   * only in which footer they drew is exactly the inconsistency this component
   * exists to remove.
   *
   * Client-side is CORRECT here and nowhere else: the rows held are the entire
   * dataset, so paging them is a view concern and "page 2" means what it says.
   * A server-paginated list must keep using `pagination` — see the scope note
   * that sorting carries for the same reason.
   */
  clientPagination?: {
    /** Rows per page. Defaults to 25, matching the server-side lists. */
    pageSize?: number;
    noun?: [string, string];
  };
  /**
   * Cursor pagination — Previous/Next over a keyset endpoint.
   *
   * The correct choice for anything that grows or is written to while being
   * read: offset paging over such a list silently skips rows. Numbered pages
   * cannot survive the change, because a cursor names a row rather than an
   * ordinal — see components/cursor-pagination.tsx.
   */
  cursorPagination?: {
    pageNumber: number;
    pageSize: number;
    showing: number;
    total?: number;
    canGoBack: boolean;
    canGoForward: boolean;
    onBack: () => void;
    onNext: () => void;
    onPageSizeChange?: (pageSize: number) => void;
    noun?: [string, string];
  };
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  dimmed = false,
  loading = false,
  loadingText = 'Loading table data...',
  fill = false,
  selectable = false,
  selectedRowKeys: controlledSelectedKeys,
  onSelectionChange,
  renderBatchActions,
  renderExpandedRow,
  expandedRowKeys: controlledExpandedKeys,
  onExpandedChange,
  sortColumn: controlledSortColumn,
  sortDirection: controlledSortDirection,
  onSortChange,
  pagination,
  clientPagination,
  cursorPagination,
}: DataTableProps<T>) {
  // Local states for uncontrolled usage
  const [localSelectedKeys, setLocalSelectedKeys] = React.useState<string[]>([]);
  const [localExpandedKeys, setLocalExpandedKeys] = React.useState<string[]>([]);
  const [localSortCol, setLocalSortCol] = React.useState<string | undefined>();
  const [localSortDir, setLocalSortDir] = React.useState<'asc' | 'desc'>('asc');

  const selectedKeys = controlledSelectedKeys ?? localSelectedKeys;
  const setSelectedKeys = (keys: string[]) => {
    setLocalSelectedKeys(keys);
    onSelectionChange?.(keys);
  };

  const expandedKeys = controlledExpandedKeys ?? localExpandedKeys;
  const setExpandedKeys = (keys: string[]) => {
    setLocalExpandedKeys(keys);
    onExpandedChange?.(keys);
  };

  const sortCol = controlledSortColumn ?? localSortCol;
  const sortDir = controlledSortDirection ?? localSortDir;

  /*
   * Three states, not two: ascending → descending → unsorted.
   *
   * A two-state toggle has no way back. Once a column is sorted the operator
   * can only swap direction, and the list's own default ordering — newest
   * first, which is what a queue is FOR — becomes unreachable without a page
   * reload. The third click restores it.
   *
   * Clicking a DIFFERENT column always starts at ascending rather than
   * inheriting the previous column's direction, because a descending sort
   * carried silently onto a new column shows a different top row than the one
   * the operator expected to see.
   */
  const handleSort = (key: string) => {
    const isActive = sortCol === key;
    const nextDir: 'asc' | 'desc' | null = !isActive ? 'asc' : sortDir === 'asc' ? 'desc' : null;

    if (onSortChange) {
      onSortChange(nextDir === null ? null : key, nextDir);
    } else {
      setLocalSortCol(nextDir === null ? undefined : key);
      setLocalSortDir(nextDir ?? 'asc');
    }
  };

  /*
   * Client-side sorting fallback, used only when the caller passes no
   * onSortChange. See `compareValues` for why it does not use `<`.
   *
   * SCOPE, stated because it is not obvious from the UI: this sorts the rows
   * currently HELD, which for a paginated table is one page. "The largest
   * withdrawal" is therefore the largest of 25 unless the endpoint sorts. No
   * list endpoint accepts a sort parameter today (PLATFORM-CONVENTIONS R-2.5),
   * so callers that need a true ordering must not mark a column sortable.
   *
   * This comment used to point at a `sortScopeNote` that told the operator which
   * of the two they were looking at. No such identifier existed anywhere in the
   * repo — the only mitigation the code claimed was fiction, which is worse than
   * an acknowledged gap, because a reader checking this behaviour finds a
   * reassuring sentence and stops. It is now `scopeNote` below, and it renders.
   */
  // Column key -> how to compare it, taken from the column definitions so a
  // caller declares the type once, next to the cell that renders it.
  const sortTypes = React.useMemo(() => {
    const map: Record<string, SortType> = {};
    for (const c of columns) {
      const key = c.sortKey ?? (typeof c.header === 'string' ? c.header : undefined);
      if (key) map[key] = c.sortType ?? 'text';
    }
    return map;
  }, [columns]);

  const sortedRows = React.useMemo(() => {
    if (!sortCol || onSortChange) return rows;
    const type = sortTypes[sortCol] ?? 'text';
    return [...rows].sort((a: T, b: T) => {
      // sortCol is a runtime column key, so the read is indexed rather than typed.
      const valA = (a as Record<string, unknown>)[sortCol];
      const valB = (b as Record<string, unknown>)[sortCol];
      const result = compareValues(valA, valB, type);
      return sortDir === 'asc' ? result : -result;
    });
  }, [rows, sortCol, sortDir, onSortChange, sortTypes]);

  /*
   * Client-side paging, applied AFTER sorting and never before it.
   *
   * Sorting a page and then paging the result would order twenty-five rows and
   * call it the ordering of the whole list — the exact failure R-2.5 names.
   * Because these tables hold the entire dataset, sorting first and slicing
   * second gives a true ordering, so a client-side sort is honest here in a way
   * it is not on a server-paginated screen.
   */
  const [clientPage, setClientPage] = React.useState(1);
  const [clientPageSize, setClientPageSize] = React.useState(clientPagination?.pageSize ?? 25);

  /*
   * The page is CLAMPED during render, not corrected by an effect.
   *
   * Deleting the last tag on page 3 leaves `clientPage` past the end, and the
   * table would render empty with no way back. Fixing that with an effect costs
   * a second render pass and shows the empty state for a frame first;
   * `react-hooks/set-state-in-effect` is pointing at exactly that. Deriving the
   * value means the out-of-range page is simply never rendered.
   *
   * `clientPage` stays as it is, so an operator who deletes a row on page 3 of
   * 5 is still on page 3 rather than being thrown to the end.
   */
  const clientTotalPages = Math.max(1, Math.ceil(sortedRows.length / clientPageSize));
  const safeClientPage = Math.min(clientPage, clientTotalPages);

  const pagedRows = React.useMemo(() => {
    if (!clientPagination) return sortedRows;
    const start = (safeClientPage - 1) * clientPageSize;
    return sortedRows.slice(start, start + clientPageSize);
  }, [clientPagination, sortedRows, safeClientPage, clientPageSize]);

  /*
   * True when the operator is looking at a sort that covers only this page.
   *
   * `onSortChange` means the caller sorts server-side, so the ordering is real
   * and no note is warranted. Without it the sort is client-side, and it is
   * misleading precisely when more rows exist than are held — which for a
   * cursor-paginated list is whenever another page is reachable.
   */
  const scopeNote = Boolean(sortCol) && !onSortChange && Boolean(cursorPagination?.canGoForward);

  /*
   * A pinned cell must be OPAQUE and must repeat the row's own tint.
   *
   * `position: sticky` takes the cell out of the scrolling flow but not out of
   * the paint order: a transparent `<td>` lets the columns it is pinned over
   * slide visibly underneath it. So the cell paints `bg-card`, and then repeats
   * whatever tint the row is wearing — hover, or the selected wash — because a
   * pinned cell that keeps the card colour while the rest of its row highlights
   * reads as a gap in the row rather than part of it.
   *
   * `group-hover` works here because the `<tr>` carries `group`.
   */
  /*
   * THE DIVIDER IS A SHADOW, NOT A BORDER.
   *
   * `border-s` did not show until the table was scrolled fully right. Under
   * `border-collapse: collapse` a border belongs to the EDGE SHARED by two
   * cells, not to either cell — so it stays behind with the column the pinned
   * cell has floated away from, and only lines up again when scrolling ends
   * and the two are adjacent once more.
   *
   * `inset 1px 0 0` paints inside the cell itself, so it travels with it and
   * marks the boundary the whole time there is something scrolling underneath.
   * `-1px` on the `end` side would be the RTL equivalent; the inset start edge
   * is correct in both directions here because the column pins to `end-0` and
   * the divider belongs on its leading edge.
   */
  const stickyCellClass = (isSelected: boolean) =>
    [
      'sticky end-0 z-10 shadow-[inset_1px_0_0_var(--color-border)]',
      isSelected
        ? 'bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-card))] group-hover:bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card))]'
        : 'bg-card group-hover:bg-[color-mix(in_oklab,var(--color-muted)_40%,var(--color-card))]',
    ].join(' ');

  /*
   * The header's background, OPAQUE, on every header cell.
   *
   * It used to be `bg-muted/60` on the `<thead>`, which fails twice over once
   * the header is sticky:
   *
   *  1. `/60` is 60% opaque. Rows scrolling underneath show through the column
   *     labels, which is exactly the reported symptom.
   *  2. Under `border-collapse: collapse` a background on `<thead>` or `<tr>`
   *     is not reliably painted at all — the cells own the paint — so even a
   *     solid colour set there would leave the header transparent.
   *
   * `color-mix` reproduces what `bg-muted/60` LOOKED like over the card
   * (60% muted composited onto the card colour) as a single opaque value, so
   * the appearance is unchanged in both themes and nothing shows through.
   */
  const headerCellBg = 'bg-[color-mix(in_oklab,var(--color-muted)_60%,var(--color-card))]';

  /**
   * How many `<td>`s a full-width row needs — the data columns plus whichever
   * of the two leading utility columns are on. Used by the empty row below, and
   * by the expanded-row cell further down; it was computed inline there with
   * the expand column hardcoded as `+ 1`, which was right only because that
   * cell is rendered exclusively when `renderExpandedRow` exists.
   */
  const totalColumnCount = columns.length + (selectable ? 1 : 0) + (renderExpandedRow ? 1 : 0);

  const allKeys = React.useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const isAllSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.includes(k));
  const isSomeSelected = selectedKeys.length > 0 && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(allKeys);
    }
  };

  const toggleSelectRow = (key: string) => {
    if (selectedKeys.includes(key)) {
      setSelectedKeys(selectedKeys.filter((k) => k !== key));
    } else {
      setSelectedKeys([...selectedKeys, key]);
    }
  };

  const toggleExpandRow = (key: string) => {
    if (expandedKeys.includes(key)) {
      setExpandedKeys(expandedKeys.filter((k) => k !== key));
    } else {
      setExpandedKeys([...expandedKeys, key]);
    }
  };

  /*
   * In `fill` mode the loading and empty states occupy the SAME box the table
   * would, rather than collapsing to their content.
   *
   * Otherwise every state change resizes the page: a spinner in a 120px card,
   * then a full-height table, then a short empty card when a filter matches
   * nothing. The controls above the table move each time, so a click aimed at
   * a filter lands on whatever slid under the cursor.
   */
  const fillFrame = fill ? 'flex min-h-0 flex-1 flex-col' : '';

  // Render Loading State
  if (loading) {
    return (
      <div
        className={`rounded-xl border border-border bg-card p-12 text-center shadow-xs ${
          fill ? 'flex min-h-0 flex-1 items-center justify-center' : ''
        }`}
      >
        <PageLoader size="lg" label={loadingText} />
      </div>
    );
  }

  /*
   * EMPTY IS A STATE OF THE TABLE, NOT A REPLACEMENT FOR IT.
   *
   * This used to return the `empty` node on its own and throw the table away —
   * so a filter that matched nothing swapped a full-height frame with column
   * headers and a pager for a short card floating in a tall blank page. Three
   * things went with it: the frame, the header row (which is what tells the
   * operator WHAT was searched), and the footer (which is what tells them the
   * count is zero rather than the list being broken). The screen changed shape
   * between "loading", "empty" and "has rows", which is the same
   * controls-move-under-the-cursor problem `fillFrame` exists to prevent, one
   * state further along.
   *
   * So the empty message is rendered INSIDE `<tbody>` as one cell spanning
   * every column, and the ordinary return below carries on drawing the frame,
   * the header and the footer. `EmptyState` grows to fill that cell and centres
   * itself in it — see the component at the foot of this file.
   *
   * Only in `fill` mode. A document-flow table is as tall as its rows, so there
   * is no height to fill and no shape to preserve; the bare card is still the
   * right answer there, and that is the branch below.
   */
  const isEmpty = rows.length === 0 && Boolean(empty);
  if (isEmpty && !fill) {
    // The card the `empty` node used to draw for itself. It moved out of
    // `EmptyState` because in fill mode the node sits INSIDE the table's frame
    // and a card there would be a border inside a border — so the one case that
    // still needs a frame supplies it here.
    return <div className="rounded-xl border border-border bg-card shadow-2xs">{empty}</div>;
  }

  return (
    <div className={`w-full space-y-3 ${fillFrame}`}>
      {/* Batch Action Bar if selection active */}
      {selectable && selectedKeys.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary animate-in fade-in slide-in-from-top-1">
          <span className="font-semibold">
            {t('table.selectedCount', {
              count: selectedKeys.length,
              noun: selectedKeys.length === 1 ? t('table.row') : t('table.rows'),
            })}
          </span>
          <div className="flex items-center gap-2">
            {renderBatchActions?.(selectedKeys)}
            <button
              type="button"
              onClick={() => setSelectedKeys([])}
              className="px-2 py-1 rounded bg-primary/15 hover:bg-primary/20 font-medium transition-colors"
            >
              {t('table.clearSelection')}
            </button>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div
        className={`rounded-xl border border-border bg-card shadow-xs transition-opacity ${
          dimmed ? 'opacity-60 pointer-events-none' : ''
        } ${
          /*
           * Scrolling moves INWARD in fill mode.
           *
           * The default container scrolls horizontally and is as tall as its
           * rows. In fill mode this element becomes a flex column that owns the
           * height, and the scroll — both axes — belongs to the region below,
           * so that the footer can sit outside it and stay put. Keeping
           * `overflow-x-auto` here as well would produce two nested scroll
           * containers on the same axis, and the outer one would clip the
           * sticky footer it is supposed to be sitting beside.
           */
          fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'overflow-x-auto'
        }`}
      >
        {/*
         * The scroll region. In fill mode it is a real element with its own
         * overflow, which is what `position: sticky` on the header resolves
         * against — sticky positions against the nearest scrolling ancestor,
         * so the header must be inside THIS box rather than inside the page.
         */}
        <div className={fill ? 'min-h-0 flex-1 overflow-auto' : 'contents'}>
          {/*
           * `h-full` ONLY while empty, and it is load-bearing there.
           *
           * A `<table>` is as tall as its rows, so the empty row's own `h-full`
           * has nothing to resolve against without it and the message sits
           * against the header rather than in the middle. It is deliberately
           * NOT applied when there are rows: a table stretched past its content
           * distributes the surplus across its rows, so three rows in a tall
           * frame would render as three enormously padded ones.
           */}
          <table
            className={`w-full text-xs md:text-sm text-left border-collapse ${
              fill && isEmpty ? 'h-full' : ''
            }`}
          >
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead
              className={`border-b border-border text-muted-foreground uppercase text-[11px] font-semibold tracking-wider select-none ${
                /*
                 * A scrolling body with no column labels is unreadable by the
                 * second screenful, so the header pins in fill mode.
                 *
                 * `z-20` outranks the `z-10` on a sticky actions cell: where
                 * the two overlap, in the header's own corner, the header must
                 * win or the pinned body cell paints over its label.
                 *
                 * The border is a `shadow` rather than `border-b` because a
                 * bordered `<thead>` under `border-collapse` scrolls away from
                 * its own border — the border belongs to the collapsed edge
                 * between cells, which is not sticky.
                 *
                 * THE BACKGROUND IS NOT HERE — it is on each `<th>` below.
                 * Under `border-collapse: collapse` the browser does not paint
                 * a background on `<thead>`/`<tr>` reliably, so a colour set
                 * here simply does not appear on a sticky header and the rows
                 * scroll through the text.
                 */
                fill ? 'sticky top-0 z-20 shadow-[inset_0_-1px_0_var(--color-border)]' : ''
              }`}
            >
              <tr>
                {/* Expand Toggle Header Column */}
                {renderExpandedRow && (
                  <th scope="col" className={`w-10 px-3 py-3 text-center ${headerCellBg}`} />
                )}

                {/* Selection Checkbox Header Column */}
                {selectable && (
                  <th scope="col" className={`w-10 px-3 py-3 text-center ${headerCellBg}`}>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-muted-foreground hover:text-foreground focus-outline rounded-sm"
                      title={isAllSelected ? 'Deselect all' : 'Select all'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="h-4 w-4 text-link" />
                      ) : isSomeSelected ? (
                        <MinusSquare className="h-4 w-4 text-link" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                )}

                {/* Columns */}
                {columns.map((c, idx) => {
                  const sortKey =
                    c.sortKey ?? (typeof c.header === 'string' ? c.header : undefined);
                  const isSortable = c.sortable !== false && Boolean(sortKey);
                  const isActiveSort = isSortable && sortCol === sortKey;

                  return (
                    <th
                      key={idx}
                      scope="col"
                      /* `headerCellBg` on EVERY header cell — see its
                         definition for why the colour cannot live on `<thead>`.
                         The pinned column adds only its position and border;
                         its background is the same one, so the header reads as
                         a single bar rather than a patched-together strip. */
                      /*
                       * `whitespace-nowrap` on every header.
                       *
                       * A wrapped column title makes the header row two lines
                       * tall for the sake of one column, and the extra height is
                       * paid on every screen whether or not it wraps. The table
                       * already scrolls horizontally (`overflow-auto` on the
                       * region), so the honest answer to "this does not fit" is
                       * a scrollbar rather than a taller, ragged header.
                       */
                      className={`${headerCellBg} whitespace-nowrap px-4 py-3 font-semibold ${
                        c.align === 'right'
                          ? 'text-right'
                          : c.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      } ${
                        /* A shadow, not a border — see `stickyCellClass`. The
                           header cell needs the same treatment or its divider
                           detaches from the body's while scrolling. */
                        c.sticky === 'end'
                          ? 'sticky end-0 z-10 shadow-[inset_1px_0_0_var(--color-border)]'
                          : ''
                      } ${c.headerClassName ?? ''}`}
                    >
                      {isSortable && sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleSort(sortKey)}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors focus-outline rounded-sm"
                        >
                          <span>{c.header}</span>
                          {isActiveSort ? (
                            sortDir === 'asc' ? (
                              <ChevronUp className="h-3.5 w-3.5 text-link" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-link" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
                          )}
                        </button>
                      ) : (
                        <span>{c.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border/60">
              {/*
               * The empty message, as a row that spans every column.
               *
               * `h-full` on the `<tr>` and the `<td>` is what lets the message
               * centre VERTICALLY: a table row is as tall as its content by
               * default, so without it the card would sit against the header
               * with the rest of the frame empty below it. The chain needs the
               * table itself to be full height too, which is `h-full` on
               * `<table>` in fill mode — see the element above.
               */}
              {isEmpty && (
                <tr className="h-full">
                  <td colSpan={totalColumnCount} className="h-full p-0 align-middle">
                    {empty}
                  </td>
                </tr>
              )}

              {/* `pagedRows` is `sortedRows` verbatim unless `clientPagination`
                  is set, so every other table renders exactly as before. */}
              {pagedRows.map((row) => {
                const key = rowKey(row);
                const isSelected = selectedKeys.includes(key);
                const isExpanded = expandedKeys.includes(key);

                return (
                  <React.Fragment key={key}>
                    <tr
                      className={`group transition-colors ${
                        isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                      }`}
                    >
                      {/* Expand Toggle Cell */}
                      {renderExpandedRow && (
                        <td className="w-10 px-3 py-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => toggleExpandRow(key)}
                            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-outline"
                            title={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-link" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      )}

                      {/* Checkbox Selection Cell */}
                      {selectable && (
                        <td className="w-10 px-3 py-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => toggleSelectRow(key)}
                            /*
                             * Named and stateful, because the icon carries both
                             * and neither reaches assistive technology.
                             *
                             * This announced as "button" — one of many identical
                             * ones down a column — so there was no way to tell
                             * what was being selected, or whether it already was.
                             * The header control beside it has a `title` and was
                             * fine; this one had nothing.
                             *
                             * `aria-pressed` is the toggle-button pattern: it says
                             * "selected" without changing the element's role, so
                             * keyboard behaviour is exactly as before.
                             */
                            aria-label={isSelected ? 'Deselect this row' : 'Select this row'}
                            aria-pressed={isSelected}
                            className="text-muted-foreground hover:text-foreground focus-outline rounded-sm"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-link" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      )}

                      {/* Data Cells */}
                      {columns.map((c, colIdx) => (
                        <td
                          key={colIdx}
                          /*
                           * And on every cell, for the same reason: a row whose
                           * height depends on which of its values happened to be
                           * long makes a list impossible to scan, because the
                           * eye has no fixed rhythm to follow.
                           *
                           * A cell that genuinely needs to wrap — a long note,
                           * say — opts back in with `cellClassName:
                           * 'whitespace-normal'`, which lands after this in the
                           * class list and therefore wins.
                           */
                          className={`whitespace-nowrap px-4 py-3.5 align-middle ${
                            c.align === 'right'
                              ? 'text-right'
                              : c.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          } ${c.sticky === 'end' ? stickyCellClass(isSelected) : ''} ${
                            c.cellClassName ?? ''
                          }`}
                        >
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>

                    {/* Expanded Row Content */}
                    {renderExpandedRow && isExpanded && (
                      <tr className="bg-muted/30 border-b border-border/80">
                        <td colSpan={totalColumnCount} className="p-4">
                          <div className="rounded-lg border border-border/60 bg-card p-4 shadow-2xs animate-in fade-in-50">
                            {renderExpandedRow(row)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/*
         * The footer, OUTSIDE the scroll region.
         *
         * `shrink-0` so a long list cannot squeeze it to nothing: it is a flex
         * sibling of a `flex-1` scroll area, and without this the browser is
         * free to take its height first when space runs short — which is
         * exactly when the operator needs the pager.
         */}
        <div className={fill ? 'shrink-0' : ''}>
          {scopeNote && (
            <p
              role="status"
              className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/20"
            >
              {t('table.sortScopeNote')}
            </p>
          )}

          {/* Integrated Pagination Footer — cursor where the list can change
              underneath the reader (R-2.4), offset only where it cannot. */}
          {/*
           * HORIZONTAL padding only, and no border.
           *
           * Both pagination components already carry their own `py-3` and their
           * own `border-t`. Repeating either here stacked them: two rules a
           * pixel apart with a band of dead space between, which reads as an
           * empty row the table forgot to fill.
           */}
          {cursorPagination && (
            <div className="px-4 bg-muted/20">
              <CursorPagination {...cursorPagination} />
            </div>
          )}
          {/*
           * The SAME pager as a server-paginated table, driven by local state.
           * `Pagination` only needs page/total/pageSize, so it does not care
           * where the numbers come from — which is what lets these tables look
           * identical to the others rather than nearly so.
           */}
          {!cursorPagination && !pagination && clientPagination && (
            <div className="px-4 bg-muted/20">
              <Pagination
                page={safeClientPage}
                pageSize={clientPageSize}
                total={sortedRows.length}
                onPageChange={setClientPage}
                onPageSizeChange={(size) => {
                  setClientPageSize(size);
                  // Back to page one: page 4 of 25-per-page is past the end at
                  // 100-per-page, which renders as an empty table.
                  setClientPage(1);
                }}
                noun={clientPagination.noun}
              />
            </div>
          )}

          {!cursorPagination && pagination && (
            <div className="px-4 bg-muted/20">
              <Pagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={pagination.total}
                onPageChange={pagination.onPageChange}
                onPageSizeChange={pagination.onPageSizeChange}
                noun={pagination.noun}
              />
            </div>
          )}

          {/*
           * An UNPAGINATED table still gets a footer, with the controls inert.
           *
           * Requested so the footer is a fixed part of the frame rather than
           * something that appears only on long lists — a table whose chrome
           * changes shape with its row count is one whose controls move under
           * the cursor. It states the count, which is the honest thing a pager
           * can say when every row is already on screen.
           *
           * Only in `fill` mode. A short, document-flow table with no paging
           * has nothing to say here, and an empty bar under it would be
           * decoration that costs vertical space on every settings screen.
           */}
          {fill && !cursorPagination && !pagination && !clientPagination && (
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5">
              <span className="text-[11px] text-muted-foreground">
                {t('pagination.showingAll', { count: rows.length })}
              </span>
              {/*
               * `aria-hidden` and not focusable: these are the SHAPE of the
               * pager, not controls. A disabled button still reaches a screen
               * reader as "Previous, dimmed", implying a page to go back to on
               * a list that has exactly one — so the arrows are hidden from
               * assistive technology and the count above carries the meaning.
               */}
              {/* `rtl:-scale-x-100` mirrors the arrows rather than swapping
                  the icons: "previous" points at the start of the line, which
                  is the RIGHT in Arabic. A hardcoded ChevronLeft would point at
                  "next" there. */}
              <div className="flex items-center gap-1 rtl:-scale-x-100" aria-hidden="true">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground/40">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground/40">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The "nothing here" message, centred in whatever box it is given.
 *
 * ## It no longer draws its own card
 *
 * It used to be `rounded-xl border bg-card p-12` — a card, because it was
 * rendered INSTEAD of the table and had to supply its own frame. In `fill` mode
 * `DataTable` now renders it inside the table body instead (see the empty row
 * there), so a bordered card here would paint a second border inside the table's
 * own: a box in a box, with the column headers above it.
 *
 * `h-full` plus `flex … items-center justify-center` is what centres it on both
 * axes inside that cell. `min-h-[12rem]` is the floor for the document-flow
 * case, where `DataTable` still returns this on its own and there is no height
 * to fill — without it a bare message would be a single line of text with no
 * presence at all.
 */
export function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 p-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
