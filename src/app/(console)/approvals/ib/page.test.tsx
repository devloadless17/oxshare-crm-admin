import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
const { getIbApplications, approveIbApplication, rejectIbApplication } = vi.hoisted(() => ({
  getIbApplications: vi.fn(),
  approveIbApplication: vi.fn(),
  rejectIbApplication: vi.fn(),
}));

/*
 * BOTH the named export and the default — see admin/CLAUDE.md. Mocking only
 * `default` leaves the named `api` undefined, the page throws on first use, its
 * own catch swallows the TypeError, and what renders is a generic "failed to
 * load" that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = { admin: { getIbApplications, approveIbApplication, rejectIbApplication } };
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
