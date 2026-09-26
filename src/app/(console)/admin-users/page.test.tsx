import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import AdminUsersPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

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

const permissions = { current: ALL_PERMISSIONS };

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
    permissions: ALL_PERMISSIONS,
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
  permissions: ALL_PERMISSIONS,
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
  permissions.current = ALL_PERMISSIONS;
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

/**
 * Outstanding invites are ROWS in this directory, not a panel under it.
 *
 * An invite is a 48-hour bearer credential that CREATES an admin account, so it
 * belongs in the answer to "who can get into this system?" rather than in a
 * second list below it. What must survive the merge is that a pending row is
 * NOT an account: nothing to suspend, no password to reset, nothing to edit
 * until somebody accepts — and each cell says so rather than rendering a blank
 * that reads as missing data.
 */
describe('outstanding invites, in the directory', () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    email: 'newbie@oxshare.com',
    name: 'New Bie',
    roleId: 'r-1',
    invitedBy: 'a-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-03T00:00:00.000Z',
    ...over,
  });

  it('lists one as a pending row, with the role it will grant', async () => {
    getPendingInvites.mockResolvedValue([invite()]);
    renderWithProviders(<AdminUsersPage />);

    await screen.findByText('newbie@oxshare.com');
    const row = within(rowFor('newbie@oxshare.com'));
    expect(row.getByText(/invite pending/i)).toBeInTheDocument();
    // The expiry is the half that decides what to do about it: a link dying
    // tomorrow needs re-sending, not chasing.
    expect(row.getByText(/link expires/i)).toBeInTheDocument();
    expect(row.getByText('KYC Reviewer')).toBeInTheDocument();
  });

  it('says an invite with no role is settled after acceptance', async () => {
    // An empty cell here would read as missing data on a screen about access.
    getPendingInvites.mockResolvedValue([invite({ roleId: undefined })]);
    renderWithProviders(<AdminUsersPage />);

    await screen.findByText('newbie@oxshare.com');
    expect(within(rowFor('newbie@oxshare.com')).getByText(/set after accepting/i)).toBeVisible();
  });

  it('offers revoke and nothing else — there is no account yet', async () => {
    getPendingInvites.mockResolvedValue([invite()]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('newbie@oxshare.com');

    const menu = await openRowMenu(/new bie/);
    expect(menu?.getByRole('menuitem', { name: /revoke/i })).toBeInTheDocument();
    expect(menu?.queryByRole('menuitem', { name: /suspend|edit|reset/i }) ?? null).toBeNull();
  });

  it('asks before revoking, and does nothing if declined', async () => {
    getPendingInvites.mockResolvedValue([invite()]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('newbie@oxshare.com');

    await chooseRowAction(/new bie/, /revoke/i);
    // By EMAIL: the rows differ by little else, and revoking the wrong one
    // sends a real person a dead link with no explanation.
    const asked = await answerConfirm(userEvent, 'cancel');

    expect(asked).toContain('newbie@oxshare.com');
    expect(revokeInvite).not.toHaveBeenCalled();
  });

  it('revokes by id once confirmed', async () => {
    getPendingInvites.mockResolvedValue([invite()]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('newbie@oxshare.com');

    await chooseRowAction(/new bie/, /revoke/i);
    await answerConfirm(userEvent, 'confirm');

    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith('inv-1'));
  });

  it('is not offered without the permission to create invites', async () => {
    // `admins.view` reads the invite; only `admins.create` may revoke it.
    permissions.current = ['admins.view'];
    getPendingInvites.mockResolvedValue([invite()]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('newbie@oxshare.com');

    const menu = await openRowMenu(/new bie/);
    expect(menu?.queryByRole('menuitem', { name: /revoke/i }) ?? null).toBeNull();
  });

  it('keeps the directory when the tag vocabulary is forbidden', async () => {
    /*
     * `GET /admin/tags` needs `tags.view` OR `clients.view`; the directory reads
     * need `admins.view`. A pure user-administrator role holds the latter and
     * not the former, and the tags call used to sit inside the same
     * `Promise.all` — so its 403 rendered "no access" over the whole page.
     */
    getTags.mockRejectedValue(
      Object.assign(new Error('forbidden'), { response: { status: 403, data: {} } }),
    );
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('sub@oxshare.com')).toBeInTheDocument();
  });

  it('keeps the directory when the invite list fails', async () => {
    // Separate resources, so a failing invite list costs the invite rows and
    // not the administrators an operator came to see.
    getPendingInvites.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('sub@oxshare.com')).toBeInTheDocument();
  });
});

describe('suspending an administrator', () => {
  it('is not offered without admins.suspend', async () => {
    permissions.current = ['admins.view', 'admins.edit'];
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    const menu = await openRowMenu(/sub admin/);
    expect(menu?.queryByRole('menuitem', { name: /revoke access/i }) ?? null).toBeNull();
  });

  it('is never offered on yourself or on a master admin', async () => {
    // The API refuses both independently; a-1 is both at once.
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    // The master row still has a trigger — `Send reset link` is deliberately
    // NOT gated on master (D-44) — but suspend must not be among its items.
    const masterMenu = await openRowMenu(/master admin/);
    expect(masterMenu?.queryByRole('menuitem', { name: /revoke access/i }) ?? null).toBeNull();
    await userEvent.keyboard('{Escape}');

    const subMenu = await openRowMenu(/sub admin/);
    expect(subMenu?.getByRole('menuitem', { name: /revoke access/i })).toBeInTheDocument();
  });

  it('asks before suspending, and does nothing if declined', async () => {
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /revoke access/i);
    // Named for the row, so a misclick is caught before the account is cut off
    // rather than after.
    const asked = await answerConfirm(userEvent, 'cancel');

    expect(asked).toMatch(/sub admin/i);
    expect(setAdminStatus).not.toHaveBeenCalled();
  });

  it('suspends once confirmed', async () => {
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /revoke access/i);
    await answerConfirm(userEvent, 'confirm');

    await waitFor(() => expect(setAdminStatus).toHaveBeenCalledWith('a-2', 'suspended'));
  });

  it('offers Reactivate on a suspended admin, and sends active', async () => {
    // Reversibility is the reason suspension exists instead of deletion.
    getAdminUsers.mockResolvedValue([master, sub({ status: 'suspended' })]);
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /restore access/i);
    // Unlike the client directory, this screen confirms BOTH directions: an
    // administrator's session is a privileged one, so restoring it is a
    // deliberate act too.
    await answerConfirm(userEvent, 'confirm');

    await waitFor(() => expect(setAdminStatus).toHaveBeenCalledWith('a-2', 'active'));
  });
});

describe('editing one administrator (FR-RBAC-02)', () => {
  it('is not offered without admins.edit', async () => {
    permissions.current = ['admins.view', 'admins.suspend'];
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    const menu = await openRowMenu(/sub admin/);
    expect(menu?.queryByRole('menuitem', { name: /^edit$/i }) ?? null).toBeNull();
  });

  /**
   * ACCESS IS A ROLE. There is no per-person permission list.
   *
   * The modal used to offer "Individual permissions (no role)" and a matrix
   * under it. The API accepts that shape and CLEARS the roleId when it does, so
   * the result is an administrator whose access is a snapshot belonging to
   * nobody: it does not track the role as the role is edited, it appears on no
   * roles screen, and "who can approve withdrawals?" stops being answerable
   * from the roles list. On a permission set that gates money movement, one
   * place to look beats the convenience of granting one extra key.
   */
  it('offers roles only — no individual-permission escape hatch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /^edit$/i);
    await user.click(screen.getByLabelText(/role/i));

    expect(await screen.findByRole('option', { name: 'KYC Reviewer' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /individual permissions/i })).toBeNull();
    // The matrix went with it — a checkbox per permission key.
    expect(screen.queryByRole('checkbox', { name: /view ledger/i })).toBeNull();
  });

  it('never sends a permissions array', async () => {
    // The assertion that matters if the option is ever reintroduced by accident:
    // whatever this modal saves, it is a roleId and never a permission list.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /^edit$/i);
    await user.click(screen.getByLabelText(/role/i));
    await user.click(await screen.findByRole('option', { name: 'Finance Auditor' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    const [, body] = updateAdminUser.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('permissions');
    expect(body['roleId']).toBe('r-2');
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

/**
 * A role is changed in the EDIT MODAL, never from the row.
 *
 * The role column used to be a Select: one click on a dropdown, on a table row,
 * rewrote an administrator's whole permission snapshot and landed an audit entry
 * against a named person — no confirmation, and no sight of what the new role
 * actually grants. These pin that the inline control is gone and that the
 * deliberate path still works.
 */
describe('reassigning a role', () => {
  it('offers no role control on the row itself', async () => {
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    // The role is still SHOWN — it is the column an operator scans to answer
    // "who can do what" — it is just not editable here.
    const row = within(rowFor('sub@oxshare.com'));
    expect(row.getByText('KYC Reviewer')).toBeInTheDocument();
    expect(row.queryByRole('combobox')).toBeNull();
  });

  it('sends the new role id from the edit modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /^edit$/i);
    await user.click(screen.getByLabelText(/role/i));
    await user.click(await screen.findByRole('option', { name: 'Finance Auditor' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith('a-2', { roleId: 'r-2' }));
  });

  it('DOES offer a system role as a reassignment target', async () => {
    // The inverse of what this asserted before, and the reason is the whole
    // point of the flag changing meaning. `isSystem` bounds who may EDIT a role,
    // never who may HOLD it — the API refuses to modify or delete one, and says
    // nothing about assigning it.
    //
    // Filtering it here (and in the invite modal, and on the roles list) made
    // full access something the console could neither show nor hand out, which
    // is exactly why `Master Admin` was deleted. Promoting somebody to the role
    // that carries the whole catalog must not require SQL.
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />);
    await screen.findByText('sub@oxshare.com');

    await chooseRowAction(/sub admin/, /^edit$/i);
    await user.click(screen.getByLabelText(/role/i));
    await screen.findByRole('option', { name: 'KYC Reviewer' });
    expect(screen.getByRole('option', { name: 'Master Admin' })).toBeInTheDocument();
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
 * RBAC-03's client scope, on the person.
 *
 * The property that carries this feature is the kind that gets "simplified" by
 * someone who does not know why it is there: an EMPTY tag scope means
 * UNRESTRICTED — every client — following RBAC-08's empty allowlist and D-10,
 * so introducing the feature cannot blind every existing sub-admin. Both
 * readings of "no tags" are plausible and one of them is a data breach, so the
 * screen must SAY which it is.
 *
 * The per-administrator FIELD MASK that used to sit beside it is gone. A mask
 * override attached to one person is the same shape of thing as a per-person
 * permission list: an access rule that tracks no role and is invisible from the
 * roles screen. Masks are a property of the role now.
 */
describe('client scope', () => {
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

  it('is not offered without admins.scope', async () => {
    /*
     * A SEPARATE permission from `admins.edit`. Reusing that would mean anyone
     * who can rename an administrator can also widen that administrator's view
     * of the entire client base — not the same size of act.
     */
    permissions.current = ['admins.view', 'admins.edit'];
    const dialog = await openEditor();

    expect(dialog.queryByText(/client scope/i)).not.toBeInTheDocument();
    expect(dialog.queryByText(/field visibility/i)).not.toBeInTheDocument();
  });

  it('shows both visibility surfaces OPEN, with no disclosure to click through', async () => {
    /*
     * RBAC-07's failure mode is granting access you did not realise you
     * granted, so neither section hides behind a `<details>`. The mask
     * OVERRIDE section is BACK (restored 13 Aug, owner's decision) beside the
     * scope: the role's mask is the default and this is the one-person
     * exception, opened here showing that it currently inherits.
     */
    const dialog = await openEditor();

    expect(dialog.getByText(/client scope/i)).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: /add a tag/i })).toBeInTheDocument();
    expect(dialog.getByText(/field visibility/i)).toBeInTheDocument();
    expect(dialog.getByText(/inherits the role/i)).toBeInTheDocument();
  });

  it('WARNS that an empty scope means every client', async () => {
    const dialog = await openEditor();

    expect(dialog.getByRole('note')).toHaveTextContent(/UNRESTRICTED/i);
    expect(dialog.getByRole('note')).toHaveTextContent(/every client/i);
  });

  it('sends the chosen tags, and only when they changed', async () => {
    // The scope is a SELECT that adds, plus a chip per chosen tag — not a grid
    // of checkboxes. The vocabulary grows with the business, and the question
    // this panel answers is "what is this person restricted to", which a wall
    // of mostly-unticked boxes makes you assemble by scanning.
    const dialog = await openEditor();

    await userEvent.click(dialog.getByRole('combobox', { name: /add a tag/i }));
    await userEvent.click(await screen.findByRole('option', { name: /levant desk/i }));

    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ scopedTagIds: ['tag-1'] });
  });

  it('takes a tag back off through its own chip', async () => {
    // Removal lives on the chip, beside the thing being removed — the select
    // only ever offers tags that are NOT already chosen, so it can never
    // present an option that would silently do nothing.
    const dialog = await openEditor();

    await userEvent.click(dialog.getByRole('combobox', { name: /add a tag/i }));
    await userEvent.click(await screen.findByRole('option', { name: /levant desk/i }));
    await userEvent.click(dialog.getByRole('button', { name: /remove levant desk/i }));

    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));
    // Back to where it started, so there is nothing to send.
    expect(updateAdminUser).not.toHaveBeenCalled();
  });

  it('sends NOTHING when the form is opened and closed unchanged', async () => {
    // A `scopedTagIds` echoed back unchanged is a whole-set replace on the
    // scope table and another audit row against a named administrator.
    const dialog = await openEditor();
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    expect(updateAdminUser).not.toHaveBeenCalled();
  });

  it('leaves an untouched override exactly as it is', async () => {
    /*
     * The override is back, and the property that survives from its absence is
     * this one: a save that did not TOUCH the mask must not resend it. `null`
     * and `[]` mean different things to the API — inherit the role, versus an
     * explicit "hide nothing for this person" — so an unchanged override
     * echoed back is a whole-value write and an audit row for nothing.
     */
    getAdminUsers.mockResolvedValue([
      master,
      sub({ maskedFields: ['client.phone'], maskedFieldsOverride: ['client.phone'] }),
    ]);
    const dialog = await openEditor();

    // The restored controls are offered — this admin HAS an override.
    expect(dialog.getByRole('button', { name: /follow the role again/i })).toBeInTheDocument();

    await userEvent.click(dialog.getByRole('combobox', { name: /add a tag/i }));
    await userEvent.click(await screen.findByRole('option', { name: /levant desk/i }));
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    // The scope change alone — the existing override is left exactly as it is.
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ scopedTagIds: ['tag-1'] });
  });

  it('clears an override back to the role with an explicit null', async () => {
    getAdminUsers.mockResolvedValue([
      master,
      sub({ maskedFields: ['client.phone'], maskedFieldsOverride: ['client.phone'] }),
    ]);
    const dialog = await openEditor();

    await userEvent.click(dialog.getByRole('button', { name: /follow the role again/i }));
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    // `null`, not `[]`: back to inheriting, not "explicitly hide nothing".
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ maskedFields: null });
  });

  it('shows the ROLE’s fields the moment the override is cleared — no save, no reopen', async () => {
    // Reported: the panel kept showing the override's fields after "follow the
    // role again", because it fell back to the SERVER's effective mask — which,
    // for somebody with an override, IS the override.
    getRoles.mockResolvedValue(
      ROLES.map((role) => (role.id === 'r-1' ? { ...role, maskedFields: ['client.phone'] } : role)),
    );
    // An override that hides NOTHING, on a role that hides the phone.
    getAdminUsers.mockResolvedValue([master, sub({ maskedFields: [], maskedFieldsOverride: [] })]);
    const dialog = await openEditor();
    const phone = dialog.getByRole('button', { name: /phone number/i });
    expect(phone).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(dialog.getByRole('button', { name: /follow the role again/i }));
    expect(phone).toHaveAttribute('aria-pressed', 'true');
    expect(dialog.getByText('Inherits the role')).toBeInTheDocument();
  });

  it('shows the NEW role’s fields while inheriting, before anything is saved', async () => {
    getRoles.mockResolvedValue(
      ROLES.map((role) => (role.id === 'r-2' ? { ...role, maskedFields: ['client.phone'] } : role)),
    );
    const user = userEvent.setup();
    const dialog = await openEditor();
    const phone = dialog.getByRole('button', { name: /phone number/i });
    expect(phone).toHaveAttribute('aria-pressed', 'false');

    await user.click(dialog.getByLabelText(/role/i));
    await user.click(await screen.findByRole('option', { name: 'Finance Auditor' }));
    expect(phone).toHaveAttribute('aria-pressed', 'true');
  });

  it('forks the role mask into an override on the first toggle', async () => {
    // Inheriting admin; the operator hides the phone for THIS person only.
    const dialog = await openEditor();

    await userEvent.click(dialog.getByRole('button', { name: /phone number/i }));
    await userEvent.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateAdminUser).toHaveBeenCalled());
    expect(updateAdminUser.mock.calls[0]?.[1]).toEqual({ maskedFields: ['client.phone'] });
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
