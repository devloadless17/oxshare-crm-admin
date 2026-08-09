import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import DashboardPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The dashboard.
 *
 * What is pinned here is not the pixels — it is the four ways this screen can
 * lie to an operator:
 *
 *  1. **Money must stay a string.** The pending-withdrawal tile and the volume
 *     caption are the two places a balance reaches the DOM, and
 *     `Number('12345678901234567.89')` is wrong before formatting starts. A
 *     test that only checked "a number appears" would pass on the truncated
 *     one, so these assert the exact digits of a value past 2^53.
 *  2. **A section the caller cannot see must not be requested.** The stats
 *     endpoints are permission-gated per section; a card mounted without its
 *     key renders a 403 where an operator expects either data or nothing.
 *  3. **One failure must cost one card.** A failing series leaves the rest of
 *     the dashboard on screen — the reason each panel owns its own resource.
 *  4. **The period selector must actually reach the API.** A control that
 *     changes a highlight but not the request is worse than no control.
 */

const {
  getStatsOverview,
  getRegistrationSeries,
  getKycTrend,
  getWithdrawalVolume,
  get: apiGet,
} = vi.hoisted(() => ({
  getStatsOverview: vi.fn(),
  getRegistrationSeries: vi.fn(),
  getKycTrend: vi.fn(),
  getWithdrawalVolume: vi.fn(),
  get: vi.fn(),
}));

/*
 * BOTH the named export and the default. `src/lib/api/index.ts` exports `api`
 * twice and this page reaches for the default while other screens use the
 * named one — mocking only one leaves the other undefined, and the page then
 * fails in a way that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = {
    get: apiGet,
    admin: { getStatsOverview, getRegistrationSeries, getKycTrend, getWithdrawalVolume },
  };
  return { api, default: api };
});

const permissions = { current: ALL_PERMISSIONS };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

/*
 * Recharts measures its container with ResizeObserver and renders nothing at
 * zero width — which is every element in jsdom. The charts are therefore not
 * what these tests assert on; the numbers around them are. Stubbing the
 * responsive wrapper to a fixed size keeps Recharts from warning on every
 * render without changing what is being tested.
 */
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <actual.ResponsiveContainer width={640} height={280}>
        {children}
      </actual.ResponsiveContainer>
    ),
  };
});

/** A value past 2^53, where `Number()` silently loses digits. */
const HUGE = '12345678901234567.89';

const overview = (over: Record<string, unknown> = {}) => ({
  clients: {
    total: 1204,
    registered: { today: 3, thisWeek: 19, thisMonth: 84 },
    // Deliberately distinct from every other number in this fixture, so an
    // assertion on a tile cannot accidentally match the donut's legend.
    byStatus: { active: 1099, pending: 85, suspended: 20 },
    byVerification: { verified: 900, notVerified: 304 },
  },
  kyc: {
    byStatus: {
      not_started: 300,
      in_progress: 40,
      submitted: 12,
      under_review: 5,
      approved: 900,
      rejected: 7,
    },
  },
  withdrawals: {
    byState: [
      { state: 'pending', count: 4, totalAmount: HUGE },
      { state: 'approved', count: 2, totalAmount: '500.00000000' },
      { state: 'success', count: 30, totalAmount: '9000.00000000' },
      { state: 'failure', count: 1, totalAmount: '100.00000000' },
      { state: 'rejected', count: 3, totalAmount: '250.00000000' },
    ],
  },
  ib: { applications: { pending: 6, approved: 40, rejected: 2 }, partners: 40 },
  sections: ['clients', 'kyc', 'withdrawals', 'ib'],
  scoped: false,
  ...over,
});

const days = (count: number, make: (index: number) => Record<string, unknown>) =>
  Array.from({ length: count }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    ...make(index),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getStatsOverview.mockResolvedValue(overview());
  getRegistrationSeries.mockResolvedValue({
    days: 30,
    scoped: false,
    points: days(30, (i) => ({ count: i })),
  });
  getKycTrend.mockResolvedValue({
    days: 30,
    scoped: false,
    points: days(30, (i) => ({ submitted: i, approved: i - 1 })),
  });
  getWithdrawalVolume.mockResolvedValue({
    days: 30,
    scoped: false,
    points: days(30, () => ({ count: 1, totalAmount: '1000.00000000' })),
  });
  apiGet.mockResolvedValue({
    data: {
      items: [
        {
          userId: 'u-1',
          status: 'submitted',
          submittedAt: '2026-08-01T00:00:00.000Z',
          user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        },
      ],
      counts: { submitted: 12 },
    },
  });
});

describe('headline tiles', () => {
  it('shows the real counters from the overview', async () => {
    renderWithProviders(<DashboardPage />);

    // Awaited on something the QUERY renders, not a header control — the
    // header is present during `loading` and would assert against no data.
    expect(await screen.findByRole('link', { name: /total clients 1,204/i })).toBeInTheDocument();
    // New this month, with today and this week in the hint.
    expect(screen.getByRole('link', { name: /new this month 84/i })).toBeInTheDocument();
    expect(screen.getByText(/3 today/)).toBeInTheDocument();
    // Partners, and the applications waiting. Scoped to the tile's own link —
    // the funnel and the donut both carry bare counts that a loose text query
    // would match instead.
    expect(screen.getByRole('link', { name: /ib partners 40/i })).toBeInTheDocument();
    expect(screen.getByText(/6 applications waiting/)).toBeInTheDocument();
  });

  it('adds under_review to submitted for the KYC queue tile', async () => {
    // 12 submitted + 5 under review. Counting only `submitted` understates the
    // queue by everything a reviewer has already picked up.
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('17')).toBeInTheDocument();
  });
});

describe('money', () => {
  it('renders a held balance past 2^53 without losing digits', async () => {
    /*
     * `Number('12345678901234567.89')` is 12345678901234568 — the last digits
     * are gone before any formatting starts. This asserts the full value, so a
     * regression to `Number()`/`parseFloat` on this path fails here rather
     * than shipping a wrong balance to an operator.
     */
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/\$12,345,678,901,234,567\.89 held/)).toBeInTheDocument();
  });

  it('totals the volume series in decimal, not by summing plotted floats', async () => {
    getWithdrawalVolume.mockResolvedValue({
      days: 30,
      scoped: false,
      // Two halves that only add up correctly in decimal arithmetic.
      points: [
        { date: '2026-07-01', count: 1, totalAmount: '0.10000000' },
        { date: '2026-07-02', count: 1, totalAmount: '0.20000000' },
      ],
    });

    renderWithProviders(<DashboardPage />);

    // 0.1 + 0.2 is 0.30000000000000004 in floating point. The caption must say
    // $0.30 — which it does only because the total is summed as Decimal from
    // the original strings rather than from the numbers the bars were drawn
    // with.
    expect(await screen.findByText(/\$0\.30 requested across 2 withdrawals/)).toBeInTheDocument();
  });
});

describe('permission gating', () => {
  it('does not request a series the admin has no permission for', async () => {
    // `withdrawals.view` absent: the withdrawal panels must not mount and the
    // request must never be made. A card that mounts only to render a 403
    // reads as a broken dashboard.
    permissions.current = ['clients.view', 'kyc.review'];
    renderWithProviders(<DashboardPage />);

    await screen.findByRole('link', { name: /total clients/i });
    expect(getWithdrawalVolume).not.toHaveBeenCalled();
    expect(screen.queryByText(/withdrawal volume/i)).not.toBeInTheDocument();
  });

  it('still renders the sections the admin can see', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('link', { name: /total clients 1,204/i })).toBeInTheDocument();
    expect(getRegistrationSeries).toHaveBeenCalled();
    expect(getKycTrend).not.toHaveBeenCalled();
  });

  it('explains itself to an admin with none of the four keys', async () => {
    permissions.current = ['settings.view'];
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/role does not include any of the areas/i)).toBeInTheDocument();
  });
});

describe('first load', () => {
  it('shows one spinner and nothing else until every panel has its data', async () => {
    /*
     * The SLOWEST endpoint sets the pace. The tiles come from an overview that
     * resolves immediately and must still not appear while a chart is
     * outstanding — a dashboard that assembles itself panel by panel, reflowing
     * the grid as each one lands, is what the page-level gate exists to
     * prevent.
     */
    let release!: (series: unknown) => void;
    getWithdrawalVolume.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(getStatsOverview).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /total clients/i })).not.toBeInTheDocument();

    release({ days: 30, scoped: false, points: [] });

    expect(await screen.findByRole('link', { name: /total clients 1,204/i })).toBeInTheDocument();
    // And the gate is gone once it lifts, rather than lingering beside the data.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not wait on a series the admin has no permission for', async () => {
    /*
     * A disabled React Query stays `isPending` forever. Counting one would hold
     * the spinner on screen permanently for exactly the operators whose
     * permissions keep that query from ever running.
     */
    permissions.current = ['clients.view'];
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('link', { name: /total clients 1,204/i })).toBeInTheDocument();
  });
});

describe('degrading', () => {
  it('keeps the rest of the dashboard when one series fails', async () => {
    /*
     * Each panel owns its own resource precisely so this is true. A single
     * page-level query would blank a dashboard that is four-fifths fine.
     */
    getRegistrationSeries.mockRejectedValue({
      response: { status: 500, data: { message: 'boom' } },
    });

    renderWithProviders(<DashboardPage />);

    // The tiles, from a different resource, still render.
    expect(await screen.findByRole('link', { name: /total clients 1,204/i })).toBeInTheDocument();
    // And the failed card offers its own retry inside its own border.
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('says so when the figures cover only this admin’s own clients', async () => {
    // An unqualified "1,204 clients" shown to a scoped admin reads as a
    // platform total, and an operator acting on that is acting on a misreading.
    getStatsOverview.mockResolvedValue(overview({ scoped: true }));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/only the clients assigned to you/i)).toBeInTheDocument();
  });
});

describe('period selector', () => {
  it('re-requests every series with the chosen window', async () => {
    renderWithProviders(<DashboardPage />);
    await screen.findByRole('link', { name: /total clients/i });

    await userEvent.click(screen.getByRole('radio', { name: /last 7 days/i }));

    await waitFor(() => expect(getRegistrationSeries).toHaveBeenCalledWith(7, expect.anything()));
    // Every series moves together, so the panels always describe one slice.
    expect(getKycTrend).toHaveBeenCalledWith(7, expect.anything());
    expect(getWithdrawalVolume).toHaveBeenCalledWith(7, expect.anything());
  });

  it('marks exactly one window selected', async () => {
    renderWithProviders(<DashboardPage />);
    await screen.findByRole('link', { name: /total clients/i });

    const selected = screen
      .getAllByRole('radio')
      .filter((option) => option.getAttribute('aria-checked') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAccessibleName(/last 30 days/i);
  });
});

describe('recent submissions', () => {
  it('links each row into its review page', async () => {
    renderWithProviders(<DashboardPage />);

    const link = await screen.findByRole('link', { name: /ada lovelace/i });
    expect(link).toHaveAttribute('href', '/kyc/u-1');
  });
});
