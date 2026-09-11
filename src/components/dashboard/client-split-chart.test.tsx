import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ClientSplitChart } from './client-split-chart';
import type { ClientStats } from '@/lib/api/admin';

/**
 * The account-status donut, and the one segment that must not be offered.
 *
 * `user_status` carries active | pending | suspended, but nothing writes
 * pending: registration writes `active` and `setClientStatus` is typed
 * 'active' | 'suspended'. So "Pending — 0" is not a reading, it is a permanent
 * property of the product wearing the costume of a measurement, and an operator
 * cannot tell those apart from the card.
 *
 * Both directions are pinned deliberately. A test that only proved the absence
 * would pass against a chart that had dropped the segment OUTRIGHT, which is the
 * wrong fix — the day a pending state is wired the count must come back on its
 * own rather than waiting for somebody to remember this file.
 */
const stats = (over: Partial<ClientStats['byStatus']> = {}): ClientStats =>
  ({
    total: 10,
    registeredToday: 0,
    registeredThisWeek: 0,
    registeredThisMonth: 0,
    byStatus: { active: 8, pending: 0, suspended: 2, ...over },
    byVerification: { verified: 5, notVerified: 5 },
  }) as ClientStats;

describe('the account-status split', () => {
  it('does not offer Pending while nothing can produce it', () => {
    renderWithProviders(<ClientSplitChart stats={stats()} />);

    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    // The control: the other two ARE offered, so the assertion above is about
    // `pending` and not about a chart that failed to render at all.
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('shows Pending again the moment a client actually is', () => {
    renderWithProviders(<ClientSplitChart stats={stats({ pending: 3 })} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('keeps a zero SUSPENDED, because that state is reachable', () => {
    /*
     * The rule is NOT "hide empty segments". Zero suspended is a true and useful
     * statement about a state a client can be in; only an unreachable one lies.
     */
    renderWithProviders(<ClientSplitChart stats={stats({ suspended: 0 })} />);

    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });
});
