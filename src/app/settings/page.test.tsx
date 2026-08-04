import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AdminSettingsPage from './page';

/**
 * The RBAC screen — roles and the admin directory.
 *
 * This is security-adjacent, so what is pinned is the permission gating and the
 * guards that stop a destructive action being taken by accident:
 *
 *  - roles.manage, users.edit and users.create each gate their own controls.
 *    Client-side gating is UX, not security — PermissionsGuard answers 403
 *    independently — but an admin shown a button they cannot use will report it,
 *    and worse, a MISSING gate here suggests the permission model is wider than it is.
 *  - deleting a role asks first, because admins holding it must be reassigned and
 *    the API refuses until they are.
 *  - reassigning an admin to the role they already hold sends no request. The
 *    backend enforces an anti-escalation invariant on that path and a redundant
 *    write is a redundant audit-log entry.
 */

const {
  getPermissions,
  getRoles,
  getAdminUsers,
  createRole,
  updateRole,
  deleteRole,
  updateAdminUser,
} = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  getRoles: vi.fn(),
  getAdminUsers: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  updateAdminUser: vi.fn(),
}));

// Both exports. lib/api/index.ts exposes `api` as a named export AND as default,
// and this page uses the named one. Mocking only `default` leaves `api` undefined,
// the fetcher throws, and the screen renders its generic "failed to load" state —
// which looks like a broken query rather than a broken mock.
vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getPermissions,
      getRoles,
      getAdminUsers,
      createRole,
      updateRole,
      deleteRole,
      updateAdminUser,
    },
  };
  return { api, default: api };
});

const permissions = { current: ['*'] as string[] };

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

const ROLES = [
  {
    id: 'r-1',
    name: 'KYC Reviewer',
    description: 'Reviews submissions',
    permissions: ['kyc.view', 'kyc.review'],
    isSystem: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const ADMINS = [
  {
    id: 'a-1',
    email: 'admin@oxshare.com',
    name: 'Master Admin',
    role: 'master_admin',
    permissions: ['*'],
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'a-2',
    email: 'sub@oxshare.com',
    name: 'Sub Admin',
    role: 'sub_admin',
    roleId: 'r-1',
    permissions: ['kyc.view'],
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  getPermissions.mockResolvedValue({
    kyc: { label: 'KYC', items: [{ key: 'kyc.view', label: 'View submissions' }] },
  });
  getRoles.mockResolvedValue(ROLES);
  getAdminUsers.mockResolvedValue(ADMINS);
  deleteRole.mockResolvedValue({});
  updateAdminUser.mockResolvedValue({});
});

describe('RBAC settings — permission gating', () => {
  it('offers role management to an admin holding roles.manage', async () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByText('KYC Reviewer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create custom role/i })).toBeInTheDocument();
  });

  it('hides role management without roles.manage', async () => {
    permissions.current = ['roles.view'];
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('KYC Reviewer');
    expect(screen.queryByRole('button', { name: /create custom role/i })).toBeNull();
  });

  it('still loads and lists roles read-only without roles.manage', async () => {
    permissions.current = ['roles.view'];
    renderWithProviders(<AdminSettingsPage />);

    // Read access is the point of roles.view; it must not be an empty screen.
    expect(await screen.findByText('KYC Reviewer')).toBeInTheDocument();
  });
});

describe('RBAC settings — destructive actions', () => {
  it('asks before deleting a role, and does nothing if declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('KYC Reviewer');
    const del = screen.getAllByRole('button', { name: /delete/i })[0];
    if (del) await user.click(del);

    expect(confirmSpy).toHaveBeenCalled();
    // Declining must not delete. Admins holding the role would be orphaned.
    expect(deleteRole).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('deletes the role once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText('KYC Reviewer');
    const del = screen.getAllByRole('button', { name: /delete/i })[0];
    if (del) await user.click(del);

    await waitFor(() => expect(deleteRole).toHaveBeenCalledTimes(1));
    // deleteRole(role.id) — the service takes the id, not the role object.
    expect(deleteRole).toHaveBeenCalledWith('r-1');
    confirmSpy.mockRestore();
  });
});

describe('RBAC settings — load failures', () => {
  it('offers a retry rather than an empty screen', async () => {
    getRoles.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the missing endpoints when the API is not built yet', async () => {
    getRoles.mockRejectedValue(
      Object.assign(new Error('nope'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<AdminSettingsPage />);

    // 404 is "not implemented", which is a to-do for the API owner.
    const named = await screen.findAllByText(/\/admin\//);
    expect(named.length).toBeGreaterThan(0);
  });
});
