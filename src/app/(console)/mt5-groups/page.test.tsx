import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
    product: { id: 'p-1', name: 'Standard', environment: 'live' },
    accountCount: 12,
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
      product: null,
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

  it('explains an empty mirror rather than showing a blank table', async () => {
    getMt5GroupMirror.mockResolvedValue([]);
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText(/no groups have been synced yet/i)).toBeInTheDocument();
  });
});
