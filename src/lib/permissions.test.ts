import { describe, expect, it } from 'vitest';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { assertPermissionKeysExist, canAccess, hasPermission, isMasterAdmin } from './permissions';

const master: AdminProfile = {
  id: 'm1',
  email: 'admin@oxshare.com',
  name: 'Master',
  role: 'master_admin',
  permissions: ['*'],
  // Required since the API started admitting it. The directory used to render a
  // hardcoded "Active" badge because AdminProfileDto had no status field at all.
  status: 'active',
  // RBAC-03. Both required since the API started reporting each admin's
  // effective visibility on the row — the directory shows it without needing a
  // modal opened.
  maskedFields: [],
  scopedTags: [],
  createdAt: '2026-08-02T00:00:00.000Z',
};

// Exactly what the backend grants an invited sub-admin by default today.
const subAdmin: AdminProfile = {
  ...master,
  id: 's1',
  email: 'sub@oxshare.com',
  name: 'Sub',
  role: 'sub_admin',
  permissions: ['kyc.review', 'users.view'],
};

describe('hasPermission', () => {
  it('grants everything to the * wildcard', () => {
    expect(hasPermission(master, 'anything.at-all')).toBe(true);
  });

  it('grants only explicitly held permissions', () => {
    expect(hasPermission(subAdmin, 'kyc.review')).toBe(true);
    expect(hasPermission(subAdmin, 'ib.view')).toBe(false);
  });

  it('matches regardless of case (guard parity)', () => {
    expect(hasPermission(subAdmin, 'KYC.Review')).toBe(true);
    const mixed = { ...subAdmin, permissions: ['KYC.Review'] };
    expect(hasPermission(mixed, 'kyc.review')).toBe(true);
  });

  it('does NOT treat the old colon spelling as the same key (guard parity)', () => {
    /*
     * This asserted the opposite until backend migration 0009.
     *
     * Four copies of `replace(/:/g, '.')` bridged two spellings of every
     * permission key — three in the backend, one here. They were generative
     * rather than redundant: the backend normalised BEFORE checking its catalog,
     * so `kyc:review` passed validation and was stored verbatim.
     *
     * Parity with the guard is the point of this test, and the guard no longer
     * accepts it. Keeping the shim on this side alone would be worse than
     * useless: the nav would show a page the API then refuses, which is exactly
     * the drift assertPermissionKeysExist exists to catch.
     */
    expect(hasPermission(subAdmin, 'kyc:review')).toBe(false);
    const legacy = { ...subAdmin, permissions: ['kyc:review'] };
    expect(hasPermission(legacy, 'kyc.review')).toBe(false);
  });

  it('denies when unauthenticated', () => {
    expect(hasPermission(null, 'kyc.review')).toBe(false);
  });
});

describe('isMasterAdmin', () => {
  it('is true only for master_admin', () => {
    expect(isMasterAdmin(master)).toBe(true);
    expect(isMasterAdmin(subAdmin)).toBe(false);
    expect(isMasterAdmin(null)).toBe(false);
  });
});

describe('canAccess', () => {
  it('master admin reaches every route', () => {
    for (const path of [
      '/dashboard',
      '/clients',
      '/kyc',
      '/kyc/builder',
      '/settings',
      '/invite',
      '/currencies',
      '/audit-log',
    ]) {
      expect(canAccess(master, path)).toBe(true);
    }
  });

  it('sub-admin reaches only what their permissions cover', () => {
    expect(canAccess(subAdmin, '/dashboard')).toBe(true);
    expect(canAccess(subAdmin, '/clients')).toBe(true); // users.view
    expect(canAccess(subAdmin, '/kyc')).toBe(true);
    expect(canAccess(subAdmin, '/kyc/abc-123')).toBe(true); // detail page under /kyc
    expect(canAccess(subAdmin, '/withdrawals')).toBe(false);
    expect(canAccess(subAdmin, '/partners')).toBe(false);
  });

  describe('the money screens', () => {
    const withPerms = (permissions: string[]): AdminProfile => ({ ...subAdmin, permissions });

    it('gates the payout queue on withdrawals.VIEW, not on the write keys', () => {
      /*
       * The route is the weaker of the three keys on purpose. An operator who
       * may settle but not approve, or who may only look, still needs the
       * screen — each button checks its own permission inside. Gating the
       * route on `withdrawals.approve` would hide the queue from the person
       * whose job is paying out of it.
       */
      expect(canAccess(withPerms(['withdrawals.view']), '/transactions')).toBe(true);
      expect(canAccess(withPerms(['withdrawals.approve']), '/transactions')).toBe(false);
      expect(canAccess(withPerms(['withdrawals.settle']), '/transactions')).toBe(false);
      expect(canAccess(subAdmin, '/transactions')).toBe(false);
    });

    it('opens the two endpoint-less screens to the same key that reads money', () => {
      // Both render BackendPending. They are declared so `canAccess` admits
      // them at all — an undeclared route is denied, and "not built yet" is
      // more useful to an operator than "no access".
      expect(canAccess(withPerms(['withdrawals.view']), '/wallets')).toBe(true);
      expect(canAccess(withPerms(['withdrawals.view']), '/trading-accounts')).toBe(true);
      expect(canAccess(subAdmin, '/wallets')).toBe(false);
      expect(canAccess(subAdmin, '/trading-accounts')).toBe(false);
    });

    it('gates payment methods on payments.view, with manage checked inside', () => {
      expect(canAccess(withPerms(['payments.view']), '/payment-methods')).toBe(true);
      // Holding only the write key does not open the screen: `payments.manage`
      // governs the controls, and the API grants the list on `payments.view`.
      expect(canAccess(withPerms(['payments.manage']), '/payment-methods')).toBe(false);
    });

    it('is reachable by the master admin', () => {
      for (const path of ['/transactions', '/wallets', '/trading-accounts', '/payment-methods']) {
        expect(canAccess(master, path)).toBe(true);
      }
    });
  });

  it('kyc builder needs kyc.edit even though /kyc is permitted', () => {
    expect(canAccess(subAdmin, '/kyc/builder')).toBe(false);
    expect(canAccess({ ...subAdmin, permissions: ['kyc.edit'] }, '/kyc/builder')).toBe(true);
    expect(canAccess(master, '/kyc/builder')).toBe(true);
  });

  it('management sections follow their catalog permissions', () => {
    expect(canAccess(subAdmin, '/roles')).toBe(false);
    expect(canAccess({ ...subAdmin, permissions: ['roles.view'] }, '/roles')).toBe(true);
    // subAdmin already holds users.view, so the directory IS open to them.
    expect(canAccess(subAdmin, '/admin-users')).toBe(true);
    expect(canAccess({ ...subAdmin, permissions: ['kyc.review'] }, '/admin-users')).toBe(false);
    expect(canAccess(subAdmin, '/invite')).toBe(false); // needs users.create
    expect(canAccess({ ...subAdmin, permissions: ['users.create'] }, '/invite')).toBe(true);
  });

  it('/settings needs roles.MANAGE, not roles.view', () => {
    // Reading roles and deciding which networks may reach the admin API are
    // different powers. Before the three-way split, /settings held roles behind
    // roles.view AND the RBAC-08 allowlist behind a tab rendered only for
    // roles.manage. Roles moved to /roles, so if /settings had kept roles.view
    // it would newly expose the trusted-network list to every read-only admin.
    expect(canAccess({ ...subAdmin, permissions: ['roles.view'] }, '/settings')).toBe(false);
    expect(canAccess({ ...subAdmin, permissions: ['roles.manage'] }, '/settings')).toBe(true);
    expect(canAccess(master, '/settings')).toBe(true);
  });

  it('audit log stays master-only (no catalog key advertises it)', () => {
    expect(canAccess(subAdmin, '/audit-log')).toBe(false);
    expect(
      canAccess({ ...subAdmin, permissions: ['users.view', 'roles.view'] }, '/audit-log'),
    ).toBe(false);
  });

  it('DENIES an undeclared route rather than defaulting it open', () => {
    /*
     * This asserted the opposite until R-4.2 was applied to the frontend: an
     * unknown route returned true, so every page added from then on was visible
     * to every authenticated admin until someone remembered to list it. Coverage
     * was complete by discipline, which a reviewer cannot verify — a route that
     * forgot its entry is indistinguishable from one that never needed one.
     *
     * `/payouts`, `/ledger`, `/commission-plans` and `/admin-users` are all
     * committed scope still to be built, so this is a live path, not a
     * hypothetical.
     */
    expect(canAccess(subAdmin, '/some-future-page')).toBe(false);
    expect(canAccess(master, '/some-future-page')).toBe(false);
    expect(canAccess(null, '/some-future-page')).toBe(false);
  });

  it('lets an explicitly unrestricted route through', () => {
    // `requirement: null` is the stated "any authenticated admin" — the
    // frontend counterpart of the backend's @AnyAdmin(reason).
    expect(canAccess(subAdmin, '/dashboard')).toBe(true);
    expect(canAccess(subAdmin, '/')).toBe(true);
    expect(canAccess(subAdmin, '/login')).toBe(true);
  });

  it('does not let the root entry shadow a gated route', () => {
    // '/' is matched exactly, never as a prefix: `startsWith('//')` is never
    // true. If it were a prefix it would make every route unrestricted.
    expect(canAccess(subAdmin, '/withdrawals')).toBe(false);
    expect(canAccess(subAdmin, '/audit-log')).toBe(false);
  });

  it('prefix matching does not leak across sibling routes', () => {
    expect(canAccess(subAdmin, '/invite/accept')).toBe(false); // under users.create-gated /invite
  });
});

describe('assertPermissionKeysExist', () => {
  // Every key the route table demands must exist in the backend catalog. A key
  // that does not exist can never be granted, so the route silently becomes
  // master-admin-only — which is exactly what happened to partners.view and
  // payouts.review before they were added to permissions.json.
  const CATALOG = [
    'kyc.review',
    'kyc.edit',
    'users.view',
    'users.create',
    'users.edit',
    'users.suspend',
    'roles.view',
    'roles.manage',
    'settings.view',
    // The money layer came back, so its keys are catalog keys again. All five
    // exist in the backend's config/permissions.json — `withdrawals.approve`
    // and `withdrawals.settle` are separate there precisely so approving and
    // paying can be granted to different people (R-5.4).
    'withdrawals.view',
    'withdrawals.approve',
    'withdrawals.settle',
    'payments.view',
    'payments.manage',
    // The IB module replaced trading/partners/payouts/commissions when the
    // commission surface was torn out.
    'ib.view',
    'ib.manage',
    'ib.approve',
    'ib.reject',
    // ADM-14. Added here the moment `/tags` gained a route requirement — a key
    // referenced by the route table and absent from the catalog is a
    // permanently unreachable page, which is the exact drift
    // `assertPermissionKeysExist` exists to catch.
    'tags.view',
  ];

  it('reports nothing when every referenced key is in the catalog', () => {
    expect(assertPermissionKeysExist(CATALOG)).toEqual([]);
  });

  it('names the keys the backend does not define', () => {
    const orphans = assertPermissionKeysExist(CATALOG.filter((k) => k !== 'settings.view'));
    expect(orphans).toEqual(['settings.view']);
  });

  it('folds case on catalog keys, the same way the guard does', () => {
    expect(assertPermissionKeysExist(CATALOG.map((k) => k.toUpperCase()))).toEqual([]);
  });

  it('reports every route key as an orphan when the catalog uses the old spelling', () => {
    // The useful failure. A backend still serving colon keys is now a real
    // mismatch rather than something this file silently absorbs — and it
    // surfaces here, in development, as the loud list assertPermissionKeysExist
    // was built to print.
    const colonCatalog = CATALOG.map((k) => k.replace('.', ':'));
    expect(assertPermissionKeysExist(colonCatalog).length).toBeGreaterThan(0);
  });
});

describe('ADM-14 — the tags screen', () => {
  const withPerms = (permissions: string[]): AdminProfile => ({ ...subAdmin, permissions });

  it('requires tags.view', () => {
    expect(canAccess(withPerms(['tags.view']), '/tags')).toBe(true);
    // `users.view` reaches the client LIST and its tag chips (the API grants
    // GET /admin/tags on either key), but not the management screen.
    expect(canAccess(withPerms(['users.view']), '/tags')).toBe(false);
  });

  it('is reachable by the master admin', () => {
    expect(canAccess(master, '/tags')).toBe(true);
  });
});

describe('ADM-01 — the client profile', () => {
  const withPerms = (permissions: string[]): AdminProfile => ({ ...subAdmin, permissions });

  it('inherits the client list requirement, via the prefix match', () => {
    // No separate entry: `/clients/<uuid>` matches the `/clients` prefix, so a
    // profile can never be reachable by someone who cannot reach the list it
    // is opened from.
    expect(
      canAccess(withPerms(['users.view']), '/clients/a3f1c2d4-0000-4000-8000-000000000001'),
    ).toBe(true);
    expect(
      canAccess(withPerms(['kyc.review']), '/clients/a3f1c2d4-0000-4000-8000-000000000001'),
    ).toBe(false);
  });
});
