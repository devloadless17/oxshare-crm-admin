import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Exclusions } from '@/lib/symbol-tree';
import { SymbolExclusionPicker } from './symbol-exclusion-picker';

/**
 * The exclusion picker on a commission type (0198): folders from MT5's symbol
 * list, ticked whole or symbol by symbol, and what is excluded always visible.
 */
const { getMt5Symbols, syncMt5Symbols } = vi.hoisted(() => ({
  getMt5Symbols: vi.fn(),
  syncMt5Symbols: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return { ...actual, adminApi: { ...actual.adminApi, getMt5Symbols, syncMt5Symbols } };
});

const LIST = {
  lastSyncedAt: '2026-10-06T10:00:00.000Z',
  symbols: [
    { symbol: 'BTCUSD', path: 'Crypto\\BTCUSD', description: 'Bitcoin' },
    { symbol: 'ETHUSD', path: 'Crypto\\ETHUSD', description: 'Ethereum' },
    { symbol: 'EURUSD', path: 'Forex\\Majors\\EURUSD', description: 'Euro' },
  ],
};

/** The picker as the form holds it: state owned by the parent. */
function Harness({ initial, spy }: { initial: Exclusions; spy: (v: Exclusions) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <SymbolExclusionPicker
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMt5Symbols.mockResolvedValue(LIST);
  syncMt5Symbols.mockResolvedValue(LIST);
});

describe('SymbolExclusionPicker', () => {
  it('lists MT5’s folders with how many symbols each holds', async () => {
    renderWithProviders(
      <Harness initial={{ excludedPaths: [], excludedSymbols: [] }} spy={vi.fn()} />,
    );
    expect(await screen.findByText('Crypto')).toBeInTheDocument();
    expect(screen.getByText('Forex')).toBeInTheDocument();
    expect(screen.getAllByText('2 symbols').length).toBeGreaterThan(0);
  });

  it('ticking a folder excludes it whole', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    renderWithProviders(<Harness initial={{ excludedPaths: [], excludedSymbols: [] }} spy={spy} />);
    await screen.findByText('Crypto');
    await user.click(screen.getByRole('checkbox', { name: /crypto/i }));
    expect(spy).toHaveBeenLastCalledWith({ excludedPaths: ['Crypto'], excludedSymbols: [] });
    // And it shows as a removable chip.
    expect(screen.getByRole('button', { name: /stop excluding crypto/i })).toBeInTheDocument();
  });

  it('a symbol inside an excluded folder shows ticked and cannot be unticked alone', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness initial={{ excludedPaths: ['Crypto'], excludedSymbols: [] }} spy={vi.fn()} />,
    );
    // Wait for the TREE: "Crypto" is also on the "Currently excluded" chip, which renders first.
    await user.click(await screen.findByRole('button', { name: /show or hide crypto/i }));
    const btc = screen.getByRole('checkbox', { name: /btcusd/i });
    expect(btc).toBeChecked();
    expect(btc).toBeDisabled();
  });

  it('search finds a symbol and ticks just that one', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    renderWithProviders(<Harness initial={{ excludedPaths: [], excludedSymbols: [] }} spy={spy} />);
    await screen.findByText('Crypto');
    await user.type(screen.getByRole('searchbox', { name: /search symbols/i }), 'eth');
    await user.click(screen.getByRole('checkbox', { name: /ethusd/i }));
    expect(spy).toHaveBeenLastCalledWith({ excludedPaths: [], excludedSymbols: ['ETHUSD'] });
  });

  it('keeps showing an exclusion the server no longer lists, so it can be removed', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    renderWithProviders(
      <Harness initial={{ excludedPaths: [], excludedSymbols: ['OLDCOIN'] }} spy={spy} />,
    );
    await screen.findByText('Crypto');
    await user.click(screen.getByRole('button', { name: /stop excluding oldcoin/i }));
    expect(spy).toHaveBeenLastCalledWith({ excludedPaths: [], excludedSymbols: [] });
  });

  it('“Refresh from MT5” re-reads the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness initial={{ excludedPaths: [], excludedSymbols: [] }} spy={vi.fn()} />,
    );
    await screen.findByText('Crypto');
    await user.click(screen.getByRole('button', { name: /refresh from mt5/i }));
    await waitFor(() => expect(syncMt5Symbols).toHaveBeenCalledTimes(1));
  });

  it('says how to load symbols when none have been synced', async () => {
    getMt5Symbols.mockResolvedValue({ symbols: [], lastSyncedAt: null });
    renderWithProviders(
      <Harness initial={{ excludedPaths: [], excludedSymbols: [] }} spy={vi.fn()} />,
    );
    expect(await screen.findByText(/no symbols yet/i)).toBeInTheDocument();
  });
});
