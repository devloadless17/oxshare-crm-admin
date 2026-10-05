import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AcceptInvitePage from './page';

/**
 * RBAC-07 — accepting an invite, which is where an admin account comes into
 * existence and its password is chosen.
 *
 * The property that matters most here is one of MESSAGING, not validation: an
 * invalid token and an invalid password must not look the same. An earlier
 * version wrote the token failure into the same error box the password form
 * uses, so a recipient with an expired link was told to fix their password and
 * could retype it forever.
 */

const { validateInvite, acceptInvite, totpSetup, totpVerify } = vi.hoisted(() => ({
  validateInvite: vi.fn(),
  acceptInvite: vi.fn(),
  totpSetup: vi.fn(),
  totpVerify: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { validateInvite, acceptInvite }, auth: { totpSetup, totpVerify } };
  return { api, default: api };
});

const searchParams = { current: new URLSearchParams('token=good-token') };

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams('token=good-token');
  validateInvite.mockResolvedValue({
    email: 'newcomer@oxshare.com',
    name: 'New Comer',
    role: 'sub_admin',
  });
  acceptInvite.mockResolvedValue({
    message: 'Account created.',
    step: 'totp_setup',
    challengeToken: 'challenge-1',
    expiresInSeconds: 600,
  });
  totpSetup.mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    otpauthUri: 'otpauth://totp/x',
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    account: 'newcomer@oxshare.com',
    issuer: 'OxShare Admin',
  });
  totpVerify.mockResolvedValue({ admin: {} });
});

describe('validating the link', () => {
  it('validates the token from the URL before showing the form', async () => {
    renderWithProviders(<AcceptInvitePage />);
    await waitFor(() => expect(validateInvite).toHaveBeenCalledWith('good-token'));
  });

  it('greets the invitee by the name on the invite', async () => {
    renderWithProviders(<AcceptInvitePage />);
    expect(await screen.findByText(/New Comer/)).toBeInTheDocument();
  });

  it('reports an invalid or expired link as a LINK problem, not a form problem', async () => {
    // The distinction this file exists for. If it reads as a password error the
    // recipient retypes their password forever and never requests a new invite.
    validateInvite.mockRejectedValue({
      response: { data: { message: 'Invalid or expired invite token.' } },
    });
    renderWithProviders(<AcceptInvitePage />);

    // A heading of its own, not a line inside the password form.
    expect(await screen.findByRole('heading', { name: /invalid invite/i })).toBeInTheDocument();
    expect(screen.getByText(/invalid or expired invite token/i)).toBeInTheDocument();
    // And no password form is offered for a link that cannot work.
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('handles a link with no token at all', async () => {
    searchParams.current = new URLSearchParams('');
    renderWithProviders(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: /invalid invite/i })).toBeInTheDocument();
    // No token means nothing to validate — the page must not call the API at all.
    expect(validateInvite).not.toHaveBeenCalled();
    expect(acceptInvite).not.toHaveBeenCalled();
  });
});

describe('setting the password', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, pw: string, confirm: string) {
    await user.type(await screen.findByLabelText(/new password/i), pw);
    await user.type(screen.getByLabelText(/confirm/i), confirm);
    await user.click(screen.getByRole('button', { name: /activate|create|set password/i }));
  }

  it('sends the token and the chosen password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AcceptInvitePage />);

    await fill(user, 'a-good-password-123', 'a-good-password-123');

    await waitFor(() =>
      expect(acceptInvite).toHaveBeenCalledWith('good-token', 'a-good-password-123'),
    );
  });

  it('sends nothing when the two passwords differ', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AcceptInvitePage />);

    await fill(user, 'a-good-password-123', 'a-different-password');

    expect(await screen.findByText(/match/i)).toBeInTheDocument();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('sends nothing for a password under the minimum length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AcceptInvitePage />);

    await fill(user, 'short', 'short');

    expect(await screen.findByText(/8 characters/i)).toBeInTheDocument();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal rather than a generic failure', async () => {
    // "This invite has already been used" is actionable; "something went wrong"
    // is not, and this is the moment a recipient is most likely to be stuck.
    acceptInvite.mockRejectedValue({
      response: { data: { message: 'This invite has already been used.' } },
    });
    const user = userEvent.setup();
    renderWithProviders(<AcceptInvitePage />);

    await fill(user, 'a-good-password-123', 'a-good-password-123');

    expect(await screen.findByText(/already been used/i)).toBeInTheDocument();
  });

  it('does not leave the button stuck after a failure', async () => {
    // A spinner that never resolves is indistinguishable from a hung request,
    // and the recipient cannot retry.
    acceptInvite.mockRejectedValue({ response: { data: { message: 'Invite has expired.' } } });
    const user = userEvent.setup();
    renderWithProviders(<AcceptInvitePage />);

    await fill(user, 'a-good-password-123', 'a-good-password-123');
    await screen.findByText(/expired/i);

    expect(screen.getByRole('button', { name: /activate|create|set password/i })).toBeEnabled();
  });
});

describe('after accepting — the authenticator app, then the console (0191)', () => {
  const assign = vi.fn();
  const realLocation = window.location;
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, assign, pathname: '/invite/accept' },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('shows the QR code straight away and enters the console only after the code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AcceptInvitePage />);
    await user.type(await screen.findByLabelText(/new password/i), 'a-good-password-123');
    await user.type(screen.getByLabelText(/confirm/i), 'a-good-password-123');
    await user.click(screen.getByRole('button', { name: /activate|create|set password/i }));

    expect(await screen.findByText(/set up your authenticator app/i)).toBeInTheDocument();
    expect(totpSetup).toHaveBeenCalledWith('challenge-1');
    expect(await screen.findByAltText(/qr code/i)).toBeInTheDocument();
    // No console yet: the account exists, the session does not.
    expect(assign).not.toHaveBeenCalled();
    // And the spent invite's password form is gone.
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
    expect(totpVerify).toHaveBeenCalledWith('challenge-1', '123456');
  });
});
