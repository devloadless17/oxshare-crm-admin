import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AdminLayout } from './admin-layout';

/**
 * The layout has THREE states, and only two of them used to be handled.
 *
 * `useAdmin()` starts with `admin: null, isLoading: true` for the length of the
 * GET /admin/auth/me round trip. During that window the layout fell back to the
 * UNFILTERED nav list and rendered `children` unguarded, so:
 *
 *  - every sub-admin saw the complete master-admin navigation, then watched it
 *    shrink once identity arrived, and
 *  - a page the admin is not permitted to see mounted and fired its queries,
 *    each one guaranteed to return 403, before the access-denied panel replaced
 *    it.
 *
 * Neither is a privilege leak — `PermissionsGuard` answers 403 independently and
 * `canAccess` blocks the body once identity is known. Both are the UI asserting
 * something untrue while it waits, which on an admin console is how people learn
 * not to trust what it shows them.
 */

const { useAdmin } = vi.hoisted(() => ({ useAdmin: vi.fn() }));

vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));
vi.mock('next/navigation', () => ({ usePathname: () => '/withdrawals' }));

const MASTER = {
  id: 'a1',
  name: 'Master',
  email: 'master@test.local',
  role: 'master_admin',
  permissions: ['*'],
};

/** A sub-admin who may see KYC and nothing else in FINANCIALS. */
const KYC_ONLY = {
  id: 'a2',
  name: 'Reviewer',
  email: 'reviewer@test.local',
  role: 'sub_admin',
  permissions: ['kyc.review'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminLayout — a dead session renders nothing, not the page', () => {
  /*
   * `!isLoading && admin === null` is REACHABLE, and it used to fall through to
   * `children`.
   *
   * proxy.ts admits a request on the mere PRESENCE of the refresh cookie — the
   * middleware runtime has no signing key and cannot verify one — so a cookie
   * that is present but dead (revoked by a logout on another device, killed by
   * refresh-token reuse detection, or belonging to a deleted admin) gets past
   * the gate. `GET /admin/auth/me` then 401s and settles as null with
   * `retry: false`, and the layout drew the page body with `canAccess` never
   * called, until the 401 interceptor's redirect landed a round trip later.
   */
  it('renders no children once we know there is no admin', () => {
    useAdmin.mockReturnValue({ admin: null, isLoading: false, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>withdrawal queue</p>
      </AdminLayout>,
    );

    expect(screen.queryByText('withdrawal queue')).not.toBeInTheDocument();
  });

  it('renders no navigation once we know there is no admin', () => {
    useAdmin.mockReturnValue({ admin: null, isLoading: false, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>withdrawal queue</p>
      </AdminLayout>,
    );

    // Not even the nav shell: there is no identity to filter it by, and an
    // unfiltered list is the master-admin menu.
    expect(screen.queryByRole('link', { name: /withdrawals/i })).not.toBeInTheDocument();
  });
});

describe('AdminLayout — nothing is shown until we know who is asking', () => {
  it('renders no navigation while the session is still loading', () => {
    useAdmin.mockReturnValue({ admin: null, isLoading: true, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    // The regression: this used to show the whole master-admin nav to everyone
    // for the duration of the identity request.
    expect(screen.queryByText('Withdrawals')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
    expect(screen.queryByText('Clients')).not.toBeInTheDocument();
  });

  it('does not mount the page body while the session is still loading', () => {
    useAdmin.mockReturnValue({ admin: null, isLoading: true, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    // Children mounting early is what fired the guaranteed-403 requests.
    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the full navigation to a master admin once loaded', () => {
    useAdmin.mockReturnValue({ admin: MASTER, isLoading: false, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    expect(screen.getByText('Withdrawals')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('hides sections a sub-admin cannot reach, and denies the page body', () => {
    useAdmin.mockReturnValue({ admin: KYC_ONLY, isLoading: false, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    expect(screen.getByText('KYC Review')).toBeInTheDocument();
    // /audit-log is master-only; /withdrawals needs withdrawals.view.
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
    expect(screen.queryByText('Withdrawals')).not.toBeInTheDocument();

    // usePathname is /withdrawals, which this admin cannot access.
    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});
