import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ClientProfilePage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * FR-ADM-01's client profile.
 *
 * ── What this file exists to pin ────────────────────────────────────────────
 *
 * THREE kinds of absence, none of which may look like another:
 *
 *   section key missing    → you lack the permission     ("hidden by your…")
 *   section present, empty → this client has none        ("no documents")
 *   field key missing      → masked from you             ("••••")
 *
 * Collapse any pair and the screen starts making claims about the CLIENT that
 * are really claims about the VIEWER. The documents card is the sharpest case:
 * a compliance reviewer shown nothing concludes nothing was uploaded.
 *
 * And the 404 branch, which is a security property rather than a UX one — see
 * the case at the bottom.
 */

const {
  getClient,
  getTags,
  assignTag,
  unassignTag,
  getPartnerDetail,
  getClients,
  getTradingAccounts,
  getClientIdentity,
  getWallets,
  getTransactions,
  getTransactionsSummary,
} = vi.hoisted(() => ({
  // The Overview's glance row: counts and single rows from the tabs' lists.
  getWallets: vi.fn(),
  getTransactions: vi.fn(),
  getTransactionsSummary: vi.fn(),
  getClient: vi.fn(),
  // The identity record panel (documents and decisions) — its own request.
  getClientIdentity: vi.fn().mockResolvedValue({}),
  // A partner's Referred clients / Referred accounts tabs.
  getClients: vi.fn(),
  getTradingAccounts: vi.fn(),
  getTags: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
  /*
   * REQUIRED, even though most cases here are not partners.
   *
   * The page calls it on every render. A mock that omits it leaves the method
   * undefined, the call throws, `useResource` swallows the TypeError into its
   * own error state, and the screen reports a generic failure — which reads as
   * a broken query rather than a broken mock. The repo's CLAUDE.md records that
   * this has cost real time twice.
   */
  getPartnerDetail: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getWallets,
      getTransactions,
      getTransactionsSummary,
      getClient,
      getTags,
      assignTag,
      unassignTag,
      getPartnerDetail,
      getClients,
      getTradingAccounts,
      getClientIdentity,
    },
  };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  // The route carries the Portal ID, exactly as every console link builds it.
  useParams: () => ({ id: '1000245' }),
  // The tag hook leaves the page after a hand-off (use-client-tag-toggle.ts).
  useRouter: () => ({ push: vi.fn() }),
}));

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

const profile = (over: Record<string, unknown> = {}) => ({
  id: '0b7d3c9e-4f21-48a6-9c05-2d8e11aa3f47',
  portalId: 1000245,
  email: 'client@oxshare.com',
  firstName: 'John',
  lastName: 'Doe',
  type: 'individual',
  status: 'active',
  verificationLevel: 1,
  emailVerified: true,
  country: 'Lebanon',
  phone: '+961 1 000 000',
  createdAt: '2026-08-01T00:00:00.000Z',
  tags: [],
  maskedFields: [] as string[],
  ...over,
});

/** A 404 carrying the API's machine code, which is what the branch reads. */
const notFound = () => ({
  response: { status: 404, data: { code: 'CLIENT_NOT_FOUND', message: 'Client not found.' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getClient.mockResolvedValue(profile());
  getWallets.mockResolvedValue({
    items: [
      {
        id: 'w-1',
        walletNumber: 'W-000001',
        name: 'USD Wallet',
        balance: '286.69000000',
        onHold: '0.00000000',
        currency: 'USD',
        kind: 'main',
      },
    ],
    total: 1,
  });
  getTradingAccounts.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    limit: 1,
    nextCursor: null,
  });
  getTransactions.mockResolvedValue({ items: [], total: 0, counts: {}, directionCounts: {} });
  getTransactionsSummary.mockResolvedValue({
    rows: [
      {
        direction: 'deposit',
        kind: 'payment',
        state: 'success',
        currency: 'USD',
        count: 3,
        total: '900.00000000',
      },
      {
        direction: 'withdrawal',
        kind: 'payment',
        state: 'pending',
        currency: 'USD',
        count: 2,
        total: '50.00000000',
      },
    ],
    directions: [],
  });
  getTags.mockResolvedValue([]);
  // Not a partner — the ordinary answer, and the one that keeps the partner tab
  // absent so these cases exercise the individual-client shape.
  getPartnerDetail.mockResolvedValue(null);
  getClients.mockResolvedValue({ items: [], total: 0, maskedFields: [] });
  getTradingAccounts.mockResolvedValue({ items: [], total: 0, maskedFields: [] });
});

describe('the profile itself', () => {
  it('shows the client', async () => {
    renderWithProviders(<ClientProfilePage />);
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('client@oxshare.com')).toBeInTheDocument();
  });

  it('shows the identity fields', async () => {
    renderWithProviders(<ClientProfilePage />);
    expect(await screen.findByText('Lebanon')).toBeInTheDocument();
    expect(screen.getByText('+961 1 000 000')).toBeInTheDocument();
  });

  it('shows the Portal ID with a copy affordance, and the uuid nowhere', async () => {
    const { container } = renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');

    // The detail page is where an operator quotes the ID from — the Portal ID,
    // which is the only identifier a client has on any screen.
    expect(screen.getByText('Portal ID')).toBeInTheDocument();
    expect(screen.getByText('1000245')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy portal id/i })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('0b7d3c9e');
  });

  it('asks the API for the client by the Portal ID in its own URL', async () => {
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');
    expect(getClient).toHaveBeenCalledWith('1000245', expect.anything());
  });
});

describe('a MASKED field', () => {
  it('keeps its label and says the value is hidden', async () => {
    /*
     * Per-cell here, unlike the LIST which drops the whole column. A profile is
     * a fixed labelled grid — omitting a field leaves an unexplained hole and
     * shifts the layout, so the label stays and the value explains itself.
     */
    getClient.mockResolvedValue(profile({ phone: undefined, maskedFields: ['client.phone'] }));
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    // The label survives…
    expect(screen.getByText('Phone')).toBeInTheDocument();
    // …and the value says why it is not there, rather than showing an em dash.
    expect(screen.getAllByText(/hidden by your permissions/i).length).toBeGreaterThan(0);
  });
});

/**
 * Open one of the profile's tabs.
 *
 * The screen is tabbed now, and `TabPanel` renders NOTHING when it is not
 * active — so a section that used to be in the initial DOM is only there once
 * its tab is selected. Asserting without this passes vacuously against a page
 * that never rendered the section at all, which is the failure mode these
 * absence tests exist to catch.
 */
async function openTab(name: RegExp): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name }));
}

describe('the Overview — figures at a glance, then who they are (owner, 29 Sep 2026)', () => {
  /*
   * It summarises; it does not repeat the tabs. One row of figures, each from a
   * count or a single row and each opening its tab; beneath, the three cards no
   * tab shows. No wallet list, no account list, no movement list here.
   */
  it('shows the glance figures and the three profile cards — and no tab’s list', async () => {
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');

    for (const heading of [/personal details/i, /^account$/i, /^verification$/i]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    for (const heading of [/^wallets$/i, /recent activity/i, /^tags$/i, /identity record/i]) {
      expect(screen.queryByRole('heading', { name: heading })).toBeNull();
    }
    // The server's own totals, one line per currency — never added here.
    const deposited = await screen.findByRole('button', { name: /deposited/i });
    expect(deposited).toHaveTextContent('$900.00');
    expect(screen.getByRole('button', { name: /pending/i })).toHaveTextContent('2');
    expect(await screen.findByRole('button', { name: /balance/i })).toHaveTextContent('$286.69');
  });

  it('asks for COUNTS, never a list — one row at most', async () => {
    renderWithProviders(<ClientProfilePage />);
    await screen.findByRole('button', { name: /last activity/i });
    for (const call of getTradingAccounts.mock.calls) {
      expect((call[0] as { limit: number }).limit).toBe(1);
    }
    for (const call of getTransactions.mock.calls) {
      expect((call[0] as { limit: number }).limit).toBe(1);
    }
  });

  it('opens the tab a figure summarises', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientProfilePage />);
    await user.click(await screen.findByRole('button', { name: /trading accounts/i }));
    expect(screen.getByRole('tab', { name: /^accounts$/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('leaves out the Verification card, and the figures, a reader may not see', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');
    expect(screen.queryByRole('heading', { name: /^verification$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /deposited/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /balance/i })).toBeNull();
  });
});

describe('the Accounts, Transactions and Documents tabs', () => {
  it('are offered to a reader holding their keys', async () => {
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');
    expect(screen.getByRole('tab', { name: /^accounts$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^transactions$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^documents$/i })).toBeInTheDocument();
    // History was replaced by Transactions.
    expect(screen.queryByRole('tab', { name: /^history$/i })).toBeNull();
  });

  it('drop Accounts without trading.view and Transactions without transactions.view', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');
    expect(screen.queryByRole('tab', { name: /^accounts$/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^transactions$/i })).toBeNull();
    // Documents stays: its endpoint names what this reader may not see.
    expect(screen.getByRole('tab', { name: /^documents$/i })).toBeInTheDocument();
  });
});

describe('the other permission-gated sections', () => {
  it('hides referrals without ib.view', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/network/i);
    expect(screen.getByText(/referral relationships are hidden/i)).toBeInTheDocument();
  });
});

describe('a client the viewer may not see', () => {
  it('gives ONE message for "no such client" and "outside your scope"', async () => {
    /*
     * A SECURITY property, not a UX one.
     *
     * Distinguishing the two would let a scoped administrator enumerate the
     * client base they were specifically denied: try uuids, read the
     * difference. The API answers an identical 404 for both, and this screen
     * must not undo that by explaining which one happened.
     */
    getClient.mockRejectedValue(notFound());
    renderWithProviders(<ClientProfilePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/not available/i);
    // The copy is deliberately vague AND says so, so an operator asks the right
    // question instead of filing a bug.
    expect(screen.getByText(/may not exist, or it may be outside/i)).toBeInTheDocument();
  });

  it('does NOT show the not-found card for a genuinely unbuilt endpoint', async () => {
    /*
     * Only the API's ROUTE_NOT_FOUND is "this endpoint is not built yet"
     * (`unavailable`); rendering it as a missing CLIENT would send somebody
     * looking for a client that was never the problem.
     */
    getClient.mockRejectedValue({ response: { status: 404, data: { code: 'ROUTE_NOT_FOUND' } } });
    renderWithProviders(<ClientProfilePage />);

    expect(await screen.findByText(/not implemented yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/may not exist, or it may be outside/i)).not.toBeInTheDocument();
  });
});

/**
 * The partner tab, and the rule that decides whether it exists at all.
 *
 * A fourth kind of absence, on top of the three this file already pins: the tab
 * is missing because the SUBJECT is not a partner, not because the viewer
 * cannot see partners. An empty "Partner" tab on an individual client invites
 * the question of whether the data failed to load, which is the same confusion
 * the hidden/none-yet distinction exists to prevent.
 */
const partnerDetail = (over: Record<string, unknown> = {}) => ({
  userId: 'c-1',
  /*
   * The RUNG and the terms it carries (0112). These replaced a named programme
   * with its per-depth ladder, which had itself replaced `level` / `levelName`
   * / `rateValue` in 0102 — so the field names have moved twice and the
   * question has not: what is this partner paid, and can the screen say it.
   *
   * Per-lot on purpose. It is the shape the business asked for on the main
   * partner's rung, and it is the one that catches a renderer dropping the
   * UNIT: "$10 per lot" and "10% of revenue" are two entirely different
   * payouts, and only one of them is right here.
   */
  level: 1,
  levelName: 'Main Partner',
  levelEnabled: true,
  levelCommissionShare: '70.0000',
  levelRebateShare: '50.0000',
  referralCode: 'JFSA8BQB',
  active: true,
  approvedAt: '2026-08-13T00:00:00.000Z',
  agencyId: null,
  agencyName: null,
  products: [] as string[],
  parent: {
    userId: 'p-1',
    email: 'master@oxshare.com',
    firstName: 'Master',
    lastName: 'Partner',
  },
  directPartners: [] as unknown[],
  referredClientCount: 4,
  // One line per currency (the API stopped summing across currencies).
  earnings: [{ currency: 'USD', confirmed: '31.50000000', pending: '0.00000000' }],
  ...over,
});

describe('CORE-18 on an ordinary client', () => {
  it('opens the Edit profile dialog for a client who is NOT a partner', async () => {
    /*
     * The two CORE-18 dialogs were mounted inside the `partner &&` block, so
     * for an individual client the actions menu offered "Edit profile", the
     * click set state, and nothing rendered. Rendering the dialogs directly in
     * their own test could not see it; this drives the menu on the page.
     */
    const user = userEvent.setup();
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');

    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit profile/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('the partner tab', () => {
  it('is ABSENT for a client who is not a partner', async () => {
    getPartnerDetail.mockResolvedValue(null);
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    expect(screen.queryByRole('tab', { name: /partner/i })).not.toBeInTheDocument();
  });

  it('shows the level, the terms it carries and the code for a partner', async () => {
    getPartnerDetail.mockResolvedValue(partnerDetail());
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/partner/i);

    expect(screen.getByText(/Level 1 · Main Partner/)).toBeInTheDocument();
    expect(screen.getByText('JFSA8BQB')).toBeInTheDocument();
    /*
     * BOTH terms and both UNITS. The unit matters: "50" alone is two different
     * payouts, and only the glyph says which. A main partner takes the rest
     * (0197), so their own commission share is not shown as a term.
     */
    expect(
      screen.getByText(
        /Partner 100% on own clients, the rest on sub-partners’ · client rebate 50% of its rebate/i,
      ),
    ).toBeInTheDocument();
  });

  it('names the parent, and says so plainly when there is none', async () => {
    getPartnerDetail.mockResolvedValue(partnerDetail({ parent: null }));
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/partner/i);

    /*
     * "Deals with the broker directly" rather than an em dash. No parent is the
     * TOP OF A CHAIN, which is a standing, not a missing value — rendering it
     * as an absence reads as data that failed to load.
     */
    expect(screen.getByText(/deals with the broker directly/i)).toBeInTheDocument();
  });

  it('explains an absent agency as the FULL catalogue, never as "none"', async () => {
    getPartnerDetail.mockResolvedValue(partnerDetail({ agencyName: null }));
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/partner/i);

    // A partner on no agency has clients offered everything. "None" would read
    // as the opposite, and would be acted on.
    expect(screen.getByText(/full product catalogue/i)).toBeInTheDocument();
  });

  it('keeps earnings as the STRING the API sent (§6.1)', async () => {
    getPartnerDetail.mockResolvedValue(
      // Seventeen significant digits: `Number()` is already wrong before
      // formatting, which is the whole reason money crosses the wire as text.
      partnerDetail({
        earnings: [{ currency: 'USD', confirmed: '12345678901.23456789', pending: '0' }],
      }),
    );
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/partner/i);

    /*
     * `formatMoney` displays at 2dp, so the assertion is on the INTEGER part —
     * which is where a float would actually corrupt the value. Rounding for
     * display is fine; arriving already-wrong is not, and 12345678901.23456789
     * through a double does not survive.
     */
    expect(screen.getByText(/12,345,678,901\.23/)).toBeInTheDocument();
  });

  it('shows each currency on its own line, never one total', async () => {
    /*
     * The panel took a hard-coded "USD" and printed one figure the API had
     * summed across currencies — 100 USD and 90 EUR read as $190.00. Two
     * currencies must stay two lines, each in its own currency.
     */
    getPartnerDetail.mockResolvedValue(
      partnerDetail({
        earnings: [
          { currency: 'EUR', confirmed: '90.00000000', pending: '0' },
          { currency: 'USD', confirmed: '100.00000000', pending: '0' },
        ],
      }),
    );
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/partner/i);

    expect(screen.getByText(/90\.00/)).toBeInTheDocument();
    expect(screen.getByText(/100\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/190\.00/)).not.toBeInTheDocument();
  });
});

describe("a partner's book — Referred clients and Referred accounts (owner, 26 Sep 2026)", () => {
  it('offers both tabs for a partner, and neither for an ordinary client', async () => {
    getPartnerDetail.mockResolvedValue(partnerDetail());
    const { unmount } = renderWithProviders(<ClientProfilePage />);

    expect(await screen.findByRole('tab', { name: /referred clients/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /referred accounts/i })).toBeInTheDocument();
    unmount();

    getPartnerDetail.mockResolvedValue(null);
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');
    expect(screen.queryByRole('tab', { name: /referred/i })).toBeNull();
  });

  it("lists the partner's clients by their Portal ID, and their accounts the same way", async () => {
    const user = userEvent.setup();
    getPartnerDetail.mockResolvedValue(partnerDetail());
    renderWithProviders(<ClientProfilePage />);

    await user.click(await screen.findByRole('tab', { name: /referred clients/i }));
    await vi.waitFor(() =>
      expect(getClients).toHaveBeenCalledWith(
        expect.objectContaining({ referredBy: '1000245', page: 1, withTotal: true }),
        expect.anything(),
      ),
    );

    await user.click(screen.getByRole('tab', { name: /referred accounts/i }));
    await vi.waitFor(() =>
      expect(getTradingAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ referredBy: '1000245', page: 1 }),
        expect.anything(),
      ),
    );
  });

  it('the menu no longer offers "View clients they introduced" (owner, 29 Sep 2026)', async () => {
    // The Referred clients TAB is one click away on the same page.
    const user = userEvent.setup();
    getPartnerDetail.mockResolvedValue(partnerDetail());
    renderWithProviders(<ClientProfilePage />);
    await screen.findByRole('tab', { name: /referred clients/i });
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await screen.findByRole('menuitem', { name: /edit profile/i });
    expect(screen.queryByRole('menuitem', { name: /clients they introduced/i })).toBeNull();
  });
});

describe('the actions menu, trimmed (owner, 26 Sep 2026)', () => {
  it('offers no commission-level change, no parent reassignment and no documents item', async () => {
    const user = userEvent.setup();
    getPartnerDetail.mockResolvedValue(partnerDetail());
    getClient.mockResolvedValue(profile({ documents: ['passport.png'] }));
    renderWithProviders(<ClientProfilePage />);
    await screen.findByRole('tab', { name: /referred clients/i });

    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await screen.findByRole('menuitem', { name: /edit profile/i });

    expect(screen.queryByRole('menuitem', { name: /commission level/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /reassign parent/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /view documents/i })).toBeNull();
    // "View KYC" — moved here from the Overview's KYC card — by Portal ID.
    expect(screen.getByRole('menuitem', { name: /view kyc/i })).toHaveAttribute(
      'href',
      '/kyc/1000245',
    );
  });
});
