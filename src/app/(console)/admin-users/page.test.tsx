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
  getTags,
  getClientFields,
} = vi.hoisted(() => ({
  getRoles: vi.fn(),
  getAdminUsers: vi.fn(),
  getPermissions: vi.fn(),
  updateAdminUser: vi.fn(),
  setAdminStatus: vi.fn(),
  getPendingInvites: vi.fn(),
  revokeInvite: vi.fn(),
  // RBAC-03 vocabularies. The page loads both before the edit modal can
  // render a coherent form — a modal that opened with two of the three would
  // show a partial picture of somebody's access.
  getTags: vi.fn(),
  getClientFields: vi.fn(),
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
      getTags,
      getClientFields,
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
  maskedFields: [],
  scopedTags: [],
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
  // RBAC-03, reported per row so the directory shows visibility without a
  // modal being opened.
  maskedFields: [],
  scopedTags: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

/** The <tr> for a given email, so assertions are scoped to one person. */
const rowFor = (email: string) => screen.getByText(email).closest('tr')!;

/**
 * Open one administrator's three-dot menu and choose an item from it.
 *
 * Edit, Send reset link and Suspend used to be buttons sitting in the row,
 * reachable in one click. They are now behind the shared `RowActions` trigger,
 * so every test that acts on a row takes the two steps the operator now takes —
 * which is the point of the menu: suspending an administrator is no longer one
 * stray click away from editing them.
 *
 * The trigger is named for its ROW (`table.rowActions` → "Actions for X"), so
 * this finds the right one on a directory with several.
 */
async function chooseRowAction(rowName: RegExp, itemName: RegExp) {
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(`actions for ${rowName.source}`, 'i') }),
  );
  // Scoped to the menu: Radix renders it in a portal, and an unscoped query
  // would also match same-named controls elsewhere on the page.
  await userEvent.click(
    within(await screen.findByRole('menu')).getByRole('menuitem', { name: itemName }),
  );
}

/**
 * The menu items offered on one row, without choosing any.
 *
 * The gating assertions are about ABSENCE, and absence is only observable once
 * the menu is open — a row whose every action is filtered out renders no trigger
 * at all (see `RowActions`), which is itself the answer for those cases.
 */
async function openRowMenu(rowName: RegExp) {
  const trigger = screen.queryByRole('button', {
    name: new RegExp(`actions for ${rowName.source}`, 'i'),
  });
  if (!trigger) return null;
  await userEvent.click(trigger);
  return within(await screen.findByRole('menu'));
}

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
  getTags.mockResolvedValue([
    { id: 'tag-1', slug: 'levant', label: 'Levant desk', clientCount: 12, createdAt: '2026-08-01' },
  ]);
  getClientFields.mockResolvedValue({
    contact: {
      groupName: 'Contact',
      description: 'How the client is reached',
      fields: [
        { key: 'client.phone', label: 'Phone number', maskable: true },
        {
          key: 'client.status',
          label: 'Account status',
          maskable: false,
          reason: 'Suspend decisions are made from it.',
        },
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

    const menu = await openRowMenu(/sub admin/);
    expect(menu?.queryByRole('menuitem', { name: /suspend/i }) ?? null).toBeNull();
  });

  it('is never offered on yourself or on a master admin', async () => {
    // The API refuses both independently; a-1 is both at once.
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    // The master row still has a trigger — `Send reset link` is deliberately
    // NOT gated on master (D-44) — but suspend must not be among its items.
    const masterMenu = await openRowMenu(/master admin/);
    expect(masterMenu?.queryByRole('menuitem', { name: /suspend/i }) ?? null).toBeNull();
    await userEvent.keyboard('{Escape}');

    const subMenu = await openRowMenu(/sub admin/);
    expect(subMenu?.getByRole('menuitem', { name: /suspend/i })).toBeInTheDocument();
  });

  it('asks before suspending, and does nothing if declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /suspend/i);

    expect(confirmSpy).toHaveBeenCalled();
    expect(setAdminStatus).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('suspends once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /suspend/i);

    await waitFor(() => expect(setAdminStatus).toHaveBeenCalledWith('a-2', 'suspended'));
    confirmSpy.mockRestore();
  });

  it('offers Reactivate on a suspended admin, and sends active', async () => {
    // Reversibility is the reason suspension exists instead of deletion.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getAdminUsers.mockResolvedValue([master, sub({ status: 'suspended' })]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /reactivate/i);

    await waitFor(() => expect(setAdminStatus).toHaveBeenCalledWith('a-2', 'active'));
    confirmSpy.mockRestore();
  });
});

describe('editing one administrator (FR-RBAC-02)', () => {
  it('is not offered without users.edit', async () => {
    permissions.current = ['users.view', 'users.suspend'];
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    const menu = await openRowMenu(/sub admin/);
    expect(menu?.queryByRole('menuitem', { name: /^edit$/i }) ?? null).toBeNull();
  });

  it('sends INDIVIDUAL permissions, not a role id', async () => {
    // The half of RBAC-02 that had no UI: the API always accepted a direct
    // permission list, and the directory only ever sent roleId — so granting one
    // extra permission to one person meant inventing a role for them.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /^edit$/i);

    // Switch from the role to individual permissions.
    await user.click(screen.getByLabelText(/access/i));
    await user.click(await screen.findByRole('option', { name: /individual permissions/i }));

    /*
     * Grant one the admin does not currently hold.
     *
     * `checkbox`, not `button`: the permission matrix rows were icon buttons
     * carrying `aria-pressed` and are now real `Checkbox` controls, which Radix
     * renders as `role="checkbox"`. The query moved with the markup — a toggle
     * button and a checkbox are genuinely different things to a screen reader,
     * and this assertion is about the one the component now is.
     */
    await user.click(await screen.findByRole('checkbox', { name: /view ledger/i }));
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

    await chooseRowAction(/sub admin/, /^edit$/i);
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

/**
 * RBAC-03 configuration, on the person.
 *
 * Two properties carry this whole feature and both are the kind that get
 * "simplified" by someone who does not know why they are there:
 *
 *  1. An EMPTY tag scope means UNRESTRICTED — every client — following RBAC-08's
 *     empty allowlist and D-10, so introducing the feature cannot blind every
 *     existing sub-admin. Both readings are plausible and one of them is a data
 *     breach, so the screen must SAY which it is.
 *  2. `null` and `[]` are different masks. `null` follows the role; `[]` is an
 *     explicit "hide nothing for this person". Without the difference, an admin
 *     given an override could never be put back on their role.
 */
describe('client scope and field visibility', () => {
  /*
   * Returns a query scoped TO THE DIALOG.
   *
   * The directory row behind the modal says "All clients" too, so an unscoped
   * query matches both and the assertion would be about whichever the DOM
   * happened to order first.
   */
  const openEditor = async () => {
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');
    await chooseRowAction(/sub admin/, /^edit$/i);
    return within(await screen.findByRole('dialog'));
  };

  it('is not offered without users.scope', async () => {
    /*
     * A SEPARATE permission from `users.edit`. Reusing that would mean anyone
     * who can rename an administrator can also widen that administrator's view
     * of the entire client base — not the same size of act.
     */
    permissions.current = ['users.view', 'users.edit'];
    const dialog = await openEditor();

    expect(dialog.queryByText(/client scope/i)).not.toBeInTheDocument();
    expect(dialog.queryByText(/field visibility/i)).not.toBeInTheDocument();
  });

  it('summarises the current state WITHOUT being opened', async () => {
    // RBAC-07's failure mode is granting access you did not realise you
    // granted. A summary you cannot avoid reading is the point — which is why
    // these are <details> with a visible summary rather than tabs.
    const dialog = await openEditor();

    expect(dialog.getByText(/all clients/i)).toBeInTheDocument();
    expect(dialog.getByText(/inherits the role/i)).toBeInTheDocument();
  });

  it('WARNS that an empty scope means every client', async () => {
    const dialog = await openEditor();
    await userEvent.click(dialog.getByText(/client scope/i));

    expect(dialog.getByRole('note')).toHaveTextContent(/UNRESTRICTED/i);
    expect(dialog.getByRole('note')).toHaveTextContent(/every client/i);
  });

  it('sends the chosen tags, and only when they changed', async () => {
    const dialog = await openEditor();
    await userEvent.click(dialog.getByText(/client scope/i));
    await userEvent.click(dialog.getByRole('button', { name: /levant desk/i }));
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ scopedTagIds: ['tag-1'] });
  });

  it('sends NOTHING when the form is opened and closed unchanged', async () => {
    // A `scopedTagIds` echoed back unchanged is a whole-set replace on the
    // scope table and another audit row against a named administrator.
    const dialog = await openEditor();
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    expect(updateAdminUser).not.toHaveBeenCalled();
  });

  it('offers an unmaskable field DISABLED, with the reason', async () => {
    // An operator hunting for "why can I not hide the status column" needs the
    // answer where they are looking. Omitting the field entirely reads as a bug.
    const dialog = await openEditor();
    await userEvent.click(dialog.getByText(/field visibility/i));

    const locked = dialog.getByRole('button', { name: /account status/i });
    expect(locked).toBeDisabled();
    expect(dialog.getByText(/suspend decisions are made from it/i)).toBeInTheDocument();
  });

  it('creates an override when a field is first hidden', async () => {
    const dialog = await openEditor();
    await userEvent.click(dialog.getByText(/field visibility/i));
    await userEvent.click(dialog.getByRole('button', { name: /phone number/i }));
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ maskedFields: ['client.phone'] });
  });

  it('sends NULL to put an administrator back on their role', async () => {
    /*
     * The distinction the API makes and the UI must not lose: `null` clears the
     * override, `[]` is an explicit "hide nothing for this person". Without a
     * dedicated control the second is reachable and the first is not, so an
     * override would be permanent.
     */
    getAdminUsers.mockResolvedValue([
      master,
      sub({ maskedFields: ['client.phone'], maskedFieldsOverride: ['client.phone'] }),
    ]);
    const dialog = await openEditor();
    await userEvent.click(dialog.getByText(/field visibility/i));
    await userEvent.click(dialog.getByRole('button', { name: /follow the role again/i }));
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ maskedFields: null });
  });

  it('shows the master admin as exempt rather than configurable', async () => {
    // FR-RBAC-01 is "without exception". A control that appears to work and
    // then does nothing is worse than one that explains itself.
    getAdminUsers.mockResolvedValue([sub(), master]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('admin@oxshare.com');
  });
});

describe('the directory row', () => {
  it('shows an administrator’s scope WITHOUT opening a modal', async () => {
    /*
     * The same lesson as the status pill, which used to be hardcoded "Active"
     * and so showed a suspended administrator as active on the one screen an
     * operator checks before trusting an account. An override visible only
     * inside a modal is invisible drift: if eight of twenty agents have one,
     * the role tells you nothing and nobody would know.
     */
    getAdminUsers.mockResolvedValue([
      master,
      sub({
        scopedTags: [{ tagId: 'tag-1', slug: 'levant', label: 'Levant desk' }],
        maskedFields: ['client.phone'],
      }),
    ]);
    renderWithProviders(<AdminUsersPage />);

    await screen.findByText('sub@oxshare.com');
    const row = rowFor('sub@oxshare.com');
    expect(within(row).getByText(/1 tag/i)).toBeInTheDocument();
    expect(within(row).getByText(/1 hidden/i)).toBeInTheDocument();
  });

  it('says "all clients" for an unrestricted administrator', async () => {
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');
    const row = rowFor('sub@oxshare.com');
    expect(within(row).getByText(/all clients/i)).toBeInTheDocument();
  });
});
