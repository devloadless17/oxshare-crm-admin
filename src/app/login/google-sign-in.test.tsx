import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { API_BASE_URL } from '@/lib/env';
import AdminLoginPage from './page';

/**
 * "Continue with Google" on the sign-in screen: offered only when the API says
 * it is configured, a full-page navigation to the API (never a fetch), the
 * page's own `?next=` carried through the same validator, and every
 * `google_error` code the API returns with rendered as our own sentence.
 */

const { googleStatus } = vi.hoisted(() => ({ googleStatus: vi.fn() }));
const searchParams = { current: new URLSearchParams() };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams.current,
}));
vi.mock('@/lib/api', () => {
  const api = { auth: { login: vi.fn(), googleStatus } };
  return { api, default: api };
});
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: null,
    isLoading: false,
    hadSession: false,
    refetchAdmin: vi.fn(),
    logout: vi.fn(),
  }),
}));

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  googleStatus.mockResolvedValue({ enabled: true });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('Continue with Google', () => {
  it('is offered when the API says Google sign-in is enabled', async () => {
    renderWithProviders(<AdminLoginPage />);
    expect(
      await screen.findByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument();
    // The password form stays.
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toBeInTheDocument();
  });

  it('is not offered when Google sign-in is off, or the check fails', async () => {
    googleStatus.mockResolvedValue({ enabled: false });
    const { unmount } = renderWithProviders(<AdminLoginPage />);
    await screen.findByRole('button', { name: /sign in to admin/i });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
    unmount();

    googleStatus.mockRejectedValue(new Error('network'));
    renderWithProviders(<AdminLoginPage />);
    await screen.findByRole('button', { name: /sign in to admin/i });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it('navigates the whole page to the API start route, carrying a safe next', async () => {
    searchParams.current = new URLSearchParams('next=/clients?tab=2');
    renderWithProviders(<AdminLoginPage />);
    await userEvent.click(await screen.findByRole('button', { name: /continue with google/i }));
    expect(assign).toHaveBeenCalledWith(
      `${API_BASE_URL}/admin/auth/google/start?next=${encodeURIComponent('/clients?tab=2')}`,
    );
  });

  it('never carries an off-site next to the API', async () => {
    searchParams.current = new URLSearchParams('next=https://evil.example/login');
    renderWithProviders(<AdminLoginPage />);
    await userEvent.click(await screen.findByRole('button', { name: /continue with google/i }));
    const url = new URL(assign.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('next')).not.toContain('evil');
  });

  it.each([
    ['no_account', /no admin account for that Google account/i],
    ['suspended', /has been suspended/i],
    ['domain', /not from an allowed company domain/i],
    ['account_mismatch', /linked to a different Google account/i],
    ['cancelled', /was cancelled/i],
    ['something-new', /Google sign-in failed/i],
  ])('explains google_error=%s', async (code, sentence) => {
    searchParams.current = new URLSearchParams(`google_error=${code}`);
    renderWithProviders(<AdminLoginPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(sentence);
  });
});
