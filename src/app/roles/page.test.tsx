import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import RolesPage from './page';

/**
 * /roles — one scrollable list, and a real confirmation before a delete.
 *
 * What is pinned here is the wiring the rework could get wrong:
 *
 *  - the page asks for ROLES ONLY. It used to fetch the permission catalog and
 *    the client-field catalog alongside, purely so a modal could open
 *    instantly. Those moved to /roles/new and /roles/[id]/edit, and a
 *    reinstated `Promise.all` here would be invisible on screen.
 *  - a system role gets NO action menu. The backend refuses to edit or delete
 *    one, so offering the control is offering a guaranteed failure.
 *  - delete goes through the AlertDialog and needs confirming. The old code
 *    called `window.confirm`, which jsdom does not implement — so a test could
 *    not tell a working confirmation from a missing one.
 *  - a failed delete KEEPS the dialog open. 409 "still assigned" is the common
 *    outcome, and closing on error throws away the message the operator needs.
 */

const { getRoles, deleteRole } = vi.hoisted(() => ({
  getRoles: vi.fn(),
  deleteRole: vi.fn(),
}));

// Both exports — see the note in admin/CLAUDE.md.
vi.mock('@/lib/api', () => {
  const api = { admin: { getRoles, deleteRole } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/roles',
}));

const identity = { permissions: ['*'] as string[] };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      name: 'Master Admin',
      email: 'admin@oxshare.com',
      role: 'master_admin',
      get permissions() {
        return identity.permissions;
      },
    },
  }),
}));

const SUPPORT = {
  id: 'r-1',
  name: 'Support',
  description: 'Answers tickets',
  permissions: ['users.view', 'kyc.review'],
  maskedFields: [],
  isSystem: false,
};

const SYSTEM = {
  id: 'r-0',
  name: 'Master Admin',
  description: 'Everything',
  permissions: ['*'],
  maskedFields: [],
  isSystem: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  identity.permissions = ['*'];
  getRoles.mockResolvedValue([SYSTEM, SUPPORT]);
  deleteRole.mockResolvedValue({});
});

describe('the list itself', () => {
  it('shows each role with its description and permission COUNT, not the keys', async () => {
    // The chips this replaces: a `*` role printed eighty of them, and the tile
    // heights went ragged at exactly the size where scanning matters.
    renderWithProviders(<RolesPage />);

    expect(await screen.findByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Answers tickets')).toBeInTheDocument();
    expect(screen.getByText(/assigned permissions \(2\)/i)).toBeInTheDocument();
    expect(screen.queryByText('kyc.review')).not.toBeInTheDocument();
  });

  it('fetches roles and nothing else', async () => {
    renderWithProviders(<RolesPage />);
    await screen.findByText('Support');

    expect(getRoles).toHaveBeenCalledTimes(1);
  });

  it('offers no action menu on a system role', async () => {
    renderWithProviders(<RolesPage />);
    await screen.findByText('Support');

    expect(screen.getByRole('button', { name: /actions for support/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for master admin/i })).toBeNull();
  });

  it('hides the create button and every action menu without roles.manage', async () => {
    identity.permissions = ['roles.view'];
    renderWithProviders(<RolesPage />);
    await screen.findByText('Support');

    expect(screen.queryByRole('link', { name: /create custom role/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
  });
});

describe('deleting a role', () => {
  /** Opens the row menu and picks Delete, leaving the dialog on screen. */
  async function openDeleteDialog() {
    renderWithProviders(<RolesPage />);
    await screen.findByText('Support');
    await userEvent.click(screen.getByRole('button', { name: /actions for support/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
  }

  it('asks before deleting, and does not delete on its own', async () => {
    await openDeleteDialog();

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(deleteRole).not.toHaveBeenCalled();
  });

  it('deletes once confirmed', async () => {
    await openDeleteDialog();
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith('r-1'));
  });

  it('makes no request when cancelled', async () => {
    await openDeleteDialog();
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(deleteRole).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows why when the API refuses', async () => {
    // 409: the role is still assigned. Closing here would discard the only
    // explanation the operator gets.
    deleteRole.mockRejectedValue(new Error('Role is still assigned to 3 admins.'));
    await openDeleteDialog();
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(await screen.findByText(/still assigned to 3 admins/i)).toBeInTheDocument();
  });
});
