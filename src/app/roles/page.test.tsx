import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import RolesPage from './page';

/**
 * RBAC-01/02 — what a role may do.
 *
 * Security-adjacent, so what is pinned is the permission gating and the guard
 * that stops a destructive action being taken by accident:
 *
 *  - roles.manage gates every control that writes. Client-side gating is UX, not
 *    security — PermissionsGuard answers 403 independently — but a MISSING gate
 *    here suggests the permission model is wider than it actually is.
 *  - roles.view alone must still LIST roles. Read access is the entire point of
 *    that permission; an empty screen would read as "there are no roles".
 *  - deleting a role asks first, because admins holding it must be reassigned
 *    and the API refuses until they are.
 */

const { getPermissions, getRoles, createRole, updateRole, deleteRole, getClientFields } =
  vi.hoisted(() => ({
    getPermissions: vi.fn(),
    getRoles: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    // RBAC-03: the role editor now offers field masking, so the page loads the
    // field catalog alongside the permission one. Both are VOCABULARIES the
    // frontend must not invent (R-4.5).
    getClientFields: vi.fn(),
  }));

// Both exports. lib/api/index.ts exposes `api` as a named export AND as default,
// and this page uses the named one. Mocking only `default` leaves `api` undefined,
// the fetcher throws, and the screen renders its generic "failed to load" state —
// which looks like a broken query rather than a broken mock.
vi.mock('@/lib/api', () => {
  const api = {
    admin: { getPermissions, getRoles, createRole, updateRole, deleteRole, getClientFields },
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

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  getClientFields.mockResolvedValue({});
  getPermissions.mockResolvedValue({
    kyc: { label: 'KYC', items: [{ key: 'kyc.view', label: 'View submissions' }] },
  });
  getRoles.mockResolvedValue(ROLES);
  deleteRole.mockResolvedValue({});
});

describe('roles — permission gating', () => {
  it('offers role management to an admin holding roles.manage', async () => {
    renderWithProviders(<RolesPage />);

    expect(await screen.findByText('KYC Reviewer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create custom role/i })).toBeInTheDocument();
  });

  it('hides role management without roles.manage', async () => {
    permissions.current = ['roles.view'];
    renderWithProviders(<RolesPage />);

    await screen.findByText('KYC Reviewer');
    expect(screen.queryByRole('button', { name: /create custom role/i })).toBeNull();
  });

  it('still loads and lists roles read-only without roles.manage', async () => {
    permissions.current = ['roles.view'];
    renderWithProviders(<RolesPage />);

    // Read access is the point of roles.view; it must not be an empty screen.
    expect(await screen.findByText('KYC Reviewer')).toBeInTheDocument();
  });

  it('does not offer the admin directory without users.view', async () => {
    // The cross-link is a convenience, not a bypass: an admin who cannot read
    // the directory should not be sent to a page that will refuse them.
    permissions.current = ['roles.view'];
    renderWithProviders(<RolesPage />);

    await screen.findByText('KYC Reviewer');
    expect(screen.queryByRole('link', { name: /admin users/i })).toBeNull();
  });
});

describe('roles — the page fetches only what it renders', () => {
  it('does not pull the admin directory', async () => {
    // The whole reason this page was split out of /settings. Opening it to read
    // a role used to fetch the admin list too, on a page that never showed it.
    const api = (await import('@/lib/api')).api as unknown as {
      admin: Record<string, unknown>;
    };
    renderWithProviders(<RolesPage />);
    await screen.findByText('KYC Reviewer');

    expect(api.admin['getAdminUsers']).toBeUndefined();
    expect(getRoles).toHaveBeenCalledTimes(1);
  });
});

describe('roles — destructive actions', () => {
  it('asks before deleting a role, and does nothing if declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<RolesPage />);

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
    renderWithProviders(<RolesPage />);

    await screen.findByText('KYC Reviewer');
    const del = screen.getAllByRole('button', { name: /delete/i })[0];
    if (del) await user.click(del);

    await waitFor(() => expect(deleteRole).toHaveBeenCalledTimes(1));
    // deleteRole(role.id) — the service takes the id, not the role object.
    expect(deleteRole).toHaveBeenCalledWith('r-1');
    confirmSpy.mockRestore();
  });
});

describe('roles — load failures', () => {
  it('offers a retry rather than an empty screen', async () => {
    getRoles.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<RolesPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the missing endpoints when the API is not built yet', async () => {
    getRoles.mockRejectedValue(
      Object.assign(new Error('nope'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<RolesPage />);

    // 404 is "not implemented", which is a to-do for the API owner.
    const named = await screen.findAllByText(/\/admin\//);
    expect(named.length).toBeGreaterThan(0);
  });
});
