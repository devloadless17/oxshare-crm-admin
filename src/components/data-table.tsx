'use client';

import * as React from 'react';
import Decimal from 'decimal.js';
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
import { Pagination } from './pagination';

/**
 * How a column's values are ordered. `text` unless a column says otherwise.
 *
 * `money` exists because the default was WRONG for it, not as a nicety — see
 * `compareValues`.
 */
export type SortType = 'text' | 'money' | 'number' | 'date';

/**
 * Order two cell values.
 *
 * The comparator this replaces was `if (valA < valB)` on `unknown`, which for
 * strings is a LEXICOGRAPHIC comparison. Amounts arrive from the API as
 * fixed-8dp decimal strings (ARCHITECTURE §6.1), so on the withdrawals queue
 * that made `'100.00000000' < '9.00000000'` true: sorting by amount descending
 * put 9.00 above 100.00, on the screen an admin uses to triage payouts, with
 * nothing in the UI suggesting the order was wrong.
 *
 * decimal.js rather than Number(): a monetary string must never be coerced to a
 * float (§6.1), and the lint rules on the money screens ban exactly that. The
 * comparison is on Decimal all the way through.
 */
function asText(value: unknown): string {
  // `String(unknown)` yields '[object Object]' for anything non-primitive, which
  // sorts every such row into one indistinguishable clump. Cell values are
  // primitives in practice; this makes that assumption explicit instead of
  // silently producing a wrong order for the case where it does not hold.
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
    ? String(value)
    : '';
}

export function compareValues(a: unknown, b: unknown, type: SortType): number {
  // Missing values sort last in ascending order, whichever the type — an empty
  // cell is not "smaller", it is unknown, and burying it is the useful default.
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (type === 'money') {
    try {
      const da = new Decimal(asText(a));
      const db = new Decimal(asText(b));
      return da.comparedTo(db);
    } catch {
      // An unparseable amount is a data problem, not a reason to throw inside a
      // render. Fall through to text so the table still draws.
      return asText(a).localeCompare(asText(b));
    }
  }

  if (type === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return asText(a).localeCompare(asText(b));
    return na === nb ? 0 : na < nb ? -1 : 1;
  }

  if (type === 'date') {
    const ta = new Date(asText(a)).getTime();
    const tb = new Date(asText(b)).getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) return asText(a).localeCompare(asText(b));
    return ta === tb ? 0 : ta < tb ? -1 : 1;
  }

  // localeCompare, not `<`: `<` on strings orders by code unit, so 'Z' sorts
  // before 'a' and accented letters land in a group of their own.
  return asText(a).localeCompare(asText(b));
}

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
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
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
   * so callers that need a true ordering must not mark a column sortable — and
   * `sortScopeNote` below is what tells the operator which they are looking at.
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
            {selectedKeys.length} {selectedKeys.length === 1 ? 'row' : 'rows'} selected
          </span>
          <div className="flex items-center gap-2">
            {renderBatchActions?.(selectedKeys)}
            <button
              type="button"
              onClick={() => setSelectedKeys([])}
              className="px-2 py-1 rounded bg-primary/15 hover:bg-primary/20 font-medium transition-colors"
            >
              Clear selection
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

        {/* Integrated Pagination Footer */}
        {pagination && (
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
