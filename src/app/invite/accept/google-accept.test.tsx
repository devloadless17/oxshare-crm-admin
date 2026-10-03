import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { API_BASE_URL } from '@/lib/env';
import AcceptInvitePage from './page';

/**
 * "Accept with Google" beside the password form: the invite token goes to the
 * API (which keeps it in a signed cookie, never sending it to Google), and the
 * invite-mode refusals come back here as `?google_error=`.
 */

const { validateInvite, acceptInvite, googleStatus } = vi.hoisted(() => ({
  validateInvite: vi.fn(),
  acceptInvite: vi.fn(),
  googleStatus: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { validateInvite, acceptInvite }, auth: { googleStatus } };
  return { api, default: api };
});

const searchParams = { current: new URLSearchParams('token=good-token') };
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams('token=good-token');
  validateInvite.mockResolvedValue({ email: 'new@oxshare.com', name: 'New', role: 'sub_admin' });
  googleStatus.mockResolvedValue({ enabled: true });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('Accept with Google', () => {
  it('offers Google beside the password form and starts the flow with the invite', async () => {
    renderWithProviders(<AcceptInvitePage />);
    const button = await screen.findByRole('button', { name: /accept with google/i });
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    await userEvent.click(button);
    expect(assign).toHaveBeenCalledWith(
      `${API_BASE_URL}/admin/auth/google/start?invite=good-token`,
    );
  });

  it('is not offered when Google sign-in is off', async () => {
    googleStatus.mockResolvedValue({ enabled: false });
    renderWithProviders(<AcceptInvitePage />);
    await screen.findByLabelText(/new password/i);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /accept with google/i })).not.toBeInTheDocument();
  });

  it('explains an invite-mode refusal and keeps both options', async () => {
    searchParams.current = new URLSearchParams(
      'token=good-token&google_error=invite_email_mismatch',
    );
    renderWithProviders(<AcceptInvitePage />);
    expect(
      await screen.findByText(/does not match the address this invite was sent to/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /accept with google/i })).toBeInTheDocument();
  });
});
