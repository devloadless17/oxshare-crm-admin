import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import PartnersPage from './page';

/**
 * The partner list.
 *
 * What is pinned here is R-2.5: the SORT and the PAGE SIZE have to reach the
 * API. Both were rendered controls that did nothing on this screen —
 * five headers that reordered the twenty-five rows in hand and presented that
 * as the partner list, and a rows-per-page selector whose choice was discarded.
 *
 * On a paginated list those are the damaging kind of wrong. "The highest-level
 * partner" meant the highest-level partner ON THIS PAGE, which looks identical
 * to the real answer and is wrong in a way nobody notices until someone acts on
 * the top row.
 */

const { getIbPartners, getIbLevels } = vi.hoisted(() => ({
  getIbPartners: vi.fn(),
  getIbLevels: vi.fn(),
}));

// Both exports, per the convention in CLAUDE.md — lib/api/index.ts publishes
// `api` as a named export and as the default, and pages use either.
vi.mock('@/lib/api', () => {
  const api = { admin: { getIbPartners, getIbLevels } };
  return { api, default: api };
});

const permissions = { current: ['*'] as string[] };

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

function partner(
  over: {
    userId?: string;
    level?: number;
    email?: string;
    confirmed?: string;
    pending?: string;
  } = {},
) {
  const userId = over.userId ?? 'u-1';
  return {
    account: {
      userId,
      level: over.level ?? 1,
      referralCode: 'REF123',
      parentIbUserId: null,
      active: true,
      approvedAt: '2026-08-01T10:00:00.000Z',
    },
    user: {
      id: userId,
      email: over.email ?? 'partner@oxshare.com',
      firstName: 'Pat',
      lastName: 'Ner',
    },
    levelName: 'Introducing Broker',
    /*
     * The API sums these per partner and always sends both, defaulting to '0'
     * when there are no accruals — so a fixture without them is a shape the
     * endpoint cannot produce, and the earnings column would crash on it.
     */
    earnings: { confirmed: over.confirmed ?? '0', pending: over.pending ?? '0' },
  };
}

function page(rows: ReturnType<typeof partner>[], total = rows.length) {
  return { rows, total };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  getIbPartners.mockResolvedValue(page([partner()]));
  getIbLevels.mockResolvedValue([{ level: 1, name: 'Introducing Broker', enabled: true }]);
});

describe('partner list — listing', () => {
  it('lists the partners the API returns', async () => {
    renderWithProviders(<PartnersPage />);

    expect(await screen.findByText('partner@oxshare.com')).toBeInTheDocument();
  });

  /**
   * CONFIRMED AND PENDING ARE SHOWN APART, and never added together.
   *
   * Confirmed is money the platform has credited; pending is what the engine
   * calculated and has not paid. A single "earned" figure would let an operator
   * quote a partner a number that has not settled — which is the dispute this
   * column exists to avoid rather than cause.
   *
   * The sum is asserted ABSENT for that reason: `$1,750.00` is the plausible
   * wrong answer somebody would reach for.
   */
  it('shows confirmed and pending earnings separately, never summed', async () => {
    getIbPartners.mockResolvedValue(
      page([partner({ confirmed: '1000.00000000', pending: '750.00000000' })]),
    );
    renderWithProviders(<PartnersPage />);

    expect(await screen.findByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText(/\$750\.00/)).toBeInTheDocument();
    expect(screen.queryByText('$1,750.00')).toBeNull();
  });

  /** Nothing earned renders a zero, not a blank cell — absence of data and a
      balance of nothing are different statements. */
  it('renders zero earnings rather than an empty cell', async () => {
    renderWithProviders(<PartnersPage />);

    expect(await screen.findByText('$0.00')).toBeInTheDocument();
  });
});

/**
 * THE SORT USED TO BE A LIE.
 *
 * `GET /admin/ib/partners` accepted `page` and `limit` and nothing else when
 * this screen was built, so every column was correctly `sortable: false`. The
 * endpoint now allowlists five keys — so the columns that name one must reach
 * the API, and the column outside it must still refuse to offer an ordering the
 * endpoint would answer 400 to.
 */
describe('partner list — sorting reaches the API', () => {
  it('SENDS the sort instead of reordering the current page', async () => {
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    await userEvent.click(screen.getByRole('button', { name: /^level$/i }));

    await waitFor(() =>
      expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({
        sort: 'level',
        order: 'asc',
      }),
    );
  });

  it('sorts the LEVEL by its integer key, not by the level name on the row', async () => {
    /*
     * The cell reads "1 — Introducing Broker", so the obvious key would be the
     * joined level NAME. Ordering by that text puts "Level 10" before
     * "Level 2", which is the kind of ordering that looks plausible enough to
     * ship. `level` is the integer column, and it is what the API allowlists.
     */
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    await userEvent.click(screen.getByRole('button', { name: /^level$/i }));

    await waitFor(() => expect(getIbPartners.mock.calls.at(-1)?.[0]?.sort).toBe('level'));
  });

  it('cycles asc → desc → OFF, dropping both params on the third click', async () => {
    /*
     * `null` on the third click is a real state, not a missing value: it means
     * "drop both parameters and let the endpoint apply its own default"
     * (`approvedAt desc`). Substituting that default here instead would look
     * identical on screen and be a different request — and a lingering `order`
     * with no `sort` is a URL the API is entitled to reject.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    const header = () => screen.getByRole('button', { name: /^email$/i });

    await user.click(header());
    await waitFor(() =>
      expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({
        sort: 'userEmail',
        order: 'asc',
      }),
    );

    await user.click(header());
    await waitFor(() => expect(getIbPartners.mock.calls.at(-1)?.[0]?.order).toBe('desc'));

    await user.click(header());
    await waitFor(() => {
      const params = getIbPartners.mock.calls.at(-1)?.[0];
      expect(params?.sort).toBeUndefined();
      expect(params?.order).toBeUndefined();
    });
  });

  it('returns to page ONE when the sort changes', async () => {
    // Reordering renumbers every page, so the rows at positions 26–50 under the
    // new sort are not the ones that were there under the old.
    getIbPartners.mockResolvedValue(page([partner()], 500));
    const user = userEvent.setup();
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    await user.click(screen.getByRole('button', { name: 'Page 4' }));
    await waitFor(() => expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({ page: 4 }));

    await user.click(screen.getByRole('button', { name: /^level$/i }));

    await waitFor(() => expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({ page: 1 }));
  });

  it('offers NO sort on the column outside the allowlist', async () => {
    /*
     * `parentIbUserId` is absent from `IB_PARTNER_SORT_COLUMNS`, and the cell
     * renders "Direct" or "Has parent" rather than the id — so the ordering an
     * operator would expect from clicking it is not one the column could give.
     * R-2.5 makes an unrecognised sort a 400, so a header here would turn a
     * click into an error page instead of rows.
     */
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    const header = screen.getByRole('columnheader', { name: /^parent$/i });
    expect(within(header).queryByRole('button')).toBeNull();
  });
});

/**
 * THE ROWS-PER-PAGE SELECTOR.
 *
 * This page always passed an `onPageSizeChange`, but the pager itself then
 * called `onPageChange(1)` immediately after it — which was harmless for a
 * `useState` page like this one and silently destroyed the new size on every
 * URL-backed table. The reset is the caller's job now, so this pins that this
 * screen still does it.
 */
describe('partner list — the rows-per-page selector reaches the API', () => {
  async function choosePageSize(user: ReturnType<typeof userEvent.setup>, size: string) {
    await user.click(await screen.findByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: size }));
  }

  it('sends a new limit when the size changes', async () => {
    const user = userEvent.setup();
    getIbPartners.mockResolvedValue(page([partner()], 500));
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    await choosePageSize(user, '100');

    await waitFor(() => expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({ limit: 100 }));
  });

  it('RESETS to page one, so the new size cannot land past the end', async () => {
    // Page 4 at 25 a page is past the end at 100 a page, which renders as an
    // empty table and reads as "no partners".
    const user = userEvent.setup();
    getIbPartners.mockResolvedValue(page([partner()], 500));
    renderWithProviders(<PartnersPage />);
    await screen.findByText('partner@oxshare.com');

    await user.click(screen.getByRole('button', { name: 'Page 4' }));
    await waitFor(() => expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({ page: 4 }));

    await choosePageSize(user, '100');

    await waitFor(() =>
      expect(getIbPartners.mock.calls.at(-1)?.[0]).toMatchObject({ page: 1, limit: 100 }),
    );
  });
});
