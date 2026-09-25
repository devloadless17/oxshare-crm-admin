import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { AdminLayout } from './admin-layout';
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

const { useAdmin, route, badges } = vi.hoisted(() => {
  const badges: { current: Record<string, number> } = { current: {} };
  /* Mutable, so a test can navigate by re-rendering. */
  const route = { pathname: '/currencies' };
  return { useAdmin: vi.fn(), route, badges };
});

vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));
/*
 * The counts are the hook's business and are pinned where they are computed;
 * here they are an input, so a test states the queue it is asserting about.
 */
vi.mock('./use-nav-badges', () => ({ useNavBadges: () => badges.current }));
// `/currencies` requires `settings.view`, so a master admin reaches it and a
// sub-admin holding only kyc/users keys does not — which is what the
// deny-the-body assertion below needs. It was `/withdrawals` until that
// route left with the money teardown.
/*
 * `useRouter` alongside it: the layout mounts the notification bell, which
 * reaches for the router so a toast raised by an incoming notification can
 * offer a "View" action. `useRouter` throws outside a mounted router, and
 * mocking this module partially — `usePathname` only — makes every other export
 * `undefined` rather than falling through to the real one.
 */
/*
 * `next/link` by its click contract (see the stand-in): the sidebar records
 * where a click is going from `onNavigate`, which the real component calls only
 * through a mounted app router — so without this, a click on a menu link here
 * would do nothing the menu can see.
 */
vi.mock('next/link', () => import('@/test/next-link'));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

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
  route.pathname = '/currencies';
  badges.current = {};
  // The rail preference is REMEMBERED (localStorage), so each test starts from
  // a clean browser rather than from whatever the last one collapsed.
  window.localStorage.clear();
  document.documentElement.dir = '';
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
    expect(screen.queryByText('Audit log')).not.toBeInTheDocument();
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
    expect(screen.getByText('Audit log')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('hides sections a sub-admin cannot reach, and denies the page body', () => {
    useAdmin.mockReturnValue({ admin: KYC_ONLY, isLoading: false, logout: vi.fn() });

    renderWithProviders(
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>,
    );

    expect(screen.getByText('KYC review')).toBeInTheDocument();
    // /audit-log needs audit.view; /currencies needs currencies.view.
    expect(screen.queryByText('Audit log')).not.toBeInTheDocument();
    expect(screen.queryByText('Currencies')).not.toBeInTheDocument();
    // A group with nothing this admin may open is not drawn at all.
    expect(screen.queryByRole('button', { name: /security/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finance/i })).not.toBeInTheDocument();

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
});

/**
 * MAIN ITEMS that open onto their pages — the owner's request (25 Sep 2026),
 * modelled on his old CRM: one group open at a time, and it is the one holding
 * the page you are on.
 */
describe('the sidebar is main items with sub-items', () => {
  const layout = () => (
    <AdminLayout>
      <p>page body</p>
    </AdminLayout>
  );
  const group = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

  beforeEach(() => {
    useAdmin.mockReturnValue({ admin: MASTER, isLoading: false, logout: vi.fn() });
  });

  it('offers the main items in order, with Dashboard alone above them', () => {
    renderWithProviders(layout());

    const nav = screen.getByRole('navigation');
    const headers = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(headers).toEqual([
      'Clients',
      'Introducing brokers',
      'Finance',
      'Trading',
      'System',
      'Security',
    ]);
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    // The flat headings this replaced, so a half-applied change is caught.
    expect(screen.queryByText('OVERVIEW')).not.toBeInTheDocument();
    expect(screen.queryByText('Approvals')).not.toBeInTheDocument();
  });

  it('opens the group holding the current page, and only that one', () => {
    renderWithProviders(layout());

    // /currencies is under Finance.
    expect(group('Finance')).toHaveAttribute('aria-expanded', 'true');
    for (const other of ['Clients', 'Introducing brokers', 'Trading', 'System', 'Security']) {
      expect(group(other)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('puts the KYC builder under System and the review queue under Clients', () => {
    renderWithProviders(layout());

    const system = document.getElementById(group('System').getAttribute('aria-controls') ?? '');
    const clients = document.getElementById(group('Clients').getAttribute('aria-controls') ?? '');
    expect(
      within(system as HTMLElement).getByRole('link', { name: 'KYC builder' }),
    ).toHaveAttribute('href', '/kyc/builder');
    expect(
      within(clients as HTMLElement).getByRole('link', { name: 'KYC review' }),
    ).toHaveAttribute('href', '/kyc?status=needs_review');
  });

  it('keeps one group open at a time', async () => {
    const user = userEvent.setup();
    renderWithProviders(layout());

    await user.click(group('Security'));

    expect(group('Security')).toHaveAttribute('aria-expanded', 'true');
    expect(group('Finance')).toHaveAttribute('aria-expanded', 'false');

    // And a second click closes it, leaving none open.
    await user.click(group('Security'));
    expect(group('Security')).toHaveAttribute('aria-expanded', 'false');
    expect(group('Finance')).toHaveAttribute('aria-expanded', 'false');
  });

  it('follows the page: navigating opens the new page’s group', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(layout());
    await user.click(group('Security'));

    route.pathname = '/kyc/builder';
    rerender(layout());

    expect(group('System')).toHaveAttribute('aria-expanded', 'true');
    expect(group('Security')).toHaveAttribute('aria-expanded', 'false');
  });

  it('highlights exactly one row, and it moves to the main item you open', async () => {
    const user = userEvent.setup();
    route.pathname = '/dashboard';
    renderWithProviders(layout());
    const nav = screen.getByRole('navigation');
    const selected = () => nav.querySelectorAll('[data-selected]');
    const dashboard = within(nav).getByRole('link', { name: 'Dashboard' });

    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toBe(dashboard);

    // The owner's report: opening System left Dashboard showing as active.
    await user.click(group('System'));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toBe(group('System'));
    // …while the PAGE is still the page, for a screen reader.
    expect(dashboard).toHaveAttribute('aria-current', 'page');

    // Closing it hands the selection back to where you are.
    await user.click(group('System'));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toBe(dashboard);
  });

  it('forgets an opened item once you move on — coming back does not revive it', async () => {
    /*
     * The reported sequence: open Trading on the dashboard, visit Products,
     * return to the dashboard. The choice was remembered against the PATH, so
     * the dashboard came back with Trading open and selected.
     */
    const user = userEvent.setup();
    route.pathname = '/dashboard';
    const { rerender } = renderWithProviders(layout());
    await user.click(group('Trading'));
    expect(group('Trading')).toHaveAttribute('data-selected', 'true');

    route.pathname = '/products';
    rerender(layout());
    expect(group('Trading')).toHaveAttribute('aria-expanded', 'true');

    route.pathname = '/dashboard';
    rerender(layout());

    const nav = screen.getByRole('navigation');
    expect(group('Trading')).toHaveAttribute('aria-expanded', 'false');
    expect(group('Trading')).not.toHaveAttribute('data-selected');
    expect(nav.querySelectorAll('[data-selected]')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('hands the selection back to the page when you click the page you are on', async () => {
    const user = userEvent.setup();
    route.pathname = '/dashboard';
    renderWithProviders(layout());
    await user.click(group('System'));
    expect(group('System')).toHaveAttribute('data-selected', 'true');

    await user.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: 'Dashboard' }),
    );

    expect(group('System')).toHaveAttribute('aria-expanded', 'false');
    expect(group('System')).not.toHaveAttribute('data-selected');
    expect(
      within(screen.getByRole('navigation')).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('data-selected', 'true');
  });

  it('selects the main item holding the page, and only MARKS the page inside it', () => {
    renderWithProviders(layout());
    const nav = screen.getByRole('navigation');

    expect(nav.querySelectorAll('[data-selected]')).toHaveLength(1);
    expect(group('Finance')).toHaveAttribute('data-selected', 'true');
    const currencies = within(nav).getByRole('link', { name: 'Currencies' });
    expect(currencies).toHaveAttribute('aria-current', 'page');
    expect(currencies).not.toHaveAttribute('data-selected');
  });

  it('moves the selection off the page’s own main item when another is opened', async () => {
    const user = userEvent.setup();
    renderWithProviders(layout());

    await user.click(group('Security'));

    expect(group('Security')).toHaveAttribute('data-selected', 'true');
    expect(group('Finance')).not.toHaveAttribute('data-selected');
  });

  it('gives Dashboard the same selected look as every other main item', () => {
    // It was a SOLID fill while every other selection was a tint (reported).
    route.pathname = '/dashboard';
    const { unmount } = renderWithProviders(layout());
    const dashboardLook = within(screen.getByRole('navigation')).getByRole('link', {
      name: 'Dashboard',
    }).className;
    unmount();

    route.pathname = '/currencies';
    renderWithProviders(layout());
    const financeLook = group('Finance').className;

    for (const token of ['bg-primary/10', 'font-semibold', 'text-foreground']) {
      expect(dashboardLook.split(/\s+/)).toContain(token);
      expect(financeLook.split(/\s+/)).toContain(token);
    }
    expect(dashboardLook.split(/\s+/)).not.toContain('bg-primary');
  });

  it('marks the page as current, and never the group around it', () => {
    renderWithProviders(layout());

    const nav = screen.getByRole('navigation');
    const current = nav.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Currencies');
    expect(group('Finance')).not.toHaveAttribute('aria-current');
  });

  it('shows a closed group the work waiting inside it, and an open one none', () => {
    badges.current = { '/kyc': 4, '/approvals/deposits': 2, '/transactions': 3 };
    renderWithProviders(layout());

    // Clients is closed: its header carries the KYC count.
    expect(within(group('Clients')).getByText('4')).toBeInTheDocument();
    // Finance is open: the desks carry their own counts, and the header none.
    expect(within(group('Finance')).queryByText('5')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: /deposits/i })).getByText('2'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: /withdrawals/i })).getByText('3'),
    ).toBeInTheDocument();
  });

  it('lets the closed-group total count only what this admin can see', () => {
    // A deposits desk alone, with a withdrawal count that must not leak into
    // Finance's total through the group.
    useAdmin.mockReturnValue({
      admin: { ...MASTER, permissions: ['deposits.view', 'kyc.view'] },
      isLoading: false,
      logout: vi.fn(),
    });
    route.pathname = '/kyc';
    badges.current = { '/approvals/deposits': 2, '/transactions': 3 };
    renderWithProviders(layout());

    expect(within(group('Finance')).getByText('2')).toBeInTheDocument();
    expect(within(group('Finance')).queryByText('5')).not.toBeInTheDocument();
  });

  it('turns each group into a menu on the collapsed rail', async () => {
    const user = userEvent.setup();
    badges.current = { '/approvals/deposits': 2 };
    renderWithProviders(layout());

    await user.click(screen.getByRole('button', { name: /collapse the sidebar/i }));

    // No accordion on the rail: a named trigger per group, and no sub-page rows.
    // The dot on the icon is decorative, so the waiting count is in the NAME.
    const trigger = screen.getByRole('button', { name: 'Finance, 2 waiting' });
    expect(trigger).not.toHaveAttribute('aria-controls', 'nav-group-finance');
    expect(screen.queryByRole('link', { name: /deposits/i })).not.toBeInTheDocument();

    trigger.focus();
    await user.keyboard('{Enter}');

    const deposits = await screen.findByRole('menuitem', { name: /deposits/i });
    expect(deposits).toHaveAttribute('href', '/approvals/deposits');
    expect(within(deposits).getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Currencies' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('remembers the collapsed rail across a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(layout());
    await user.click(screen.getByRole('button', { name: /collapse the sidebar/i }));
    unmount();

    renderWithProviders(layout());
    expect(screen.getByRole('button', { name: /expand the sidebar/i })).toBeInTheDocument();
    // A rail group is a MENU trigger, not a panel toggle.
    expect(screen.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
  });

  it('opens the rail’s menus towards the page when the console is right-to-left', async () => {
    const user = userEvent.setup();
    document.documentElement.dir = 'rtl';
    renderWithProviders(layout());
    await user.click(screen.getByRole('button', { name: /collapse the sidebar/i }));

    const trigger = screen.getByRole('button', { name: 'Finance' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAttribute('data-side', 'left');
    // …and reads right-to-left: Radix stamps its own `dir`, "ltr" by default.
    expect(menu).toHaveAttribute('dir', 'rtl');
  });
});

/**
 * The PHONE drawer — the same navigation, behaving as the modal it is.
 *
 * Every assertion here was false before: both of its buttons were unlabelled
 * icons, Escape did nothing, focus never entered it, and an operator who had
 * collapsed the rail at a desk got an 80px column of icons inside it.
 */
describe('the phone drawer', () => {
  const layout = () => (
    <AdminLayout>
      <p>page body</p>
    </AdminLayout>
  );

  beforeEach(() => {
    useAdmin.mockReturnValue({ admin: MASTER, isLoading: false, logout: vi.fn() });
  });

  it('opens from a named button that says what it controls', async () => {
    const user = userEvent.setup();
    renderWithProviders(layout());

    const open = screen.getByRole('button', { name: 'Open the menu' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(open).toHaveAttribute('aria-controls', 'console-sidebar');

    await user.click(open);

    expect(open).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('dialog', { name: 'Menu' });
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveAttribute('id', 'console-sidebar');
    // Focus moved INTO the drawer rather than staying behind the overlay.
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes on Escape and hands focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    renderWithProviders(layout());
    const open = screen.getByRole('button', { name: 'Open the menu' });
    await user.click(open);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(open).toHaveFocus();
  });

  it('closes from its own named Close button', async () => {
    const user = userEvent.setup();
    renderWithProviders(layout());
    await user.click(screen.getByRole('button', { name: 'Open the menu' }));

    await user.click(screen.getByRole('button', { name: 'Close the menu' }));

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('shows the full tree even when the desktop rail is collapsed', async () => {
    const user = userEvent.setup();
    renderWithProviders(layout());
    await user.click(screen.getByRole('button', { name: /collapse the sidebar/i }));
    // On the rail a group is a menu trigger…
    expect(screen.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );

    await user.click(screen.getByRole('button', { name: 'Open the menu' }));

    // …and in the drawer it is the full accordion: a toggle for its own panel.
    const drawer = screen.getByRole('dialog', { name: 'Menu' });
    const finance = within(drawer).getByRole('button', { name: /^finance/i });
    expect(finance).toHaveAttribute('aria-controls', 'nav-group-finance');
    expect(finance).toHaveAttribute('aria-expanded', 'true');
    expect(within(drawer).getByRole('link', { name: 'Currencies' })).toBeInTheDocument();
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
