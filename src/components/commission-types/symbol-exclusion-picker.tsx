'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Folder, RefreshCw, Search, X } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import type { Mt5SymbolList } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { keys } from '@/lib/query-keys';
import { Spinner } from '@/components/ui/loader';
import { toastError } from '@/lib/toast';
import { t } from '@/lib/i18n';
import {
  buildSymbolTree,
  coveringFolder,
  isSymbolExcluded,
  toggleFolder,
  toggleSymbol,
  type Exclusions,
  type FolderNode,
  type SymbolRow,
} from '@/lib/symbol-tree';

/**
 * The symbols a commission type pays NOTHING on — no partner commission, no
 * client rebate (0198). Folders as MT5's symbol search shows them (Forex,
 * Metals, Crypto…), each with a checkbox; ticking a folder excludes every
 * symbol in it, including ones the broker adds later. Single symbols can be
 * ticked inside any folder that is not excluded whole.
 *
 * The list is the CRM's mirror of the server's, dated, with a button to
 * re-read it — so the screen works when the MT5 server is unreachable.
 */
export function SymbolExclusionPicker({
  value,
  onChange,
}: {
  value: Exclusions;
  onChange: (next: Exclusions) => void;
}) {
  const queryClient = useQueryClient();
  const list = useResource<Mt5SymbolList>(keys.mt5Symbols.all(), (signal) =>
    adminApi.getMt5Symbols(signal),
  );
  const refresh = useMutation({
    mutationFn: () => adminApi.syncMt5Symbols(),
    onSuccess: (data) => queryClient.setQueryData(keys.mt5Symbols.all(), data),
    onError: (error) => toastError(error, t('symbolExclusions.refreshFailed')),
  });

  const rows: SymbolRow[] = React.useMemo(() => list.data?.symbols ?? [], [list.data]);
  const tree = React.useMemo(() => buildSymbolTree(rows), [rows]);
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  const toggleOpen = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows
        .filter(
          (row) =>
            row.symbol.toLowerCase().includes(needle) ||
            row.description.toLowerCase().includes(needle) ||
            row.path.toLowerCase().includes(needle),
        )
        .slice(0, 100)
    : [];

  const symbolBox = (row: SymbolRow, showPath: boolean) => {
    const folder = row.path.replace(/\//g, '\\').split('\\').slice(0, -1).join('\\');
    const covered = folder ? coveringFolder(folder, value) : undefined;
    return (
      <label
        key={row.symbol}
        className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
        title={covered ? t('symbolExclusions.coveredBy', { folder: covered }) : row.description}
      >
        <input
          type="checkbox"
          checked={isSymbolExcluded(row, value)}
          disabled={covered !== undefined}
          onChange={() => onChange(toggleSymbol(row.symbol, value))}
          className="h-3.5 w-3.5"
        />
        <span className="font-mono font-medium">{row.symbol}</span>
        <span className="truncate text-muted-foreground">
          {showPath ? row.path : row.description}
        </span>
      </label>
    );
  };

  const folderRow = (node: FolderNode, depth: number): React.ReactNode => {
    const covered = coveringFolder(node.path, value);
    const isRule = covered !== undefined && covered.toLowerCase() === node.path.toLowerCase();
    const expanded = open.has(node.path);
    return (
      <div key={node.path}>
        <div
          className="flex items-center gap-1.5 py-0.5"
          style={{ paddingInlineStart: depth * 16 }}
        >
          <button
            type="button"
            onClick={() => toggleOpen(node.path)}
            aria-expanded={expanded}
            aria-label={t('symbolExclusions.toggleFolder', { folder: node.path })}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-outline"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={covered !== undefined}
              disabled={covered !== undefined && !isRule}
              onChange={() => onChange(toggleFolder(node.path, value, rows))}
              className="h-3.5 w-3.5"
            />
            <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{node.name}</span>
            <span className="text-muted-foreground">
              {t('symbolExclusions.count', { count: String(node.total) })}
            </span>
          </label>
        </div>
        {expanded && (
          <div>
            {node.folders.map((child) => folderRow(child, depth + 1))}
            <div style={{ paddingInlineStart: (depth + 1) * 16 + 22 }}>
              {node.symbols.map((row) => symbolBox(row, false))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const chips = [
    ...value.excludedPaths.map((path) => ({ kind: 'path' as const, label: path })),
    ...value.excludedSymbols.map((symbol) => ({ kind: 'symbol' as const, label: symbol })),
  ];

  return (
    <section className="space-y-2 sm:col-span-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="block text-xs font-semibold">{t('symbolExclusions.title')}</span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('symbolExclusions.hint')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input px-2.5 text-[11px] font-semibold hover:bg-muted disabled:opacity-50 focus-outline"
        >
          {refresh.isPending ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('symbolExclusions.refresh')}
        </button>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('symbolExclusions.current')}>
          {chips.map((chip) => (
            <li
              key={`${chip.kind}:${chip.label}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
            >
              {chip.kind === 'path' && <Folder className="h-3 w-3" aria-hidden="true" />}
              <span className={chip.kind === 'symbol' ? 'font-mono' : ''}>{chip.label}</span>
              <button
                type="button"
                aria-label={t('symbolExclusions.remove', { name: chip.label })}
                onClick={() =>
                  onChange(
                    chip.kind === 'path'
                      ? toggleFolder(chip.label, value, rows)
                      : toggleSymbol(chip.label, value),
                  )
                }
                className="rounded-sm text-muted-foreground hover:text-foreground focus-outline"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('symbolExclusions.search')}
          aria-label={t('symbolExclusions.search')}
          className="h-8 w-full rounded-lg border border-input bg-card ps-8 pe-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border p-2">
        {list.status === 'loading' ? (
          <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Spinner /> {t('symbolExclusions.loading')}
          </p>
        ) : list.status !== 'ready' && rows.length === 0 ? (
          <p role="alert" className="p-2 text-xs text-destructive">
            {t('symbolExclusions.loadFailed')}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">{t('symbolExclusions.empty')}</p>
        ) : needle ? (
          matches.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">{t('symbolExclusions.noMatch')}</p>
          ) : (
            matches.map((row) => symbolBox(row, true))
          )
        ) : (
          <>
            {tree.folders.map((node) => folderRow(node, 0))}
            {tree.symbols.map((row) => symbolBox(row, false))}
          </>
        )}
      </div>

      {list.data?.lastSyncedAt && (
        <p className="text-[11px] text-muted-foreground">
          {t('symbolExclusions.syncedAt', {
            when: new Date(list.data.lastSyncedAt).toLocaleString(),
          })}
        </p>
      )}
    </section>
  );
}
