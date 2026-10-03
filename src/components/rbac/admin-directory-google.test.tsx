import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { AdminUser } from '@/lib/api/admin';
import { AdminDirectoryTable, type DirectoryCapabilities } from './admin-directory-table';

/**
 * The directory marks administrators who sign in with Google and, for an
 * operator holding `admins.reset`, offers "Unlink Google" — never on the
 * operator's own row (that is the profile screen's) and never on a row with
 * nothing linked.
 */

const user = (over: Partial<AdminUser>): AdminUser => ({
  id: 'x',
  email: 'x@oxshare.com',
  name: 'X',
  role: 'sub_admin',
  status: 'active',
  permissions: ['kyc.review'],
  maskedFields: [],
  scopedTags: [],
  seesUntriaged: false,
  seesAllClients: true,
  googleEmail: null,
  googleLinkedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const linked = user({
  id: 'g',
  name: 'Grace',
  email: 'grace@bbcorp.trade',
  googleEmail: 'grace@bbcorp.trade',
  googleLinkedAt: '2026-10-01T00:00:00Z',
});
const plain = user({ id: 'p', name: 'Paul', email: 'paul@oxshare.com' });
const me = user({
  id: 'me',
  name: 'Me',
  googleEmail: 'me@bbcorp.trade',
  permissions: ['admins.reset', 'kyc.review'],
});

function renderTable(can: Partial<DirectoryCapabilities>, onUnlinkGoogle = vi.fn()) {
  renderWithProviders(
    <AdminDirectoryTable
      admins={[linked, plain, me]}
      invites={[]}
      roles={[]}
      currentAdminId="me"
      viewerPermissions={me.permissions}
      can={{
        canEdit: false,
        canSuspend: false,
        canResetPassword: false,
        canRevokeInvite: false,
        ...can,
      }}
      suspendingId={null}
      revokingId={null}
      onEdit={vi.fn()}
      onResetPassword={vi.fn()}
      onUnlinkGoogle={onUnlinkGoogle}
      onToggleStatus={vi.fn()}
      onRevokeInvite={vi.fn()}
    />,
  );
  return onUnlinkGoogle;
}

async function menuOf(name: string) {
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }),
  );
  return within(await screen.findByRole('menu'));
}

describe('Google on the administrator directory', () => {
  it('marks linked administrators with a Google indicator', () => {
    renderTable({});
    expect(screen.getByTitle('Signs in with Google as grace@bbcorp.trade')).toBeInTheDocument();
    expect(screen.queryByTitle(/paul@oxshare.com/)).not.toBeInTheDocument();
  });

  it('offers Unlink Google on a linked row to admins.reset holders', async () => {
    const onUnlink = renderTable({ canResetPassword: true });
    const menu = await menuOf('Grace');
    await userEvent.click(menu.getByRole('menuitem', { name: /unlink google/i }));
    expect(onUnlink).toHaveBeenCalledWith(linked);
  });

  it('does not offer it on a row with nothing linked', async () => {
    renderTable({ canResetPassword: true });
    const menu = await menuOf('Paul');
    expect(menu.queryByRole('menuitem', { name: /unlink google/i })).not.toBeInTheDocument();
  });

  it('does not offer it without admins.reset', () => {
    renderTable({ canEdit: true });
    expect(screen.queryByRole('menuitem', { name: /unlink google/i })).not.toBeInTheDocument();
  });
});
