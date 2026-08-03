'use client';

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  noun,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Singular/plural label, e.g. ['entry', 'entries']. */
  noun: [string, string];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total} {total === 1 ? noun[0] : noun[1]} · page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
        >
          Next
        </button>
      </div>
    </div>
  );
}
