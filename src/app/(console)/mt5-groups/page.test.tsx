import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Mt5GroupRow } from '@/lib/api/admin';
import Mt5GroupsPage from './page';

/**
 * MT5 groups — the sync job's mirror of the server's group list.
 *
 * What can silently go wrong here: a group PATH losing its backslashes on the
 * way to the DOM (the bridge matches on it exactly), a removed group read as a
 * live one, and a group no product sells looking like one that is sold.
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
    firstSeenAt: '2026-09-01T00:00:00.000Z',
    lastSeenAt: new Date().toISOString(),
    removedAt: null,
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
    group({
      name: 'real\\Legacy',
      removedAt: '2026-09-20T00:00:00.000Z',
      product: null,
      accountCount: 3,
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

  /*
   * The default view is what the server holds TODAY. A removed group is one
   * click away rather than gone — its accounts still exist.
   */
  it('hides removed groups until asked, then marks them removed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Mt5GroupsPage />);

    await screen.findByText('real\\Standard-USD');
    expect(screen.queryByText('real\\Legacy')).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /show removed groups/i }));

    expect(await screen.findByText('real\\Legacy')).toBeInTheDocument();
    expect(screen.getByText('Removed from the server')).toBeInTheDocument();
  });

  it('says how recently the server confirmed the list', async () => {
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText(/last confirmed by the server/i)).toBeInTheDocument();
  });

  it('explains an empty mirror rather than showing a blank table', async () => {
    getMt5GroupMirror.mockResolvedValue([]);
    renderWithProviders(<Mt5GroupsPage />);

    expect(await screen.findByText(/no groups have been synced yet/i)).toBeInTheDocument();
  });
});
