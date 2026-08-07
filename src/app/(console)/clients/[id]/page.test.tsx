import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import ClientProfilePage from './page';

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

const { getClient, getTags, assignTag, unassignTag } = vi.hoisted(() => ({
  getClient: vi.fn(),
  getTags: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getClient, getTags, assignTag, unassignTag } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c-1' }),
}));

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
  permissions.current = ['*'];
  getClient.mockResolvedValue(profile());
  getTags.mockResolvedValue([]);
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

describe('the documents section — the sharpest of the three absences', () => {
  it('says HIDDEN when the viewer lacks kyc.documents.view', async () => {
    /*
     * The failure this guards against: a section that simply vanishes. A
     * compliance reviewer looking at a client with no visible documents will
     * conclude none were uploaded — a statement about the client, when the
     * truth is a statement about the reviewer's permissions.
     */
    permissions.current = ['users.view'];
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

    const link = await screen.findByRole('link', { name: /passport\.png/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('passport.png'));
    expect(screen.queryByRole('img', { name: /passport/i })).not.toBeInTheDocument();
  });
});

describe('the other permission-gated sections', () => {
  it('hides trading accounts without trading.view', async () => {
    permissions.current = ['users.view'];
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
    expect(screen.getByText(/trading accounts are hidden/i)).toBeInTheDocument();
  });

  it('hides referrals without partners.view', async () => {
    permissions.current = ['users.view'];
    renderWithProviders(<ClientProfilePage />);

    await screen.findByText('John Doe');
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
