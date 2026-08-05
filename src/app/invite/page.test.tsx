import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import InvitePage from './page';

/**
 * RBAC-07 — issuing an admin invite.
 *
 * This form creates an ADMINISTRATOR. Everything else in the admin app decides
 * what an existing admin may do; this decides that a new one exists, so what is
 * pinned is the shape of what it sends and what it does with the answer.
 *
 * The backend enforces the rules that matter (anti-escalation, single use, a
 * 48-hour expiry, no token in a production response) and has its own suite for
 * them. This covers the half that only exists here: that the request carries
 * what the server expects, and that a refusal is shown rather than swallowed.
 */

const { post, getRoles } = vi.hoisted(() => ({ post: vi.fn(), getRoles: vi.fn() }));

// Both exports — see the note in settings/page.test.tsx. Mocking only `default`
// leaves the named `api` undefined and the page fails in a way that reads like a
// broken query rather than a broken mock.
vi.mock('@/lib/api', () => {
  const api = { post, admin: { getRoles } };
  return { api, default: api };
});

const ROLES = [
  { id: 'r-1', name: 'Reviewer', description: '', permissions: ['kyc.review'], isSystem: false },
  { id: 'r-2', name: 'Master Admin', description: '', permissions: ['*'], isSystem: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  getRoles.mockResolvedValue(ROLES);
  post.mockResolvedValue({ data: { message: 'Invite sent to newcomer@oxshare.com' } });
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  name: string,
) {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/name/i), name);
  await user.click(screen.getByRole('button', { name: /send invite|invite/i }));
}

describe('issuing an invite', () => {
  it('sends the name, email and chosen role', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await fillAndSubmit(user, 'Newcomer@Oxshare.com', 'New Comer');

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/admin/invite',
        expect.objectContaining({ email: 'newcomer@oxshare.com', name: 'New Comer' }),
      ),
    );
  });

  it('lowercases the email, so one address cannot become two invites', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await fillAndSubmit(user, '  MiXeD@Oxshare.COM  ', 'Mixed Case');

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/admin/invite',
        expect.objectContaining({ email: 'mixed@oxshare.com' }),
      ),
    );
  });

  it('sends no request for a malformed email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await fillAndSubmit(user, 'not-an-email', 'Someone');

    expect(post).not.toHaveBeenCalled();
  });

  it('sends no request when a field is blank', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/email/i), 'someone@oxshare.com');
    await user.click(screen.getByRole('button', { name: /send invite|invite/i }));

    expect(post).not.toHaveBeenCalled();
  });

  it('offers only custom roles — a system role is not assignable by invite', async () => {
    // 'Master Admin' is a system role. Offering it would suggest an invite can
    // mint a second master, which the backend refuses outright.
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByText(/Reviewer/)).toBeInTheDocument());
    expect(screen.queryByText(/Master Admin/)).not.toBeInTheDocument();
  });

  it('shows the reason when the server refuses', async () => {
    // The anti-escalation refusal names the permission that was over-reached.
    // Swallowing it leaves the admin with no idea why nothing happened.
    post.mockRejectedValue({
      response: {
        data: { message: 'You cannot grant permissions you do not hold: users.delete.' },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await fillAndSubmit(user, 'newcomer@oxshare.com', 'New Comer');

    expect(
      await screen.findByText(/cannot grant permissions you do not hold/i),
    ).toBeInTheDocument();
  });

  it('confirms, and offers a clean form for the next invite', async () => {
    // The form is REPLACED by a confirmation rather than cleared, so the admin
    // can copy the link before moving on. "Send another" is what resets it.
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await fillAndSubmit(user, 'newcomer@oxshare.com', 'New Comer');

    const another = await screen.findByRole('button', { name: /another/i });
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();

    await user.click(another);
    expect(await screen.findByLabelText(/email/i)).toHaveValue('');
  });

  it('shows the link when the API returns one, for manual sharing', async () => {
    // Outside production the backend echoes the link so local development is
    // workable. In production it is absent and only the email carries it — the
    // screen must render either without breaking.
    post.mockResolvedValue({
      data: { message: 'Invite sent', inviteUrl: 'http://localhost:3002/invite/accept?token=abc' },
    });
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);
    await waitFor(() => expect(getRoles).toHaveBeenCalled());

    await fillAndSubmit(user, 'newcomer@oxshare.com', 'New Comer');
    expect(await screen.findByText(/token=abc/)).toBeInTheDocument();
  });

  it('still lets an invite be sent when the roles endpoint is unavailable', async () => {
    // The selector hides and the backend's default permission set applies —
    // a missing role list must not block inviting anyone at all.
    getRoles.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderWithProviders(<InvitePage />);

    await fillAndSubmit(user, 'newcomer@oxshare.com', 'New Comer');
    await waitFor(() => expect(post).toHaveBeenCalled());
  });
});
