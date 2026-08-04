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

const { login, push, refetchAdmin } = vi.hoisted(() => ({
  login: vi.fn(),
  push: vi.fn(),
  refetchAdmin: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/lib/api', () => {
  const api = { auth: { login } };
  return { api, default: api };
});
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({ admin: null, isLoading: false, refetchAdmin, logout: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  login.mockResolvedValue({});
  refetchAdmin.mockResolvedValue(undefined);
});

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/admin email/i), 'admin@oxshare.com');
  await user.type(screen.getByLabelText(/password/i), 'admin123');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('admin login', () => {
  it('refetches the session before navigating', async () => {
    renderWithProviders(<AdminLoginPage />);
    await signIn();

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

  it('sends no request until both fields are filled', async () => {
    renderWithProviders(<AdminLoginPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(login).not.toHaveBeenCalled();
  });
});
