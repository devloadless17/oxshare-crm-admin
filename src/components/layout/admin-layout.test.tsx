import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { activeNavHref, AdminLayout } from './admin-layout';
import { ALL_PERMISSIONS } from '@/test/permissions';

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
// `/currencies` requires `settings.view`, so a master admin reaches it and a
// sub-admin holding only kyc/users keys does not — which is what the
// deny-the-body assertion below needs. It was `/withdrawals` until that
// route left with the money teardown.
vi.mock('next/navigation', () => ({ usePathname: () => '/currencies' }));

const MASTER = {
  id: 'a1',
  name: 'Master',
  email: 'master@test.local',
  role: 'master_admin',
  permissions: ALL_PERMISSIONS,
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
    expect(screen.queryByText('Currencies')).not.toBeInTheDocument();
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

    expect(screen.getByText('Currencies')).toBeInTheDocument();
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
    expect(screen.queryByText('Currencies')).not.toBeInTheDocument();

    // usePathname is /currencies, which this admin cannot access.
    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});

/**
 * Every nav entry goes somewhere.
 *
 * The sidebar used to carry `/trading-accounts` and `/payouts` as disabled
 * "Soon" rows for pages that had no `page.tsx` at all. They are gone, and these
 * pin that they stay gone — a placeholder row is the easiest thing in this file
 * to reintroduce, because adding one is a two-line change that nothing else
 * objects to.
 */
describe('the sidebar lists only pages that exist', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ admin: MASTER, isLoading: false, logout: vi.fn() });
  });

  it('offers no "Soon" placeholder to a master admin, who sees the most', () => {
    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    expect(screen.queryByText(/^soon$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Trading Accounts')).not.toBeInTheDocument();
    expect(screen.queryByText('Payouts')).not.toBeInTheDocument();
  });

  it('groups the rest under Overview, Clients, Finance and Administration', () => {
    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
    expect(screen.getByText('CLIENTS')).toBeInTheDocument();
    expect(screen.getByText('FINANCE')).toBeInTheDocument();
    expect(screen.getByText('ADMINISTRATION')).toBeInTheDocument();
    // The headings this replaced, so a half-applied rename is caught.
    expect(screen.queryByText('MAIN')).not.toBeInTheDocument();
    expect(screen.queryByText('MANAGEMENT')).not.toBeInTheDocument();
  });
});

/**
 * The theme control lives in the sidebar's account menu, not the header.
 *
 * It was a two-button light/dark toggle in the top bar with no way to say
 * "follow the OS". Asserting on the ABSENCE of the old control matters as much
 * as the presence of the new one: the failure mode of this change is two theme
 * controls, which is worse than either alone.
 */
describe('the account menu replaces the header theme toggle', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ admin: MASTER, isLoading: false, logout: vi.fn() });
  });

  it('renders the account menu trigger and no bare sign-out button', () => {
    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    // Two triggers: the sidebar foot, and the mobile header copy.
    expect(screen.getAllByRole('button', { name: /account menu/i }).length).toBeGreaterThan(0);
    // Sign-out moved INSIDE the menu, so it is not in the document while closed.
    expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
  });

  it('no longer renders the old light/dark buttons', () => {
    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    expect(screen.queryByTitle('Light Mode')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Dark Mode')).not.toBeInTheDocument();
  });
});

/**
 * Exactly one sidebar entry is the current page.
 *
 * `/kyc/builder` lit up BOTH "KYC Review" and "KYC Workflow Builder", because
 * each item tested itself in isolation with
 * `pathname === href || pathname.startsWith(href + '/')` — true for the prefix
 * `/kyc` and for the exact `/kyc/builder` at the same time.
 *
 * Nested routes are normal here, not an edge case: `/kyc` and `/kyc/builder` are
 * different screens behind different permissions. So the rule has to compare
 * candidates against each other, and these assert that it does.
 */
describe('activeNavHref', () => {
  const HREFS = ['/dashboard', '/clients', '/kyc', '/kyc/builder', '/roles', '/audit-log'];

  it('picks the NESTED route, not its parent', () => {
    // The reported bug, stated directly.
    expect(activeNavHref('/kyc/builder', HREFS)).toBe('/kyc/builder');
  });

  it('picks the parent when the nested route is not the page', () => {
    // A submission detail lives under /kyc and has no nav entry of its own, so
    // the parent is correctly the active one.
    expect(activeNavHref('/kyc', HREFS)).toBe('/kyc');
    expect(activeNavHref('/kyc/some-user-id', HREFS)).toBe('/kyc');
  });

  it('returns exactly ONE href for every route in the nav', () => {
    // The property that was violated. Asserted over the whole set rather than
    // one path, so a future nested route cannot quietly reintroduce it.
    for (const path of [...HREFS, '/kyc/abc', '/clients/123']) {
      const active = activeNavHref(path, HREFS);
      const lit = HREFS.filter((h) => h === active);
      expect(lit).toHaveLength(1);
    }
  });

  it('does not match a sibling that merely shares a prefix', () => {
    // '/kyc-archive' is not inside '/kyc'. String prefixes alone would say it is.
    expect(activeNavHref('/kyc-archive', HREFS)).toBeNull();
  });

  it('highlights nothing on a route that is not in the nav', () => {
    expect(activeNavHref('/login', HREFS)).toBeNull();
  });

  it('survives a null pathname', () => {
    expect(activeNavHref(null, HREFS)).toBeNull();
  });
});
