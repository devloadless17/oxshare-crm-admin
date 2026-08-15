'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import type { BridgeLogs } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/**
 * The tail of the bridge's log for today.
 *
 * ## Why the raw text, and not a parsed table
 *
 * Serilog writes a level, a timestamp and a message, and a stack trace spans
 * many lines belonging to one event. Parsing that into columns would either drop
 * the trace — the most useful part when something has actually broken — or
 * flatten it into a cell nobody can read. The log is read here the way it is
 * read over SSH, which is also the form somebody can paste into a ticket.
 *
 * ## The filter is server-side
 *
 * `contains` goes to the bridge, which greps the file before taking the tail.
 * Filtering the returned 400 lines in the browser would search only the tail —
 * so a term that last appeared an hour ago would return nothing while looking
 * like a complete search, which is the worst answer a log filter can give.
 */
export function BridgeLogsPanel({
  data,
  dimmed,
  contains,
  onContainsChange,
}: {
  data: BridgeLogs | undefined;
  dimmed: boolean;
  contains: string;
  onContainsChange: (value: string) => void;
}) {
  /*
   * Debounced, because every keystroke is a request that greps a file which is
   * already hundreds of kilobytes by the end of a day.
   */
  const [draft, setDraft] = React.useState(contains);

  React.useEffect(() => {
    const timer = setTimeout(() => onContainsChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, onContainsChange]);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('bridge.logs.filter')}
          className="max-w-xs"
        />
        {/*
          One-click "warnings and errors". `ERR` alone would miss warnings, and
          Serilog writes the level as `[WRN]`/`[ERR]`, so the bridge's
          case-insensitive substring match needs only one of the two — this sets
          the common case rather than making somebody remember the syntax.
        */}
        <button
          type="button"
          onClick={() => setDraft('ERR')}
          className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          {t('bridge.logs.errorsOnly')}
        </button>

        {data.matched !== undefined && (
          <span className="text-xs text-muted-foreground">
            {t('bridge.logs.matched', { count: data.matched })}
          </span>
        )}
      </div>

      {!data.exists ? (
        /*
          Names the FILE that was looked for. The path is relative to the
          bridge's working directory, so "no log today" and "the bridge was
          started from a different folder" look identical without it — and the
          second is the more likely of the two.
        */
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">
            {t('bridge.logs.missing', { file: data.file })}
          </p>
        </div>
      ) : data.lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">{t('bridge.logs.empty')}</p>
        </div>
      ) : (
        <pre
          className={`max-h-[32rem] overflow-auto rounded-xl border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${
            dimmed ? 'opacity-60' : ''
          }`}
        >
          {data.lines.map((line, index) => (
            <div
              // Index as key: log lines are not identities, they repeat verbatim
              // (the same warning every sweep), and the list is replaced wholesale
              // on every fetch rather than reordered.
              key={index}
              className={lineClass(line)}
            >
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/**
 * Colour by level, read from Serilog's own `[ERR]` / `[WRN]` marker.
 *
 * Matched on the bracketed token rather than on the words "error"/"warning"
 * appearing anywhere: a line reporting that an error COUNT is zero, or quoting a
 * provider's message, would otherwise render as an error itself.
 */
function lineClass(line: string): string {
  if (line.includes('[ERR]') || line.includes('[FTL]')) return 'text-destructive';
  if (line.includes('[WRN]')) return 'text-warning';
  return '';
}
