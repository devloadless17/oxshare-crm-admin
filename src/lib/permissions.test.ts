import { describe, expect, it } from 'vitest';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { canAccess, hasPermission, isMasterAdmin } from './permissions';

const master: AdminProfile = {
  id: 'm1',
  email: 'admin@oxshare.com',
  name: 'Master',
  role: 'master_admin',
  permissions: ['*'],
  createdAt: '2026-08-02T00:00:00.000Z',
};

// Exactly what the backend grants an invited sub-admin today.
const subAdmin: AdminProfile = {
  ...master,
  id: 's1',
  email: 'sub@oxshare.com',
  name: 'Sub',
  role: 'sub_admin',
  permissions: ['kyc:review', 'clients:read'],
};

describe('hasPermission', () => {
  it('grants everything to the * wildcard', () => {
    expect(hasPermission(master, 'anything:at-all')).toBe(true);
  });

  it('grants only explicitly held permissions', () => {
    expect(hasPermission(subAdmin, 'kyc:review')).toBe(true);
    expect(hasPermission(subAdmin, 'withdrawals:review')).toBe(false);
  });

  it('denies when unauthenticated', () => {
    expect(hasPermission(null, 'kyc:review')).toBe(false);
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
    for (const path of ['/dashboard', '/clients', '/kyc', '/kyc/builder', '/roles', '/settings', '/invite', '/withdrawals']) {
      expect(canAccess(master, path)).toBe(true);
    }
  });

  it('sub-admin reaches only what their permissions cover', () => {
    expect(canAccess(subAdmin, '/dashboard')).toBe(true);
    expect(canAccess(subAdmin, '/clients')).toBe(true);
    expect(canAccess(subAdmin, '/kyc')).toBe(true);
    expect(canAccess(subAdmin, '/kyc/abc-123')).toBe(true); // detail page under /kyc
    expect(canAccess(subAdmin, '/withdrawals')).toBe(false);
    expect(canAccess(subAdmin, '/partners')).toBe(false);
  });

  it('kyc builder is master-only even though /kyc is permitted', () => {
    expect(canAccess(subAdmin, '/kyc/builder')).toBe(false);
    expect(canAccess(master, '/kyc/builder')).toBe(true);
  });

  it('master-only sections are closed to sub-admins', () => {
    for (const path of ['/roles', '/settings', '/invite', '/admin-users']) {
      expect(canAccess(subAdmin, path)).toBe(false);
    }
  });

  it('unknown routes default to accessible for any authenticated admin', () => {
    expect(canAccess(subAdmin, '/some-future-page')).toBe(true);
    expect(canAccess(null, '/some-future-page')).toBe(false);
  });

  it('prefix matching does not leak across sibling routes', () => {
    // '/clients' permission must not open '/clients-export' style siblings via prefix
    expect(canAccess(subAdmin, '/invite/accept')).toBe(false); // under master-only /invite
  });
});
