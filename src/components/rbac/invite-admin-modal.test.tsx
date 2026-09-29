import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { InviteAdminModal } from './invite-admin-modal';

/**
 * Visibility is chosen at INVITE time — the window this closes is real: an
 * empty scope means unrestricted, so an invitee configured only after
 * accepting saw every client between clicking the link and being remembered.
 *
 * The payload rules are the part worth pinning, because each has a quiet
 * failure mode:
 *  1. Untouched visibility sends NOTHING — `[]` stored as a choice would read
 *     as one that was never made, and an accidental `seesUntriaged: false`
 *     is an audit row about nothing.
 *  2. The mask INHERITS the chosen role until forked — and switching roles
 *     updates the inherited view, so the operator reads the truth of the role
 *     they picked, not of the one they picked first.
 */

// `vi.hoisted`, because the mock factory is hoisted above this line — and
// BOTH exports, per this repo's mocking note: pages and components import
// `api` as named and default interchangeably, and mocking only one leaves the
// other undefined at first use.
const { createInvite, useAdmin } = vi.hoisted(() => ({
  createInvite: vi.fn(),
  useAdmin: vi.fn(),
}));
vi.mock('@/lib/api', () => {
  const api = { admin: { createInvite } };
  return { api, default: api };
});
vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));

const ROLES = [
  {
    id: 'r1',
    name: 'Support',
    description: '',
    permissions: ['clients.view'],
    maskedFields: ['client.phone'],
    isSystem: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const TAGS = [
  {
    id: 't1',
    slug: 'levant-desk',
    label: 'Levant Desk',
    clientCount: 3,
    clientsOutsideScope: 0,
    isSystem: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const FIELD_CATALOG = {
  identity: {
    label: 'Identity',
    fields: [
      { key: 'client.email', label: 'Email address', maskable: true, reason: null },
      { key: 'client.phone', label: 'Phone number', maskable: true, reason: null },
    ],
  },
};

function renderModal(overrides: Partial<Parameters<typeof InviteAdminModal>[0]> = {}) {
  renderWithProviders(
    <InviteAdminModal
      open
      roles={ROLES}
      tags={TAGS}
      fieldCatalog={FIELD_CATALOG as never}
      canScope
      onClose={vi.fn()}
      onInvited={vi.fn()}
      {...overrides}
    />,
  );
}

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/full name/i), 'New Person');
  await userEvent.type(screen.getByLabelText(/email/i), 'new@oxshare-e2e.test');
  await userEvent.click(screen.getByRole('combobox', { name: /role/i }));
  await userEvent.click(await screen.findByRole('option', { name: /support/i }));
}

beforeEach(() => {
  createInvite.mockReset().mockResolvedValue({ inviteUrl: 'http://x/invite/accept?token=t' });
  // An unrestricted inviter by default — they CAN grant the intake pool.
  useAdmin.mockReturnValue({ admin: { scopedTags: [], seesUntriaged: true } });
});

describe('the invite modal — visibility at invite time', () => {
  it('hides both visibility sections without admins.scope', () => {
    renderModal({ canScope: false });

    expect(screen.queryByText(/client scope/i)).toBeNull();
    expect(screen.queryByText(/field visibility/i)).toBeNull();
  });

  it('starts with the intake grant CHECKED — granted by default (0058)', () => {
    renderModal();
    expect(screen.getByRole('checkbox', { name: /sees new clients/i })).toBeChecked();
  });

  it('sends NO visibility fields when none were changed — the default is not a choice', async () => {
    // Including the pre-checked intake grant: sending `true` would demand
    // `admins.scope` for a decision the operator never made.
    renderModal();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: /send invite|create/i }));

    const payload = createInvite.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty('scopedTagIds');
    expect(payload).not.toHaveProperty('seesUntriaged');
    expect(payload).not.toHaveProperty('maskedFields');
  });

  it('sends the chosen territory, and the RESTRICTION when the grant is unticked', async () => {
    renderModal();
    await fillRequired();

    await userEvent.click(screen.getByRole('combobox', { name: /add a tag/i }));
    await userEvent.click(await screen.findByRole('option', { name: /levant desk/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /sees new clients/i }));
    await userEvent.click(screen.getByRole('button', { name: /send invite|create/i }));

    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ scopedTagIds: ['t1'], seesUntriaged: false }),
    );
  });

  it('locks the grant UNCHECKED for an inviter who does not see the pool themselves', () => {
    useAdmin.mockReturnValue({
      admin: { scopedTags: [{ tagId: 't9', slug: 'other', label: 'Other' }], seesUntriaged: false },
    });
    renderModal();

    const grant = screen.getByRole('checkbox', { name: /sees new clients/i });
    expect(grant).not.toBeChecked();
    expect(grant).toBeDisabled();
    expect(screen.getByText(/cannot grant it/i)).toBeInTheDocument();
  });

  it('shows the CHOSEN role’s mask as inherited, and sends only a forked override', async () => {
    renderModal();
    await fillRequired();

    // Support masks the phone — the panel shows it ticked, inherited.
    expect(screen.getByText(/inherits the role/i)).toBeInTheDocument();
    const phone = screen.getByRole('button', { name: /phone number/i });
    expect(phone).toHaveAttribute('aria-pressed', 'true');

    // Fork: additionally hide the email for this person only.
    await userEvent.click(screen.getByRole('button', { name: /email address/i }));
    await userEvent.click(screen.getByRole('button', { name: /send invite|create/i }));

    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ maskedFields: ['client.phone', 'client.email'] }),
    );
  });
});
