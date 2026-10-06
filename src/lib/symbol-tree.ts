/**
 * MT5's symbol folders as a tree, and the exclusion rules a commission type
 * keeps against it (0198).
 *
 * Mirrors the backend's `common/symbol-exclusion.ts` on what a rule MEANS — a
 * folder covers every symbol beneath it at any depth, case-insensitively, with
 * `\` as the separator — so what this screen shows as excluded is what the
 * commission engine will refuse to pay on. Pure, for the tests beside it.
 */

export interface SymbolRow {
  symbol: string;
  /** MT5's path, ending in the symbol: `Forex\Majors\EURUSD`. */
  path: string;
  description: string;
}

export interface FolderNode {
  /** The folder's own name, e.g. `Majors`. */
  name: string;
  /** Its full path as MT5 spells it, e.g. `Forex\Majors`. */
  path: string;
  folders: FolderNode[];
  symbols: SymbolRow[];
  /** Every symbol beneath it, at any depth. */
  total: number;
}

export interface Exclusions {
  excludedPaths: string[];
  excludedSymbols: string[];
}

/** `Forex/Majors\` → `forex\majors` — the backend's normalisation. */
export function normalisePath(value: string): string {
  return value
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\{2,}/g, '\\')
    .replace(/^\\+|\\+$/g, '')
    .toLowerCase();
}

/** The folder segments of a symbol's path (the symbol itself dropped). */
function folderSegments(path: string): string[] {
  const parts = path
    .replace(/\//g, '\\')
    .split('\\')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.slice(0, -1);
}

/** The tree the picker draws. Folders and symbols sorted by name; empty paths go to the root. */
export function buildSymbolTree(rows: readonly SymbolRow[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], symbols: [], total: 0 };
  for (const row of rows) {
    let node = root;
    node.total += 1;
    for (const segment of folderSegments(row.path)) {
      const path = node.path ? `${node.path}\\${segment}` : segment;
      let child = node.folders.find((f) => f.name.toLowerCase() === segment.toLowerCase());
      if (!child) {
        child = { name: segment, path, folders: [], symbols: [], total: 0 };
        node.folders.push(child);
      }
      child.total += 1;
      node = child;
    }
    node.symbols.push(row);
  }
  const sort = (node: FolderNode) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.symbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** True when `path` is `rule` or beneath it. */
function within(path: string, rule: string): boolean {
  const p = normalisePath(path);
  const r = normalisePath(rule);
  return p === r || p.startsWith(`${r}\\`);
}

/** The excluded folder covering this folder (itself or an ancestor), if any. */
export function coveringFolder(folderPath: string, excluded: Exclusions): string | undefined {
  return excluded.excludedPaths.find((rule) => within(folderPath, rule));
}

/** Whether a symbol is excluded — by name, or by a folder it sits in. */
export function isSymbolExcluded(row: SymbolRow, excluded: Exclusions): boolean {
  const name = row.symbol.toLowerCase();
  if (excluded.excludedSymbols.some((s) => s.toLowerCase() === name)) return true;
  const folder = folderSegments(row.path).join('\\');
  return folder !== '' && coveringFolder(folder, excluded) !== undefined;
}

/**
 * Tick or untick a folder. Ticking it makes every narrower rule beneath it
 * redundant, so those are dropped — the list stays the smallest that says the
 * same thing, and unticking the folder later leaves nothing stale behind it.
 */
export function toggleFolder(
  folderPath: string,
  excluded: Exclusions,
  rows: readonly SymbolRow[],
): Exclusions {
  const key = normalisePath(folderPath);
  const has = excluded.excludedPaths.some((p) => normalisePath(p) === key);
  if (has) {
    return {
      ...excluded,
      excludedPaths: excluded.excludedPaths.filter((p) => normalisePath(p) !== key),
    };
  }
  const inside = new Set(
    rows
      .filter((row) => {
        const folder = folderSegments(row.path).join('\\');
        return folder !== '' && within(folder, folderPath);
      })
      .map((row) => row.symbol.toLowerCase()),
  );
  return {
    excludedPaths: [...excluded.excludedPaths.filter((p) => !within(p, folderPath)), folderPath],
    excludedSymbols: excluded.excludedSymbols.filter((s) => !inside.has(s.toLowerCase())),
  };
}

/** Tick or untick one symbol (only reachable when no folder covers it). */
export function toggleSymbol(symbol: string, excluded: Exclusions): Exclusions {
  const has = excluded.excludedSymbols.some((s) => s.toLowerCase() === symbol.toLowerCase());
  return {
    ...excluded,
    excludedSymbols: has
      ? excluded.excludedSymbols.filter((s) => s.toLowerCase() !== symbol.toLowerCase())
      : [...excluded.excludedSymbols, symbol],
  };
}
