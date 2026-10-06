import { describe, expect, it } from 'vitest';
import {
  buildSymbolTree,
  coveringFolder,
  isSymbolExcluded,
  toggleFolder,
  toggleSymbol,
  type SymbolRow,
} from './symbol-tree';

const ROWS: SymbolRow[] = [
  { symbol: 'EURUSD', path: 'Forex\\Majors\\EURUSD', description: 'Euro' },
  { symbol: 'GBPUSD', path: 'Forex\\Majors\\GBPUSD', description: 'Pound' },
  { symbol: 'USDTRY', path: 'Forex\\Exotics\\USDTRY', description: 'Lira' },
  { symbol: 'BTCUSD', path: 'Crypto\\BTCUSD', description: 'Bitcoin' },
  { symbol: 'ETHUSD', path: 'Crypto\\ETHUSD', description: 'Ethereum' },
  { symbol: 'CASH', path: 'CASH', description: 'No folder' },
];
const NONE = { excludedPaths: [], excludedSymbols: [] };

describe('buildSymbolTree', () => {
  it('nests folders as MT5 files them, with a count of everything beneath', () => {
    const tree = buildSymbolTree(ROWS);
    expect(tree.folders.map((f) => [f.name, f.total])).toEqual([
      ['Crypto', 2],
      ['Forex', 3],
    ]);
    const forex = tree.folders[1];
    expect(forex.folders.map((f) => [f.path, f.total])).toEqual([
      ['Forex\\Exotics', 1],
      ['Forex\\Majors', 2],
    ]);
    expect(forex.folders[1].symbols.map((s) => s.symbol)).toEqual(['EURUSD', 'GBPUSD']);
    // A symbol with no folder sits at the root.
    expect(tree.symbols.map((s) => s.symbol)).toEqual(['CASH']);
  });
});

describe('what counts as excluded — the same rule the engine applies', () => {
  it('a folder covers every symbol beneath it, at any depth', () => {
    const value = { excludedPaths: ['Forex'], excludedSymbols: [] };
    expect(isSymbolExcluded(ROWS[0], value)).toBe(true);
    expect(isSymbolExcluded(ROWS[2], value)).toBe(true);
    expect(isSymbolExcluded(ROWS[3], value)).toBe(false);
    expect(coveringFolder('Forex\\Majors', value)).toBe('Forex');
  });

  it('never matches a prefix of a folder name', () => {
    expect(
      coveringFolder('CryptoIndices', { excludedPaths: ['Crypto'], excludedSymbols: [] }),
    ).toBe(undefined);
  });

  it('ignores case, as MT5 does', () => {
    expect(isSymbolExcluded(ROWS[3], { excludedPaths: ['crypto'], excludedSymbols: [] })).toBe(
      true,
    );
    expect(isSymbolExcluded(ROWS[0], { excludedPaths: [], excludedSymbols: ['eurusd'] })).toBe(
      true,
    );
  });
});

describe('ticking and unticking', () => {
  it('ticking a folder drops the narrower rules it now covers', () => {
    const before = { excludedPaths: ['Forex\\Majors'], excludedSymbols: ['USDTRY', 'BTCUSD'] };
    expect(toggleFolder('Forex', before, ROWS)).toEqual({
      excludedPaths: ['Forex'],
      excludedSymbols: ['BTCUSD'],
    });
  });

  it('unticking a folder removes just that rule', () => {
    const before = { excludedPaths: ['Crypto', 'Forex'], excludedSymbols: [] };
    expect(toggleFolder('crypto', before, ROWS)).toEqual({
      excludedPaths: ['Forex'],
      excludedSymbols: [],
    });
  });

  it('ticks and unticks one symbol', () => {
    const on = toggleSymbol('ETHUSD', NONE);
    expect(on.excludedSymbols).toEqual(['ETHUSD']);
    expect(toggleSymbol('ethusd', on).excludedSymbols).toEqual([]);
  });
});
