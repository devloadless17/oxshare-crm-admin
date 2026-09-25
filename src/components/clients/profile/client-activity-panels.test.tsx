import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { ClientClosedPositionRow } from '@/lib/api/admin';
import { ClientClosedPositionsPanel } from './client-activity-panels';

/**
 * The client profile's Positions tab: CLOSED positions only (owner, 26 Sep
 * 2026), from the ingested MT5 deals.
 *
 * What these pin: the rows come from the closed-positions endpoint, each shows
 * the position's side, both prices, MT5's commission and swap apart from the
 * realised result, and marks a demo account — and nothing about open trades.
 */
const { getClientClosedPositions } = vi.hoisted(() => ({ getClientClosedPositions: vi.fn() }));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getClientClosedPositions } };
  return { api, default: api };
});

function row(over: Partial<ClientClosedPositionRow> = {}): ClientClosedPositionRow {
  return {
    id: 'd-1',
    ticket: '5001',
    positionId: '4001',
    login: '81001',
    environment: 'live',
    symbol: 'EURUSD',
    side: 'buy',
    volume: '0.10000000',
    openPrice: '1.10000000',
    closePrice: '1.10500000',
    profit: '50.00000000',
    commission: '-3.00000000',
    swap: '0.00000000',
    currency: 'USD',
    openedAt: '2026-09-20T10:00:00.000Z',
    closedAt: '2026-09-20T11:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getClientClosedPositions.mockResolvedValue({ rows: [row()], total: 1, page: 1, limit: 10 });
});

describe('the closed positions table', () => {
  it('asks the closed-positions endpoint for this client, first page', async () => {
    renderWithProviders(<ClientClosedPositionsPanel userId="client-1" />);

    await screen.findByText('EURUSD');
    expect(getClientClosedPositions).toHaveBeenCalledWith(
      'client-1',
      { page: 1, limit: 10 },
      expect.anything(),
    );
  });

  it('shows the side, both prices, the charges and the realised result', async () => {
    renderWithProviders(<ClientClosedPositionsPanel userId="client-1" />);

    expect(await screen.findByText('EURUSD')).toBeInTheDocument();
    expect(screen.getByText('buy')).toBeInTheDocument();
    expect(screen.getByText('1.1')).toBeInTheDocument();
    expect(screen.getByText('1.105')).toBeInTheDocument();
    // MT5's commission, apart from the result it was charged on.
    expect(screen.getByText('-$3.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Realised P/L' })).toBeInTheDocument();
  });

  it('says nothing about open trades', async () => {
    renderWithProviders(<ClientClosedPositionsPanel userId="client-1" />);

    await screen.findByText('EURUSD');
    expect(screen.queryByText(/floating/i)).toBeNull();
    expect(screen.queryByText(/open positions/i)).toBeNull();
  });

  it('marks a demo account and leaves an unknown open blank rather than guessed', async () => {
    getClientClosedPositions.mockResolvedValue({
      rows: [row({ environment: 'demo', openPrice: null, openedAt: null })],
      total: 1,
      page: 1,
      limit: 10,
    });
    renderWithProviders(<ClientClosedPositionsPanel userId="client-1" />);

    expect(await screen.findByText('Demo')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('says so when the client has closed nothing', async () => {
    getClientClosedPositions.mockResolvedValue({ rows: [], total: 0, page: 1, limit: 10 });
    renderWithProviders(<ClientClosedPositionsPanel userId="client-1" />);

    expect(await screen.findByText('No closed positions yet.')).toBeInTheDocument();
  });
});
