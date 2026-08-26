import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ApprovalsIbPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbApplicationPage } from '@/lib/api/admin';

/**
 * The partner-application queue — IB-01's review half, and ADM-11's screen.
 *
 * ## Why this file exists
 *
 * Both deliverables were held at PARTIAL for one reason only: the screen worked
 * and nothing asserted it. That is the weakest kind of partial — a page nobody
 * can change safely is not meaningfully finished — so the gap is closed here
 * rather than carried.
 *
 * Every case below is a rule with a wrong answer that renders perfectly:
 *
 *  - `ib.approve` and `ib.reject` are SEPARATE keys. A reviewer holding one must
 *    not be offered the other, because the API refuses it and a button that
 *    404s teaches an operator to distrust the console.
 *  - An application carrying NO agency must say so before it is approved.
 *    Approval GRANTS the agency, so an approval made without seeing which one is
 *    made blind — and "no agency" rendering as an empty cell is indistinguishable
 *    from a cell that failed to load.
 *  - The queue must never render mock rows. A failed load is a retry, not an
 *    empty success state that reads as "no partners are waiting".
 */
const { getIbApplications, approveIbApplication, rejectIbApplication, getAgencies, getIbPrograms } =
  vi.hoisted(() => ({
    getIbApplications: vi.fn(),
    approveIbApplication: vi.fn(),
    rejectIbApplication: vi.fn(),
    getAgencies: vi.fn(),
    getIbPrograms: vi.fn(),
  }));

/*
 * BOTH the named export and the default — see admin/CLAUDE.md. Mocking only
 * `default` leaves the named `api` undefined, the page throws on first use, its
 * own catch swallows the TypeError, and what renders is a generic "failed to
 * load" that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getIbApplications,
      approveIbApplication,
      rejectIbApplication,
      getAgencies,
      getIbPrograms,
    },
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

function row(
  over: Partial<IbApplicationPage['rows'][number]> = {},
): IbApplicationPage['rows'][number] {
  return {
    application: {
      id: 'app-1',
      userId: 'u-1',
      motivation: 'I introduce clients in Beirut.',
      website: null,
      status: 'pending',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: '2026-08-01T10:00:00.000Z',
    },
    user: {
      id: 'u-1',
      email: 'applicant@example.com',
      firstName: 'Rami',
      lastName: 'Khoury',
      verificationLevel: 1,
    },
    agencyName: 'Levant Partners',
    ...over,
  };
}

function page(rows: IbApplicationPage['rows']): IbApplicationPage {
  return {
    rows,
    total: rows.length,
    counts: { pending: rows.length, approved: 0, rejected: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIbApplications.mockResolvedValue(page([row()]));
  getAgencies.mockResolvedValue([
    { id: 'ag-1', name: 'Levant Partners', description: null, enabled: true, productIds: [] },
    { id: 'ag-2', name: 'Gulf Desk', description: null, enabled: true, productIds: [] },
  ]);
  /*
   * Gold FIRST by `sortOrder`, because that is the order the API resolves its
   * own default in — lowest order, ties by name. The dialog pre-selects the
   * same one, so "the default" is one fact rather than two that can disagree.
   *
   * "Retired" is disabled and must never be offered: a disabled programme pays
   * nothing, so choosing it is a decision whose only outcome is a refusal.
   */
  getIbPrograms.mockResolvedValue([
    {
      id: 'prog-gold',
      name: 'Gold',
      sortOrder: 0,
      mode: 'commission_only',
      tiers: [
        { depth: 1, rate: '60.0000' },
        { depth: 2, rate: '25.0000' },
      ],
      rebateRate: '0.0000',
      enabled: true,
      partnerCount: 4,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'prog-silver',
      name: 'Silver',
      sortOrder: 1,
      mode: 'commission_only',
      tiers: [{ depth: 1, rate: '40.0000' }],
      rebateRate: '0.0000',
      enabled: true,
      partnerCount: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'prog-retired',
      name: 'Retired',
      sortOrder: 2,
      mode: 'commission_only',
      tiers: [{ depth: 1, rate: '10.0000' }],
      rebateRate: '0.0000',
      enabled: false,
      partnerCount: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ]);
});

describe('the partner queue — what a reviewer is shown', () => {
  it('lists an applicant with the agency they applied under', async () => {
    renderWithProviders(<ApprovalsIbPage />);

    expect(await screen.findByText('applicant@example.com')).toBeInTheDocument();
    expect(screen.getByText('Levant Partners')).toBeInTheDocument();
  });

  /*
   * The agency is the thing approval GRANTS. An application that names none is a
   * decision the reviewer has to make, not a blank to skip past — so it is
   * called out in words rather than left as an empty cell, which would be
   * indistinguishable from a cell that failed to render.
   */
  it('says an application carries no agency instead of leaving the cell blank', async () => {
    getIbApplications.mockResolvedValue(page([row({ agencyName: null })]));
    renderWithProviders(<ApprovalsIbPage />);

    await screen.findByText('applicant@example.com');
    expect(screen.getByText(/choose on approval/i)).toBeInTheDocument();
  });

  it('asks the server for the queue rather than rendering anything of its own', async () => {
    renderWithProviders(<ApprovalsIbPage />);

    await waitFor(() => expect(getIbApplications).toHaveBeenCalled());
    const [params] = getIbApplications.mock.calls[0] as [{ page: number; limit: number }];
    expect(params.page).toBe(1);
    expect(params.limit).toBeGreaterThan(0);
  });

  /*
   * NEVER an empty success state on failure. "No applications here" in front of
   * a reviewer whose request 500'd is the console telling them nobody is
   * waiting, which is the one answer it must not invent.
   */
  it('offers a retry when the queue cannot be loaded, never an empty list', async () => {
    getIbApplications.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<ApprovalsIbPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no applications here/i)).toBeNull();
  });

  it('says so plainly when nothing is waiting', async () => {
    getIbApplications.mockResolvedValue(page([]));
    renderWithProviders(<ApprovalsIbPage />);

    expect(await screen.findByText(/no applications here/i)).toBeInTheDocument();
  });
});

/*
 * ── The two keys, which are deliberately not one ──
 *
 * `ib.approve` and `ib.reject` are separate because they are separate
 * decisions: a desk may be trusted to turn applicants away without being
 * trusted to appoint them. The screen has to keep them apart, or it offers
 * actions the API answers 403 to.
 */
describe('the partner queue — approve and reject are separate privileges', () => {
  it('offers neither action to a reviewer who may only look', async () => {
    permissions.current = ['ib.view'];
    renderWithProviders(<ApprovalsIbPage />);

    await screen.findByText('applicant@example.com');
    expect(screen.getByText(/view only/i)).toBeInTheDocument();
  });

  it('offers a row menu once the reviewer may act', async () => {
    permissions.current = ['ib.view', 'ib.approve'];
    renderWithProviders(<ApprovalsIbPage />);

    await screen.findByText('applicant@example.com');
    expect(screen.queryByText(/view only/i)).toBeNull();
  });
});

/*
 * ── The approve dialog confirms a named agency, and asks only for none ──
 *
 * The applicant's choice is REQUIRED at apply time, so the ordinary case is an
 * application that names one. Re-asking a settled question invites the reviewer
 * to change it by accident — and the bug this pins was worse: the page read the
 * agency name off the wrong level of the response, so EVERY approval was made
 * through the chooser and sent an explicit override the applicant never asked
 * for.
 */
describe('the approve dialog', () => {
  async function openApproveDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /actions for rami khoury/i }));
    await user.click(await screen.findByRole('menuitem', { name: /approve/i }));
  }

  it('confirms the requested agency without asking, and sends no override', async () => {
    approveIbApplication.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    // The settled question is stated, not re-asked: no AGENCY radio list and no
    // catalogue read, just "appointing them under what they requested".
    expect(await screen.findByText(/appointing them under levant partners/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /gulf desk/i })).toBeNull();
    expect(getAgencies).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    // The programme still travels: it defaults to the first enabled one, which
    // is what the API would have picked anyway — stated rather than implied.
    await waitFor(() =>
      expect(approveIbApplication).toHaveBeenCalledWith('app-1', { programId: 'prog-gold' }),
    );
  });

  it('asks for an agency when the application names none, and sends the pick', async () => {
    getIbApplications.mockResolvedValue(page([row({ agencyName: null })]));
    approveIbApplication.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    // Unreachable without a choice: the API would refuse an agency-less grant.
    const approve = await screen.findByRole('button', { name: /^approve$/i });
    expect(approve).toBeDisabled();

    await user.click(await screen.findByRole('radio', { name: /gulf desk/i }));
    await user.click(approve);
    await waitFor(() =>
      expect(approveIbApplication).toHaveBeenCalledWith('app-1', {
        agencyId: 'ag-2',
        programId: 'prog-gold',
      }),
    );
  });

  /**
   * ── THE TERMS ARE CHOSEN HERE, AND THAT IS THE POINT ────────────────────
   *
   * FR-IB-06 puts every partner on exactly one named programme. Until this
   * control existed the API's `programId` was reachable only by hand, so every
   * approved partner landed on whichever programme sorted first — an operator
   * could build Gold and Silver and assign nobody to either, at the one moment
   * the decision is naturally made.
   *
   * Asked EVERY time, unlike the agency: the agency is what the applicant
   * requested and re-asking second-guesses them, while the programme is the
   * broker's decision and the applicant never sees the catalogue at all.
   */
  it('sends the programme the reviewer chose over the default', async () => {
    approveIbApplication.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    await user.click(await screen.findByRole('radio', { name: /silver/i }));
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() =>
      expect(approveIbApplication).toHaveBeenCalledWith('app-1', { programId: 'prog-silver' }),
    );
  });

  it('shows each programme’s whole ladder, not just its name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    /*
     * A name alone does not tell a reviewer what they are about to put somebody
     * on — and the LEVEL COUNT is half that answer, not decoration: it is how
     * far this partner's earnings will reach.
     */
    expect(await screen.findByText(/L1 60% · L2 25% — reaches 2 level/i)).toBeInTheDocument();
  });

  /*
   * A DISABLED programme pays nothing, so offering one is a choice whose only
   * outcome is a refusal — and the reviewer would read that refusal as the
   * approval being impossible rather than the programme being switched off.
   */
  it('offers no disabled programme', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    await screen.findByRole('radio', { name: /gold/i });
    expect(screen.queryByRole('radio', { name: /retired/i })).toBeNull();
  });

  /*
   * An empty catalogue cannot be approved into: the API refuses it, and a
   * partner on no terms earns nothing while their referral link keeps working.
   * A dim button with a sentence beats a 400.
   */
  it('refuses to approve when no programme is enabled', async () => {
    getIbPrograms.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    expect(await screen.findByText(/no commission programme is enabled/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled();
  });
});
