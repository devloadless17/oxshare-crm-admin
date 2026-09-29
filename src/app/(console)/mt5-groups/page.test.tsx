import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Mt5GroupRow } from '@/lib/api/admin';
import Mt5GroupsPage from './page';

/**
 * MT5 groups — the groups the server currently reports, from the sync job's
 * mirror.
 *
 * What can silently go wrong here: a group PATH losing its backslashes on the
 * way to the DOM (the bridge matches on it exactly), and a group no product
 * sells looking like one that is sold.
 */
const { getMt5GroupMirror } = vi.hoisted(() => ({ getMt5GroupMirror: vi.fn() }));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getMt5GroupMirror } };
  return { api, default: api };
});

function group(over: Partial<Mt5GroupRow> = {}): Mt5GroupRow {
  return {
    name: 'real\\Standard-USD',
    currency: 'USD',
    leverageDefault: 100,
    products: [{ id: 'p-1', name: 'Standard', environment: 'live' }],
    accountCount: 12,
    accountsOutsideScope: 0,
    marginCall: '100.00000000',
    marginStopOut: '50.00000000',
    marginStopOutMode: 'percent',
    commissions: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getMt5GroupMirror.mockResolvedValue([
    group(),
    group({
      name: 'real\\ECN-EUR',
      currency: 'EUR',
      leverageDefault: null,
      products: [],
      accountCount: 0,
    }),
  ]);
});

describe('the MT5 groups page', () => {
  it('lists each group by its exact path, with its product and account count', async () => {
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText('real\\Standard-USD')).toBeInTheDocument();
    expect(screen.getByText('Standard · live')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('1:100')).toBeInTheDocument();
  });

  /* A group may back several products since backend 0142; all are named. */
  it('names every product that sells a group', async () => {
    getMt5GroupMirror.mockResolvedValue([
      group({
        products: [
          { id: 'p-1', name: 'Standard', environment: 'live' },
          { id: 'p-2', name: 'Premium', environment: 'live' },
        ],
      }),
    ]);
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText('Standard · live, Premium · live')).toBeInTheDocument();
  });

  it('says so when no product sells a group', async () => {
    renderWithProviders(<Mt5GroupsPage />);

    await screen.findByText('real\\ECN-EUR');
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
  });

  /* The owner's call (25 Sep 2026): no last-seen column, no removed-groups toggle. */
  it('shows no last-seen column and no removed-groups toggle', async () => {
    renderWithProviders(<Mt5GroupsPage />);

    await screen.findByText('real\\Standard-USD');
    expect(screen.queryByText(/last seen/i)).toBeNull();
    expect(screen.queryByText(/last confirmed/i)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /removed/i })).toBeNull();
  });

  /*
   * MT5's OWN commission on the group — what made a fresh $1,000 account read
   * $997. Shown in words, with its unit, and "none" kept apart from "unknown".
   */
  it("states MT5's commission on a group in words", async () => {
    getMt5GroupMirror.mockResolvedValue([
      group({
        commissions: [
          {
            name: 'Standard commission',
            description: '',
            symbolPath: 'Forex\\*',
            mode: 'standard',
            rangeMode: 'volume',
            chargeMode: 'instant',
            entryMode: 'in',
            tiers: [
              {
                mode: 'deposit_currency',
                type: 'per_lot',
                value: '3.00000000',
                currency: null,
                minimal: '0.00000000',
                maximal: '0.00000000',
                rangeFrom: '0.00000000',
                rangeTo: null,
              },
            ],
          },
        ],
      }),
    ]);
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText('$3.00 per lot, on opening deals')).toBeInTheDocument();
    expect(screen.getByText('100% / 50%')).toBeInTheDocument();
  });

  it('tells a group that charges nothing from one the bridge did not report', async () => {
    getMt5GroupMirror.mockResolvedValue([
      group({ commissions: [] }),
      group({ name: 'real\\Old', commissions: null, marginCall: null, marginStopOut: null }),
    ]);
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText('None')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
  });

  it('lists every rule and tier when a group is expanded', async () => {
    const user = userEvent.setup();
    getMt5GroupMirror.mockResolvedValue([
      group({
        commissions: [
          {
            name: 'Tiered',
            description: 'Cheaper with volume',
            symbolPath: 'Forex\\*',
            mode: 'standard',
            rangeMode: 'volume',
            chargeMode: 'daily',
            entryMode: 'all',
            tiers: [
              {
                mode: 'deposit_currency',
                type: 'per_lot',
                value: '5',
                currency: null,
                minimal: '0',
                maximal: '0',
                rangeFrom: '0',
                rangeTo: '10',
              },
              {
                mode: 'points',
                type: 'per_deal',
                value: '2',
                currency: null,
                minimal: '1',
                maximal: '0',
                rangeFrom: '10',
                rangeTo: null,
              },
            ],
          },
        ],
      }),
    ]);
    renderWithProviders(<Mt5GroupsPage />);

    await screen.findByText('real\\Standard-USD');
    await user.click(screen.getByTitle('Expand row'));

    const rule = screen.getByRole('region', { name: 'Tiered' });
    expect(within(rule).getByText('Forex\\*')).toBeInTheDocument();
    expect(within(rule).getByText('Taken at the end of each day')).toBeInTheDocument();
    expect(within(rule).getByText('$5.00 per lot')).toBeInTheDocument();
    expect(within(rule).getByText('0 – 10')).toBeInTheDocument();
    expect(within(rule).getByText('2 points per deal')).toBeInTheDocument();
    expect(within(rule).getByText('10 and above')).toBeInTheDocument();
    // MT5 stores "no bound" as zero: a minimum of 1 point and no maximum.
    expect(within(rule).getByText('1 points / —')).toBeInTheDocument();
  });

  it('explains an empty mirror rather than showing a blank table', async () => {
    getMt5GroupMirror.mockResolvedValue([]);
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText(/no groups have been synced yet/i)).toBeInTheDocument();
  });
});
