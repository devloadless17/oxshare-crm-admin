import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import { PendingInvitesPanel } from './pending-invites-panel';

/**
 * Outstanding invites — the "sent but not arrived" list.
 *
 * An invite is a 48-hour bearer credential that CREATES AN ADMIN ACCOUNT on a
 * system that approves payouts, and until this panel existed it vanished the
 * moment it was sent: the directory lists accepted admins only, so there was no
 * way to see one and no way to cancel one that went to the wrong address.
 *
 * Two properties are pinned here. An empty list must SAY it is empty — a blank
 * table reads as a failed load, and "no invites outstanding" is a real answer an
 * operator acts on. And the list must never carry the token: it is a screen for
 * deciding, not a second delivery channel for a credential that belongs in one
 * mailbox.
 */

const { getPendingInvites, revokeInvite } = vi.hoisted(() => ({
  getPendingInvites: vi.fn(),
  revokeInvite: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getPendingInvites, revokeInvite } };
  return { api, default: api };
});

const invite = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  email: 'newbie@oxshare.com',
  name: 'New Bie',
  roleId: 'r-1',
  invitedBy: 'a-1',
  createdAt: '2026-08-05T09:00:00.000Z',
  expiresAt: '2026-08-07T09:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getPendingInvites.mockResolvedValue([invite()]);
  revokeInvite.mockResolvedValue({ message: 'ok' });
});

describe('what the panel shows', () => {
  it('lists an invite that has been sent and not accepted', async () => {
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    expect(await screen.findByText('newbie@oxshare.com')).toBeInTheDocument();
    expect(screen.getByText('New Bie')).toBeInTheDocument();
  });

  it('shows when the link dies, so a stale invite is recognisable', async () => {
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    await screen.findByText('newbie@oxshare.com');

    // The exact string the panel renders, not a loose year match — both the
    // sent-on and expires-at columns are in 2026, so /2026/ finds two nodes and
    // reports an ambiguity that reads like a rendering bug.
    const expiry = new Date('2026-08-07T09:00:00.000Z').toLocaleString();
    expect(screen.getByText(expiry)).toBeInTheDocument();
  });

  it('SAYS the list is empty rather than drawing an empty table', async () => {
    getPendingInvites.mockResolvedValue([]);
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    expect(await screen.findByText(/no outstanding invites/i)).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    // Not an empty state: "we could not read it" and "there are none" are
    // different answers, and only one of them means no action is needed.
    getPendingInvites.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no outstanding invites/i)).toBeNull();
  });
});

/**
 * Open a row's three-dot menu and choose an item from it.
 *
 * Revoke used to be a button sitting in the row, reachable in one click. It is
 * now behind the shared `RowActions` trigger, so a test that acts on a row takes
 * the two steps the operator now takes. The trigger is named for its ROW
 * (`table.rowActions` → "Actions for X"), so this finds the right one on a table
 * with several.
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

describe('revoking', () => {
  it('is not offered without the permission to create invites', async () => {
    renderWithProviders(<PendingInvitesPanel canRevoke={false} />);
    await screen.findByText('newbie@oxshare.com');
    // The whole actions column is withheld, so there is no trigger to open.
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
  });

  it('asks before revoking, and does nothing if declined', async () => {
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    await screen.findByText('newbie@oxshare.com');

    await chooseRowAction(/new bie/, /revoke/i);
    // By EMAIL: the invite rows differ by little else, and revoking the wrong
    // one sends a person a dead link with no explanation.
    const asked = await answerConfirm(userEvent, 'cancel');

    expect(asked).toContain('newbie@oxshare.com');
    expect(revokeInvite).not.toHaveBeenCalled();
  });

  it('revokes by id once confirmed', async () => {
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    await screen.findByText('newbie@oxshare.com');

    await chooseRowAction(/new bie/, /revoke/i);
    await answerConfirm(userEvent, 'confirm');

    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith('inv-1'));
  });

  it('surfaces a failed revoke instead of pretending it worked', async () => {
    revokeInvite.mockRejectedValue(
      Object.assign(new Error('nope'), {
        response: { status: 400, data: { message: 'This invite has already been accepted.' } },
      }),
    );
    renderWithProviders(<PendingInvitesPanel canRevoke />);
    await screen.findByText('newbie@oxshare.com');

    await chooseRowAction(/new bie/, /revoke/i);
    await answerConfirm(userEvent, 'confirm');

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been accepted/i);
  });
});
