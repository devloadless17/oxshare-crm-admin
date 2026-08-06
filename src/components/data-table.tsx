'use client';

import * as React from 'react';
import { type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { Loader } from './ui/loader';
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
  onSortChange?: (columnKey: string, direction: 'asc' | 'desc') => void;

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

  const handleSort = (key: string) => {
    let nextDir: 'asc' | 'desc' = 'asc';
    if (sortCol === key) {
      nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    }
    if (onSortChange) {
      onSortChange(key, nextDir);
    } else {
      setLocalSortCol(key);
      setLocalSortDir(nextDir);
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
   * True when the operator is looking at a sort that covers only this page.
   *
   * `onSortChange` means the caller sorts server-side, so the ordering is real
   * and no note is warranted. Without it the sort is client-side, and it is
   * misleading precisely when more rows exist than are held — which for a
   * cursor-paginated list is whenever another page is reachable.
   */
  const scopeNote = Boolean(sortCol) && !onSortChange && Boolean(cursorPagination?.canGoForward);

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

  // Render Loading State
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center shadow-xs">
        <Loader size="lg" text={loadingText} />
      </div>
    );
  }

  // Render Empty State
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div className="w-full space-y-3">
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
        className={`rounded-xl border border-border bg-card shadow-xs overflow-x-auto transition-opacity ${
          dimmed ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <table className="w-full text-xs md:text-sm text-left border-collapse">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-border bg-muted/60 text-muted-foreground uppercase text-[11px] font-semibold tracking-wider select-none">
            <tr>
              {/* Expand Toggle Header Column */}
              {renderExpandedRow && <th scope="col" className="w-10 px-3 py-3 text-center" />}

              {/* Selection Checkbox Header Column */}
              {selectable && (
                <th scope="col" className="w-10 px-3 py-3 text-center">
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
                const sortKey = c.sortKey ?? (typeof c.header === 'string' ? c.header : undefined);
                const isSortable = c.sortable !== false && Boolean(sortKey);
                const isActiveSort = isSortable && sortCol === sortKey;

                return (
                  <th
                    key={idx}
                    scope="col"
                    className={`px-4 py-3 font-semibold ${
                      c.align === 'right'
                        ? 'text-right'
                        : c.align === 'center'
                          ? 'text-center'
                          : 'text-left'
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
            {sortedRows.map((row) => {
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
                        className={`px-4 py-3.5 align-middle ${
                          c.align === 'right'
                            ? 'text-right'
                            : c.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        } ${c.cellClassName ?? ''}`}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>

                  {/* Expanded Row Content */}
                  {renderExpandedRow && isExpanded && (
                    <tr className="bg-muted/30 border-b border-border/80">
                      <td colSpan={columns.length + (selectable ? 1 : 0) + 1} className="p-4">
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

        {/* Integrated Pagination Footer — cursor where the list can change
            underneath the reader (R-2.4), offset only where it cannot. */}
        {scopeNote && (
          <p
            role="status"
            className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/20"
          >
            {t('table.sortScopeNote')}
          </p>
        )}
        {cursorPagination && (
          <div className="px-4 bg-muted/20">
            <CursorPagination {...cursorPagination} />
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
      </div>
    </div>
  );
}

/** Centered empty state component */
export function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center space-y-3 shadow-2xs">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
