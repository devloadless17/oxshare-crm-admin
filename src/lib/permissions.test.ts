import { describe, expect, it } from 'vitest';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { assertPermissionKeysExist, canAccess, hasPermission, isMasterAdmin } from './permissions';

const master: AdminProfile = {
  id: 'm1',
  email: 'admin@oxshare.com',
  name: 'Master',
  role: 'master_admin',
  permissions: ['*'],
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
    expect(hasPermission(subAdmin, 'withdrawals.view')).toBe(false);
  });

  it('treats colon and dot spellings as the same key (guard parity)', () => {
    // pre-unification token data on one side, catalog key on the other
    expect(hasPermission(subAdmin, 'kyc:review')).toBe(true);
    const legacy = { ...subAdmin, permissions: ['kyc:review'] };
    expect(hasPermission(legacy, 'kyc.review')).toBe(true);
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
      '/withdrawals',
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

  it('kyc builder needs kyc.edit even though /kyc is permitted', () => {
    expect(canAccess(subAdmin, '/kyc/builder')).toBe(false);
    expect(canAccess({ ...subAdmin, permissions: ['kyc.edit'] }, '/kyc/builder')).toBe(true);
    expect(canAccess(master, '/kyc/builder')).toBe(true);
  });

  it('management sections follow their catalog permissions', () => {
    expect(canAccess(subAdmin, '/settings')).toBe(false);
    expect(canAccess({ ...subAdmin, permissions: ['roles.view'] }, '/settings')).toBe(true);
    expect(canAccess(subAdmin, '/invite')).toBe(false); // needs users.create
    expect(canAccess({ ...subAdmin, permissions: ['users.create'] }, '/invite')).toBe(true);
  });

  it('audit log stays master-only (no catalog key advertises it)', () => {
    expect(canAccess(subAdmin, '/audit-log')).toBe(false);
    expect(
      canAccess({ ...subAdmin, permissions: ['users.view', 'roles.view'] }, '/audit-log'),
    ).toBe(false);
  });

  it('unknown routes default to accessible for any authenticated admin', () => {
    expect(canAccess(subAdmin, '/some-future-page')).toBe(true);
    expect(canAccess(null, '/some-future-page')).toBe(false);
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
    'trading.view',
    'withdrawals.view',
    'withdrawals.approve',
    'partners.view',
    'partners.manage',
    'payouts.view',
    'payouts.review',
    'ledger.view',
    'commissions.view',
    'commissions.manage',
  ];

  it('reports nothing when every referenced key is in the catalog', () => {
    expect(assertPermissionKeysExist(CATALOG)).toEqual([]);
  });

  it('names the keys the backend does not define', () => {
    const orphans = assertPermissionKeysExist(CATALOG.filter((k) => k !== 'ledger.view'));
    expect(orphans).toEqual(['ledger.view']);
  });

  it('normalizes colon-style catalog keys the same way the guard does', () => {
    expect(assertPermissionKeysExist(CATALOG.map((k) => k.replace('.', ':')))).toEqual([]);
  });
});
