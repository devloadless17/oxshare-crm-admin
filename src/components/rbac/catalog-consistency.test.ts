import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AdminProfile } from '@/context/AdminAuthContext';
import type { PermissionModule } from '@/lib/api/admin';
import { isNavGroup, visibleNav } from '@/components/layout/navigation';
import { catalogNavProblems } from './catalog-consistency';
import { modulesByGroup, setKeys, toggleKey } from './permission-rules';

/*
 * The REAL backend catalog, read from the sibling repo when it is checked out —
 * the way `check:twins` reads the portal. Skipped cleanly without it, so CI
 * never depends on a sibling directory; locally, any drift between the sidebar
 * and the catalog fails here before anybody sees it in a menu.
 */
const BACKEND = join(__dirname, '../../../../oxshare-crm-backend/src/config/permissions.json');
const catalog: Record<string, PermissionModule> | null = existsSync(BACKEND)
  ? (JSON.parse(readFileSync(BACKEND, 'utf8')) as Record<string, PermissionModule>)
  : null;

describe.skipIf(!catalog)('the sidebar and the permission catalog', () => {
  it('agree page for page — one page, one key', () => {
    expect(catalogNavProblems(catalog!)).toEqual([]);
  });

  it('give the editor a section for every catalog module, in sidebar order', () => {
    const placed = modulesByGroup(catalog!).flatMap((s) => s.modules.map(([id]) => id));
    expect(placed.sort()).toEqual(Object.keys(catalog!).sort());
  });

  it("produce the buyer's Sales menu and nothing more", () => {
    const sales = {
      permissions: [
        'clients.view',
        'trading.view',
        'ib.partners.view',
        'ib.applications.view',
        'ib.referrals.view',
        'ib.commissions.view',
      ],
    } as AdminProfile;
    const menu = Object.fromEntries(
      visibleNav(sales)
        .filter(isNavGroup)
        .map((g) => [g.id, g.items.map((i) => i.href)]),
    );
    expect(menu).toEqual({
      clients: ['/clients', '/trading-accounts'],
      'introducing-brokers': ['/partners', '/approvals/ib', '/referrals', '/commissions'],
    });
  });

  it('ticking an action brings its page; turning the page off takes the action', () => {
    const on = toggleKey(catalog!, [], 'deposits.approve');
    expect(on.next.sort()).toEqual(['deposits.approve', 'deposits.view']);

    const off = toggleKey(catalog!, on.next, 'deposits.view');
    expect(off.next).toEqual([]);
    expect(off.cleared).toEqual(['deposits.approve']);

    const none = setKeys(catalog!, ['ib.levels.view', 'ib.levels.edit'], ['ib.levels.view'], false);
    expect(none.next).toEqual([]);
  });
});
