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
const { getIbApplications, approveIbApplication, rejectIbApplication, getAgencies } = vi.hoisted(
  () => ({
    getIbApplications: vi.fn(),
    approveIbApplication: vi.fn(),
    rejectIbApplication: vi.fn(),
    getAgencies: vi.fn(),
  }),
);

/*
 * BOTH the named export and the default — see admin/CLAUDE.md. Mocking only
 * `default` leaves the named `api` undefined, the page throws on first use, its
 * own catch swallows the TypeError, and what renders is a generic "failed to
 * load" that reads as a broken query rather than a broken mock.
 */
// The period lives in the URL (`useDateRange`), so the page needs a router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/approvals/ib',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getIbApplications,
      approveIbApplication,
      rejectIbApplication,
      getAgencies,
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
      userId: 1000001,
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
      portalId: 1000245,
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
    permissions.current = ['ib.applications.view'];
    renderWithProviders(<ApprovalsIbPage />);

    await screen.findByText('applicant@example.com');
    expect(screen.getByText(/view only/i)).toBeInTheDocument();
  });

  it('offers a row menu once the reviewer may act', async () => {
    permissions.current = ['ib.applications.view', 'ib.approve'];
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

    // The settled question is stated, not re-asked: no AGENCY radio list, just
    // "appointing them under what they requested".
    expect(await screen.findByText(/appointing them under levant partners/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /gulf desk/i })).toBeNull();
    /*
     * `getAgencies` IS called now, and this line used to assert it was not.
     *
     * That was a real optimisation while the agency only answered "which one" —
     * an application naming one needed no catalogue read. Since 0107 the agency
     * also carries `defaultProgramId`, which is what the programme picker
     * pre-selects, so the row is needed even when the agency is settled. The
     * assertion below is what the skipped read was protecting: the reviewer is
     * still not ASKED to choose one.
     */

    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    // No terms travel any more (0112): a partner's level is derived from who
    // recruited them, so approval carries the agency and nothing else.
    await waitFor(() => expect(approveIbApplication).toHaveBeenCalledWith('app-1', {}));
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
      }),
    );
  });

  /*
   * ── THE TERMS ARE NOT CHOSEN HERE ANY MORE (0112) ───────────────────────
   *
   * Four cases stood here, covering the commission-programme picker: that the
   * reviewer's choice beat the default, that each programme showed its whole
   * ladder, that a disabled one was never offered, and that an empty catalogue
   * dimmed the button.
   *
   * There is no catalogue. A partner's terms come from their LEVEL, and a level
   * is not a choice — it is where they sit: no parent means level 1, and a
   * partner recruited by another is a rung deeper. So approval has nothing
   * commercial left in it, and there is no picker for those cases to cover.
   *
   * What replaces them is the assertion below: that the dialog asks NOTHING
   * about terms. It is worth keeping as a test rather than deleting outright,
   * because the failure it guards against is a control quietly coming back —
   * which is how this screen ends up deciding pay in two places again.
   */
  it('asks nothing about commission terms', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsIbPage />);
    await openApproveDialog(user);

    /* The agency question is still asked, so this waits on a real render. */
    await screen.findByText(/appointing them under levant partners/i);

    expect(screen.queryByText(/commission/i)).toBeNull();
    expect(screen.queryByText(/level/i)).toBeNull();
    expect(screen.queryByRole('radio', { name: /gold|silver/i })).toBeNull();
  });
});
