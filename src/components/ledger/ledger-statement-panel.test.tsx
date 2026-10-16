import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { LedgerStatementPanel } from './ledger-statement-panel';

const { getLedgerStatement } = vi.hoisted(() => ({ getLedgerStatement: vi.fn() }));
vi.mock('@/lib/api', () => {
  const api = { admin: { getLedgerStatement } };
  return { api, default: api };
});

/**
 * The period statement (backend audit R4-G1): asked for only when opened, and it renders the
 * server's figures — opening, postings, movement, closing — and the reconciliation's verdict.
 */
describe('the ledger statement panel', () => {
  it('loads nothing until opened, then shows the server’s statement and its verdict', async () => {
    getLedgerStatement.mockResolvedValue({
      from: '2026-09-01T00:00:00.000Z',
      until: '2026-10-01T00:00:00.000Z',
      statements: [
        {
          currency: 'USD',
          walletKind: 'main',
          opening: '0.00000000',
          lines: [
            { entryType: 'deposit', flow: 'in', count: 1, total: '100.00000000' },
            { entryType: 'withdrawal', flow: 'out', count: 1, total: '30.00000000' },
          ],
          movement: '70.00000000',
          closing: '70.00000000',
        },
      ],
      walletsAgreeWithLedger: true,
      reconciledAt: '2026-10-01T01:00:00.000Z',
    });
    const user = userEvent.setup();
    renderWithProviders(<LedgerStatementPanel from="2026-09-01" to="2026-10-01" />);
    expect(getLedgerStatement).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /statement for this period/i }));

    expect(await screen.findByText('deposit in: $100.00 (1)')).toBeInTheDocument();
    expect(screen.getByText('withdrawal out: $30.00 (1)')).toBeInTheDocument();
    expect(screen.getAllByText('$70.00')).toHaveLength(2); // movement and closing
    expect(screen.getByText(/Exact: every wallet agreed/)).toBeInTheDocument();
  });
});
