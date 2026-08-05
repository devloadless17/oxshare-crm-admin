import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AdminUsersPage from './page';

/**
 * FR-RBAC-07 — the directory, and who may do what to whom.
 *
 * The single most important assertion in this file is that a SUSPENDED
 * administrator renders as suspended. This table used to draw a hardcoded
 * "Active" pill on every row, because the API carried no status field at all —
 * so the one screen an operator checks before trusting an account told them
 * everyone was fine. Suspension was enforced the whole time; only the screen
 * lied, which is the worse half of that bug.
 *
 * Everything else here is the same shape: a control is offered exactly when the
 * API will accept it. Offering one that always 403s (self, master admin, missing
 * permission) teaches operators that errors are normal, which is how a real one
 * gets ignored.
 */

const {
  getRoles,
  getAdminUsers,
  getPermissions,
  updateAdminUser,
  setAdminStatus,
  getPendingInvites,
  revokeInvite,
} = vi.hoisted(() => ({
  getRoles: vi.fn(),
  getAdminUsers: vi.fn(),
  getPermissions: vi.fn(),
  updateAdminUser: vi.fn(),
  setAdminStatus: vi.fn(),
  getPendingInvites: vi.fn(),
  revokeInvite: vi.fn(),
}));

// Both exports — see the note in roles/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getRoles,
      getAdminUsers,
      getPermissions,
      updateAdminUser,
      setAdminStatus,
      getPendingInvites,
      revokeInvite,
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
      status: 'active',
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
    permissions: ['kyc.review'],
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

const master = {
  id: 'a-1',
  email: 'admin@oxshare.com',
  name: 'Master Admin',
  role: 'master_admin',
  status: 'active',
  permissions: ['*'],
  createdAt: '2026-08-01T00:00:00.000Z',
};

const sub = (over: Record<string, unknown> = {}) => ({
  id: 'a-2',
  email: 'sub@oxshare.com',
  name: 'Sub Admin',
  role: 'sub_admin',
  status: 'active',
  roleId: 'r-1',
  permissions: ['kyc.review'],
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

/** The <tr> for a given email, so assertions are scoped to one person. */
const rowFor = (email: string) => screen.getByText(email).closest('tr')!;

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  getRoles.mockResolvedValue(ROLES);
  getAdminUsers.mockResolvedValue([master, sub()]);
  getPermissions.mockResolvedValue({
    kyc: {
      moduleName: 'KYC',
      description: 'Compliance',
      permissions: [
        { key: 'kyc.review', label: 'Review submissions' },
        { key: 'ledger.view', label: 'View ledger' },
      ],
    },
  });
  getPendingInvites.mockResolvedValue([]);
  updateAdminUser.mockResolvedValue({});
  setAdminStatus.mockResolvedValue({});
  revokeInvite.mockResolvedValue({});
});

describe('the status column tells the truth', () => {
  it('shows a SUSPENDED admin as suspended, not as Active', async () => {
    // The regression this file exists for.
    getAdminUsers.mockResolvedValue([master, sub({ status: 'suspended' })]);
    renderWithProviders(<AdminUsersPage />);

    await screen.findByText('sub@oxshare.com');
    const row = within(rowFor('sub@oxshare.com'));
    expect(row.getByText(/suspended/i)).toBeInTheDocument();
    expect(row.queryByText(/^active$/i)).toBeNull();
  });

  it('shows an active admin as active', async () => {
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');
    expect(within(rowFor('sub@oxshare.com')).getByText(/active/i)).toBeInTheDocument();
  });
});

describe('suspending an administrator', () => {
  it('is not offered without users.suspend', async () => {
    permissions.current = ['users.view', 'users.edit'];
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    expect(screen.queryByRole('button', { name: /suspend/i })).toBeNull();
  });

  it('is never offered on yourself or on a master admin', async () => {
    // The API refuses both independently; a-1 is both at once.
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    expect(
      within(rowFor('admin@oxshare.com')).queryByRole('button', { name: /suspend/i }),
    ).toBeNull();
    expect(
      within(rowFor('sub@oxshare.com')).getByRole('button', { name: /suspend/i }),
    ).toBeInTheDocument();
  });

  it('asks before suspending, and does nothing if declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('button', { name: /suspend/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(setAdminStatus).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('suspends once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('button', { name: /suspend/i }));

    await waitFor(() => expect(setAdminStatus).toHaveBeenCalledWith('a-2', 'suspended'));
    confirmSpy.mockRestore();
  });

  it('offers Reactivate on a suspended admin, and sends active', async () => {
    // Reversibility is the reason suspension exists instead of deletion.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getAdminUsers.mockResolvedValue([master, sub({ status: 'suspended' })]);
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(
      within(rowFor('sub@oxshare.com')).getByRole('button', { name: /reactivate/i }),
    );

    await waitFor(() => expect(setAdminStatus).toHaveBeenCalledWith('a-2', 'active'));
    confirmSpy.mockRestore();
  });
});

describe('editing one administrator (FR-RBAC-02)', () => {
  it('is not offered without users.edit', async () => {
    permissions.current = ['users.view', 'users.suspend'];
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    expect(within(rowFor('sub@oxshare.com')).queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('sends INDIVIDUAL permissions, not a role id', async () => {
    // The half of RBAC-02 that had no UI: the API always accepted a direct
    // permission list, and the directory only ever sent roleId — so granting one
    // extra permission to one person meant inventing a role for them.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('button', { name: /^edit$/i }));

    // Switch from the role to individual permissions.
    await user.click(screen.getByLabelText(/access/i));
    await user.click(await screen.findByRole('option', { name: /individual permissions/i }));

    // Grant one the admin does not currently hold.
    await user.click(await screen.findByRole('button', { name: /view ledger/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    const [, body] = updateAdminUser.mock.calls[0] as [string, Record<string, unknown>];
    expect(body['permissions']).toEqual(expect.arrayContaining(['kyc.review', 'ledger.view']));
    // roleId and permissions are EXCLUSIVE on the API; sending both is incoherent.
    expect(body).not.toHaveProperty('roleId');
  });

  it('sends nothing at all when nothing was changed', async () => {
    // Re-sending an unchanged roleId still rewrites the permission snapshot and
    // lands another audit entry against a named administrator.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await new Promise((r) => setTimeout(r, 50));
    expect(updateAdminUser).not.toHaveBeenCalled();
  });
});

describe('reassigning a role from the table', () => {
  it('sends the new role id when a different role is chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Finance Auditor' }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith('a-2', { roleId: 'r-2' }));
  });

  it('sends NOTHING when reassigned to the role already held', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'KYC Reviewer' }));

    await new Promise((r) => setTimeout(r, 50));
    expect(updateAdminUser).not.toHaveBeenCalled();
  });

  it('does not offer a SYSTEM role as a reassignment target', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await user.click(within(rowFor('sub@oxshare.com')).getByRole('combobox'));
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

    expect((await screen.findAllByRole('button', { name: /retry/i })).length).toBeGreaterThan(0);
  });
});
