import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AdminUsersPage from './page';

/**
 * Who holds which role.
 *
 * The directory itself is a table; what matters is who may change a row, and
 * which changes are refused before they are ever sent:
 *
 *  - users.edit gates reassignment. The API refuses self-changes and changes to
 *    a master admin regardless, so those rows must not offer a control that is
 *    guaranteed to fail.
 *  - reassigning an admin to the role they already hold sends NO request. The
 *    backend enforces an anti-escalation invariant on that path, and a redundant
 *    write is a redundant audit-log entry against a named administrator.
 *  - system roles are not assignable — offering one produces a 403.
 */

const { getRoles, getAdminUsers, updateAdminUser } = vi.hoisted(() => ({
  getRoles: vi.fn(),
  getAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
}));

// Both exports — see the note in roles/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getRoles, getAdminUsers, updateAdminUser } };
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
    permissions: ['kyc.view'],
    isSystem: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'r-2',
    name: 'Finance Auditor',
    description: 'Reads the ledger',
    permissions: ['ledger.view'],
    isSystem: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'r-sys',
    name: 'Master Admin',
    description: 'Everything',
    permissions: ['*'],
    isSystem: true,
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
  getRoles.mockResolvedValue(ROLES);
  getAdminUsers.mockResolvedValue(ADMINS);
  updateAdminUser.mockResolvedValue({});
});

describe('the directory', () => {
  it('lists each administrator with the role they hold', async () => {
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('sub@oxshare.com')).toBeInTheDocument();
    expect(screen.getByText('admin@oxshare.com')).toBeInTheDocument();
  });

  it('marks the signed-in administrator as themselves', async () => {
    renderWithProviders(<AdminUsersPage />);
    expect(await screen.findByText(/\(you\)/i)).toBeInTheDocument();
  });
});

describe('who may reassign a role', () => {
  it('offers no role control at all without users.edit', async () => {
    permissions.current = ['users.view'];
    renderWithProviders(<AdminUsersPage />);

    await screen.findByText('sub@oxshare.com');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('never offers reassignment on the signed-in admin or a master admin', async () => {
    // Row a-1 is both. The API refuses each case independently; offering the
    // control anyway produces a 403 the operator cannot act on.
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    // Only the sub-admin row (a-2) is reassignable, so exactly one control.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('sends the new role id when a DIFFERENT role is chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    // a-2 holds r-1, so r-2 is the only choice that is an actual change.
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Finance Auditor' }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith('a-2', { roleId: 'r-2' }));
  });

  it('sends NOTHING when reassigned to the role already held', async () => {
    // The backend enforces an anti-escalation invariant on this path, and every
    // write lands in the audit log against a named administrator. A no-op that
    // still round-trips leaves a trail of changes that never happened.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'KYC Reviewer' }));

    // Give the mutation a chance to fire before asserting it did not.
    await new Promise((r) => setTimeout(r, 50));
    expect(updateAdminUser).not.toHaveBeenCalled();
  });

  it('does not offer a SYSTEM role as a reassignment target', async () => {
    // Assigning one is refused by the API — master_admin is not a role that can
    // be handed out through the directory.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(screen.getByRole('combobox'));
    await screen.findByRole('option', { name: 'KYC Reviewer' });
    expect(screen.queryByRole('option', { name: 'Master Admin' })).toBeNull();
  });
});

describe('load failures', () => {
  it('offers a retry rather than an empty directory', async () => {
    getAdminUsers.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the missing endpoints when the API is not built yet', async () => {
    getAdminUsers.mockRejectedValue(
      Object.assign(new Error('nope'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<AdminUsersPage />);

    const named = await screen.findAllByText(/\/admin\//);
    expect(named.length).toBeGreaterThan(0);
  });
});
