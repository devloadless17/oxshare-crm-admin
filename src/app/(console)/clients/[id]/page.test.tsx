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

const { getClient, getTags, assignTag, unassignTag, getPartnerDetail } = vi.hoisted(() => ({
  getClient: vi.fn(),
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
  const api = { admin: { getClient, getTags, assignTag, unassignTag, getPartnerDetail } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c-1' }),
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
  id: 'c-1',
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
  getTags.mockResolvedValue([]);
  // Not a partner — the ordinary answer, and the one that keeps the partner tab
  // absent so these cases exercise the individual-client shape.
  getPartnerDetail.mockResolvedValue(null);
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

  it('shows the FULL client ID with a copy affordance', async () => {
    renderWithProviders(<ClientProfilePage />);
    await screen.findByText('John Doe');

    // The detail page is where an operator quotes the ID from, so unlike the
    // list it shows the uuid whole.
    expect(screen.getByText('Client ID')).toBeInTheDocument();
    expect(screen.getByText('c-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy full id/i })).toBeInTheDocument();
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

describe('the documents section — the sharpest of the three absences', () => {
  it('says HIDDEN when the viewer lacks kyc.documents.view', async () => {
    /*
     * The failure this guards against: a section that simply vanishes. A
     * compliance reviewer looking at a client with no visible documents will
     * conclude none were uploaded — a statement about the client, when the
     * truth is a statement about the reviewer's permissions.
     */
    permissions.current = ['clients.view'];
    getClient.mockResolvedValue(profile()); // API omits `documents` entirely
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    expect(screen.getByText(/documents are hidden by your permissions/i)).toBeInTheDocument();
  });

  it('says NONE UPLOADED when the viewer can see them and there are none', async () => {
    // The other half. These two must never render the same way.
    getClient.mockResolvedValue(profile({ documents: [] }));
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    expect(screen.getByText(/no documents uploaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/documents are hidden/i)).not.toBeInTheDocument();
  });

  it('links to each document rather than embedding it', async () => {
    /*
     * A LINK, never an inline image. Every fetch goes through
     * `GET /uploads/kyc/:file`, which applies the client scope, checks the
     * reader and writes the R-6.6 audit row. Embedding the bytes would route an
     * audited PII read around its own audit: "which admin viewed this passport"
     * would answer "nobody", because opening a profile is not viewing a
     * document.
     */
    getClient.mockResolvedValue(profile({ documents: ['passport.png'] }));
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    const link = await screen.findByRole('link', { name: /passport\.png/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('passport.png'));
    expect(screen.queryByRole('img', { name: /passport/i })).not.toBeInTheDocument();
  });
});

describe('the other permission-gated sections', () => {
  it('hides trading accounts without trading.view', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    expect(screen.getByText(/trading accounts are hidden/i)).toBeInTheDocument();
  });

  it('hides referrals without ib.view', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/network/i);
    expect(screen.getByText(/referral relationships are hidden/i)).toBeInTheDocument();
  });

  it('shows an empty section rather than a hidden one when permitted', async () => {
    getClient.mockResolvedValue(profile({ tradingAccounts: [], referredClients: [] }));
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    expect(screen.getByText(/no trading accounts yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/trading accounts are hidden/i)).not.toBeInTheDocument();
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
     * `useResource` maps every 404 to `unavailable`, which everywhere else in
     * this app means "this endpoint is not built yet". Branching on the status
     * alone would render a missing FEATURE as a missing CLIENT — and send
     * somebody looking for a client that was never the problem.
     */
    getClient.mockRejectedValue({ response: { status: 404, data: {} } });
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
  level: 2,
  levelName: 'Sub Partner',
  rateValue: '40.0000',
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
  earnings: { confirmed: '31.50000000', pending: '0.00000000' },
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

  it('shows the rung, the rate and the code for a partner', async () => {
    getPartnerDetail.mockResolvedValue(partnerDetail());
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    await openTab(/partner/i);

    expect(screen.getByText('Sub Partner')).toBeInTheDocument();
    expect(screen.getByText('JFSA8BQB')).toBeInTheDocument();
    // The rate is TRIMMED for reading — the stored scale is for arithmetic.
    expect(screen.getByText('40%')).toBeInTheDocument();
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
      partnerDetail({ earnings: { confirmed: '12345678901.23456789', pending: '0' } }),
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
});
