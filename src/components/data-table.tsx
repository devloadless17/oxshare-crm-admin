'use client';

import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Extra classes for the cell (not the header). */
  cellClassName?: string;
  headerClassName?: string;
}

/**
 * The table shell five pages repeated verbatim — the same `<th>` class string
 * appeared 29 times. Header alignment now follows the column definition, so a
 * right-aligned money column can no longer end up with a left-aligned header.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  dimmed = false,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  /** Fade the table while a background refetch is in flight. */
  dimmed?: boolean;
}) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div
      className={`rounded-lg border border-border bg-card shadow-sm overflow-x-auto transition-opacity ${
        dimmed ? 'opacity-60' : ''
      }`}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-muted/50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={`px-6 py-3 font-medium text-muted-foreground ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                } ${c.headerClassName ?? ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-muted/30 transition-colors align-top">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`px-6 py-4 ${c.align === 'right' ? 'text-right' : ''} ${c.cellClassName ?? ''}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Centred empty state, shared by every table. */
export function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
