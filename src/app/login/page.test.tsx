import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AdminLoginPage from './page';

/**
 * Signing in must leave the app knowing who signed in.
 *
 * `AdminAuthContext` holds `GET /admin/auth/me` in a React Query with
 * `retry: false` and a 5-minute staleTime. On the login screen that query has
 * already run and failed with a 401, and the failure is cached. `router.push`
 * is a client-side navigation that does not remount the provider, and
 * `router.refresh()` only re-runs Server Components — so without an explicit
 * refetch the dashboard rendered with `admin: null` until a manual reload.
 *
 * The symptom was an empty sidebar after login. The bug predates the nav-gating
 * change but was invisible while the nav fell back to showing every item when
 * `admin` was null: it looked complete, and only a sub-admin would ever have
 * seen anything wrong.
 *
 * `invite/accept` hit the same wall and worked around it with a full page load.
 * This is the smaller fix, so the order is what the test pins: refetch, THEN
 * navigate. Navigating first would race the query and reintroduce the blank
 * shell intermittently, which is worse than reintroducing it reliably.
 */

const { login, totpSetup, totpVerify, push, refetchAdmin } = vi.hoisted(() => ({
  login: vi.fn(),
  totpSetup: vi.fn(),
  totpVerify: vi.fn(),
  push: vi.fn(),
  refetchAdmin: vi.fn(),
}));

// `useSearchParams` too: the page reads `?next=` through it so a bounced
// operator is returned to where they were going. Mocking only `useRouter`
// leaves it undefined and the page throws on render.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api', () => {
  const api = { auth: { login, totpSetup, totpVerify } };
  return { api, default: api };
});
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({ admin: null, isLoading: false, refetchAdmin, logout: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // A right password buys a challenge, not a session (0191).
  login.mockResolvedValue({ step: 'totp', challengeToken: 'challenge-1', expiresInSeconds: 600 });
  totpSetup.mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    otpauthUri: 'otpauth://totp/x',
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    account: 'admin@oxshare.com',
    issuer: 'OxShare Admin',
  });
  totpVerify.mockResolvedValue({ admin: {} });
  /*
   * `true` — the refetch SUCCEEDED.
   *
   * `refetchAdmin` now reports whether the identity actually arrived, because
   * `invalidateQueries` resolves even when the refetch behind it errored. The
   * login page reads that and refuses to navigate on a failure, so a mock
   * resolving `undefined` means "the profile never loaded" and the page
   * correctly stays put.
   */
  refetchAdmin.mockResolvedValue(true);
});

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/admin email/i), 'admin@oxshare.com');
  await user.type(screen.getByLabelText(/^password$/i), 'admin123');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  return user;
}

/** Password, then the code from the authenticator app. */
async function signInWithCode(code = '123456') {
  const user = await signIn();
  await user.type(await screen.findByLabelText(/6-digit code/i), code);
  await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
  return user;
}

describe('admin login', () => {
  it('a right password asks for the authenticator code — no session, no navigation', async () => {
    renderWithProviders(<AdminLoginPage />);
    await signIn();

    expect(await screen.findByText(/enter your authenticator code/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(refetchAdmin).not.toHaveBeenCalled();
    // An enrolled admin is not shown a QR code.
    expect(totpSetup).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/qr code/i)).not.toBeInTheDocument();
  });

  it('sends the challenge with the code', async () => {
    renderWithProviders(<AdminLoginPage />);
    await signInWithCode('123 456');
    await waitFor(() => expect(totpVerify).toHaveBeenCalledWith('challenge-1', '123456'));
  });

  it('refetches the session before navigating', async () => {
    renderWithProviders(<AdminLoginPage />);
    await signInWithCode();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(refetchAdmin).toHaveBeenCalledTimes(1);

    // Order is the whole fix. Navigating first races the identity query and
    // brings back the blank sidebar intermittently.
    const refetchedAt = refetchAdmin.mock.invocationCallOrder[0]!;
    const pushedAt = push.mock.invocationCallOrder[0]!;
    expect(refetchedAt).toBeLessThan(pushedAt);
  });

  it('does not navigate when the credentials are refused', async () => {
    login.mockRejectedValue({ response: { data: { message: 'Invalid credentials.' } } });
    renderWithProviders(<AdminLoginPage />);
    await signIn();

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // And no refetch either — there is no new session to fetch.
    expect(refetchAdmin).not.toHaveBeenCalled();
  });

  it('stays put when the profile cannot be loaded after signing in', async () => {
    /*
     * `refetchAdmin` is `invalidateQueries`, which resolves even when the
     * refetch behind it FAILS — so this page used to navigate regardless, and a
     * transient failure on `/admin/auth/me` right after a successful sign-in
     * landed the operator in a console shell that knew nothing about them.
     */
    refetchAdmin.mockResolvedValue(false);
    renderWithProviders(<AdminLoginPage />);
    await signInWithCode();

    expect(await screen.findByText(/could not load your profile/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('sends no request until both fields are filled', async () => {
    renderWithProviders(<AdminLoginPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(login).not.toHaveBeenCalled();
  });
});

describe('the authenticator step', () => {
  it('first sign-in: shows the QR code and the key to type, then signs in on the code', async () => {
    login.mockResolvedValue({
      step: 'totp_setup',
      challengeToken: 'challenge-1',
      expiresInSeconds: 600,
    });
    renderWithProviders(<AdminLoginPage />);
    const user = await signIn();

    expect(await screen.findByText(/set up your authenticator app/i)).toBeInTheDocument();
    expect(totpSetup).toHaveBeenCalledWith('challenge-1');
    const qr = await screen.findByAltText(/qr code/i);
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    // Grouped in fours, as the apps ask for it.
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(screen.getByText(/google authenticator/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/6-digit code/i), '654321');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(totpVerify).toHaveBeenCalledWith('challenge-1', '654321');
  });

  it('a wrong code says so and stays on the code step', async () => {
    totpVerify.mockRejectedValue({
      response: { data: { message: 'That code is not correct. Check the app and try again.' } },
    });
    renderWithProviders(<AdminLoginPage />);
    await signInWithCode();

    expect(await screen.findByText(/code is not correct/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toHaveValue('');
    expect(push).not.toHaveBeenCalled();
  });

  it('refuses to send anything but six digits', async () => {
    renderWithProviders(<AdminLoginPage />);
    await signInWithCode('123');
    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    expect(totpVerify).not.toHaveBeenCalled();
  });

  it('"Back to sign in" returns to the password form', async () => {
    renderWithProviders(<AdminLoginPage />);
    const user = await signIn();
    await user.click(await screen.findByRole('button', { name: /back to sign in/i }));
    expect(screen.getByLabelText(/admin email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/6-digit code/i)).not.toBeInTheDocument();
  });

  it('a failed QR preparation offers a way back rather than a spinner forever', async () => {
    login.mockResolvedValue({ step: 'totp_setup', challengeToken: 'c', expiresInSeconds: 600 });
    totpSetup.mockRejectedValue({
      response: {
        data: { message: 'Your sign-in has expired. Enter your email and password again.' },
      },
    });
    renderWithProviders(<AdminLoginPage />);
    await signIn();
    expect(await screen.findByText(/sign-in has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument();
  });
});
