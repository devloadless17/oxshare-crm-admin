import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
/*
 * POSIX `join`, deliberately. Every path this file derives is compared with
 * forward-slash literals (route prefixes, frozen lists, `src/app/...` keys),
 * and the platform `join` hands back BACKSLASHES on Windows — which turned this
 * census into a wall of false failures on every developer machine while CI, on
 * Linux, stayed green. `readdirSync` accepts forward slashes on every platform.
 */
import { join } from 'node:path/posix';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/test/permissions';
import {
  activeNavHref,
  groupBadgeTotal,
  groupOf,
  isNavGroup,
  leafHref,
  NAV,
  navLeaves,
  visibleNav,
  type NavGroup,
} from './navigation';

const base: AdminProfile = {
  id: 's1',
  email: 'sub@oxshare.com',
  name: 'Sub',
  role: 'sub_admin',
  seesUntriaged: false,
  permissions: [],
  status: 'active',
  maskedFields: [],
  scopedTags: [],
  createdAt: '2026-08-02T00:00:00.000Z',
};
const withPerms = (permissions: string[]): AdminProfile => ({ ...base, permissions });

const HREFS = navLeaves().map((leaf) => leaf.href);
const GROUPS = NAV.filter(isNavGroup);

/**
 * Every console route, DERIVED from the file system — the same walk the route
 * census makes — so a page added tomorrow is checked here without anyone
 * remembering to list it.
 */
function consoleRoutes(root = 'src/app'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...consoleRoutes(path));
    else if (entry.name === 'page.tsx' && path.includes('(console)')) {
      found.push(
        path
          .replace(/^src\/app/, '')
          .replace(/\/page\.tsx$/, '')
          .replace(/\/\([^)]+\)/g, '')
          .replace(/\/\[[^\]]+\]/g, '/:param'),
      );
    }
  }
  return found.sort();
}

/**
 * Pages that are reached from somewhere OTHER than the sidebar, each for a
 * reason. `/profile` is the operator's own account, opened from the account
 * menu in the header — a sidebar entry for it would be a second door to the
 * same room, placed among pages about the business.
 */
const OFF_NAV = ['/profile'];

describe('the navigation tree names only real, reachable pages', () => {
  it('finds the console screens, so the checks below cannot pass vacuously', () => {
    expect(consoleRoutes().length).toBeGreaterThanOrEqual(25);
    expect(HREFS.length).toBeGreaterThanOrEqual(25);
  });

  it('points every leaf at a page that exists', () => {
    const routes = new Set(consoleRoutes());
    const missing = HREFS.filter((href) => !routes.has(href));
    expect(missing, `No page.tsx behind these nav entries:\n${missing.join('\n')}`).toEqual([]);
  });

  it('lets a full-permission admin open every leaf', () => {
    /*
     * A leaf with no entry in ROUTE_REQUIREMENTS is denied to EVERYONE, a master
     * admin included — it would render the "no access" panel instead of itself.
     */
    const admin = withPerms(ALL_PERMISSIONS);
    const denied = HREFS.filter((href) => !canAccess(admin, href));
    expect(denied).toEqual([]);
  });

  it('leaves no console page unreachable from the sidebar', () => {
    /*
     * The failure this pins happened: `/commissions` was commented out of the
     * nav and stayed reachable only by typing its URL. A nested screen counts as
     * reachable through the page it sits under — a client's profile is opened
     * from the client list — which is exactly what `activeNavHref` resolves.
     */
    const orphaned = consoleRoutes()
      .filter((route) => !OFF_NAV.includes(route))
      .filter((route) => activeNavHref(route.replace(/:param/g, 'x'), HREFS) === null);
    expect(
      orphaned,
      `These console pages have no way in from the sidebar:\n${orphaned.join('\n')}`,
    ).toEqual([]);
  });

  it('names each page once', () => {
    expect(new Set(HREFS).size).toBe(HREFS.length);
  });

  it('gives every group a unique id and at least one page', () => {
    const ids = GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of GROUPS) expect(group.items.length).toBeGreaterThan(0);
  });

  it('keeps the query on the link, never on the route', () => {
    // `usePathname()` carries no query string, so an href with one could never
    // be the active page, and its badge lookup would miss.
    for (const href of HREFS) expect(href).not.toContain('?');
    const kyc = navLeaves().find((leaf) => leaf.href === '/kyc');
    expect(kyc && leafHref(kyc)).toBe('/kyc?status=needs_review');
  });
});

describe('where the client asked things to live', () => {
  it('puts the KYC builder under System, and the review queue under Clients', () => {
    expect(groupOf('/kyc/builder')?.id).toBe('system');
    expect(groupOf('/kyc')?.id).toBe('clients');
  });

  it('puts admin users, roles and payment methods under System', () => {
    // The owner's call (25 Sep 2026), after seeing the first grouping.
    expect(groupOf('/admin-users')?.id).toBe('system');
    expect(groupOf('/roles')?.id).toBe('system');
    expect(groupOf('/payment-methods')?.id).toBe('system');
    // What stays under Security.
    expect(groupOf('/api-keys')?.id).toBe('security');
    expect(groupOf('/audit-log')?.id).toBe('security');
  });

  it('files each money desk under Finance and the partner queue under Introducing brokers', () => {
    expect(groupOf('/approvals/deposits')?.id).toBe('finance');
    expect(groupOf('/transactions')?.id).toBe('finance');
    expect(groupOf('/approvals/ib')?.id).toBe('introducing-brokers');
  });

  it('keeps Dashboard alone at the top, outside every group', () => {
    const [first] = NAV;
    expect(first && !isNavGroup(first) && first.href).toBe('/dashboard');
    expect(groupOf('/dashboard')).toBeNull();
  });
});

describe('visibleNav', () => {
  it('shows nothing until we know who is asking', () => {
    expect(visibleNav(null)).toEqual([]);
  });

  it('drops the pages an admin cannot open, and a group left with none', () => {
    // `kyc.review` opens the queue but not the builder, which needs `kyc.edit`.
    const visible = visibleNav(withPerms(['kyc.review']));

    expect(visible.map((entry) => (isNavGroup(entry) ? entry.id : entry.href))).toEqual([
      '/dashboard',
      'clients',
    ]);
    const clients = visible.find(isNavGroup);
    expect(clients?.items.map((item) => item.href)).toEqual(['/kyc']);
  });

  it('shows a full-permission admin every group', () => {
    const visible = visibleNav(withPerms(ALL_PERMISSIONS));
    expect(visible.filter(isNavGroup).map((group) => group.id)).toEqual(GROUPS.map((g) => g.id));
  });
});

describe('groupBadgeTotal', () => {
  const finance = GROUPS.find((group) => group.id === 'finance') as NavGroup;

  it('adds up the work waiting anywhere in the group', () => {
    expect(groupBadgeTotal(finance, { '/approvals/deposits': 2, '/transactions': 3 })).toBe(5);
  });

  it('ignores counts that belong to other groups', () => {
    expect(groupBadgeTotal(finance, { '/kyc': 7 })).toBeUndefined();
  });

  it('draws nothing for zero', () => {
    // A red 0 beside a cleared queue is an alarm about the absence of work.
    expect(groupBadgeTotal(finance, {})).toBeUndefined();
    expect(groupBadgeTotal(finance, { '/transactions': 0 })).toBeUndefined();
  });

  it('counts only the pages this admin can see', () => {
    // The caller passes the `visibleNav` copy; a hidden desk's count must not
    // leak into the total through the group.
    const depositsOnly = {
      ...finance,
      items: finance.items.filter((i) => i.href !== '/transactions'),
    };
    expect(groupBadgeTotal(depositsOnly, { '/approvals/deposits': 2, '/transactions': 3 })).toBe(2);
  });
});

/**
 * Exactly one sidebar entry is the current page.
 *
 * `/kyc/builder` lit up BOTH "KYC review" and the builder, because each item
 * tested itself in isolation with
 * `pathname === href || pathname.startsWith(href + '/')` — true for the prefix
 * `/kyc` and for the exact `/kyc/builder` at the same time.
 *
 * Nested routes are normal here, not an edge case: `/kyc` and `/kyc/builder` are
 * different screens behind different permissions, and since the regrouping they
 * sit in different GROUPS. So the rule compares candidates against each other,
 * and these assert that it does.
 */
describe('activeNavHref', () => {
  const SAMPLE = ['/dashboard', '/clients', '/kyc', '/kyc/builder', '/roles', '/audit-log'];

  it('picks the NESTED route, not its parent', () => {
    // The reported bug, stated directly.
    expect(activeNavHref('/kyc/builder', SAMPLE)).toBe('/kyc/builder');
  });

  it('picks the parent when the nested route is not the page', () => {
    // A submission detail lives under /kyc and has no nav entry of its own, so
    // the parent is correctly the active one.
    expect(activeNavHref('/kyc', SAMPLE)).toBe('/kyc');
    expect(activeNavHref('/kyc/some-user-id', SAMPLE)).toBe('/kyc');
  });

  it('returns exactly ONE href for every route in the nav', () => {
    // Asserted over the whole set rather than one path, so a future nested
    // route cannot quietly reintroduce it.
    for (const path of [...SAMPLE, '/kyc/abc', '/clients/123']) {
      const active = activeNavHref(path, SAMPLE);
      expect(SAMPLE.filter((h) => h === active)).toHaveLength(1);
    }
  });

  it('does not match a sibling that merely shares a prefix', () => {
    // '/kyc-archive' is not inside '/kyc'. String prefixes alone would say it is.
    expect(activeNavHref('/kyc-archive', SAMPLE)).toBeNull();
  });

  it('highlights nothing on a route that is not in the nav', () => {
    expect(activeNavHref('/login', SAMPLE)).toBeNull();
  });

  it('survives a null pathname', () => {
    expect(activeNavHref(null, SAMPLE)).toBeNull();
  });

  it('opens the right group for the nested screens of the real tree', () => {
    const groupFor = (path: string) => groupOf(activeNavHref(path, HREFS))?.id;
    expect(groupFor('/kyc/builder')).toBe('system');
    expect(groupFor('/kyc/1000245')).toBe('clients');
    expect(groupFor('/clients/1000245')).toBe('clients');
    expect(groupFor('/roles/new')).toBe('system');
    expect(groupFor('/roles/abc/edit')).toBe('system');
    expect(groupFor('/api-keys/new')).toBe('security');
  });
});
