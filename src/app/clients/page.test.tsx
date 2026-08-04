import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ClientsPage from './page';

/**
 * The client directory, and the one destructive action on it.
 *
 * Suspending logs a client out immediately and locks them out, so the asymmetry in
 * this screen is deliberate and worth pinning: suspending asks for confirmation,
 * reactivating does not. Only the direction that takes access away needs a guard.
 *
 * Also pins that suspension is gated on users.suspend. Client-side gating is UX
 * rather than security — PermissionsGuard answers 403 independently — but a missing
 * gate implies the permission model is wider than it is.
 */

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

// Both exports, per the convention in CLAUDE.md — lib/api/index.ts publishes `api`
// as a named export and as the default, and which one a page uses varies.
vi.mock('@/lib/api', () => {
  const api = { get, patch };
  return { api, default: api };
});

const permissions = { current: ['*'] as string[] };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

function client(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    email: 'client@oxshare.com',
    firstName: 'John',
    lastName: 'Doe',
    type: 'individual',
    status: 'active',
    verificationLevel: 1,
    createdAt: '2026-08-03T14:51:46.899Z',
    ...over,
  };
}

function page(rows: Record<string, unknown>[]) {
  return { items: rows, total: rows.length, page: 1, limit: 20 };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  get.mockResolvedValue({ data: page([client()]) });
  patch.mockResolvedValue({ data: client({ status: 'suspended' }) });
});

describe('client directory — listing', () => {
  it('lists clients returned by the API', async () => {
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('client@oxshare.com')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('client directory — suspension', () => {
  it('asks before suspending, and does nothing if declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /^suspend$/i }));

    expect(confirmSpy).toHaveBeenCalled();
    // Suspension logs the client out immediately; a mis-click must not reach the API.
    expect(patch).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('suspends once confirmed, sending status: suspended', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /^suspend$/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [url, body] = patch.mock.calls[0] as [string, { status: string }];
    expect(url).toBe('/admin/clients/c-1/status');
    expect(body).toEqual({ status: 'suspended' });
    confirmSpy.mockRestore();
  });

  it('warns which client is being suspended, by email', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /^suspend$/i }));

    // Acting on the wrong row is the mistake this text exists to prevent.
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('client@oxshare.com');
    confirmSpy.mockRestore();
  });

  it('reactivates WITHOUT a confirmation, since it restores access', async () => {
    get.mockResolvedValue({ data: page([client({ status: 'suspended' })]) });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /reactivate/i }));

    // Only the destructive direction is guarded. Asking here would be friction
    // with nothing to protect.
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect((patch.mock.calls[0] as [string, { status: string }])[1]).toEqual({ status: 'active' });
    confirmSpy.mockRestore();
  });
});

describe('client directory — permission gating', () => {
  it('shows no suspend control without users.suspend', async () => {
    permissions.current = ['users.view'];
    renderWithProviders(<ClientsPage />);

    await screen.findByText('client@oxshare.com');
    expect(screen.queryByRole('button', { name: /^suspend$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reactivate/i })).toBeNull();
  });

  it('still lists clients read-only without users.suspend', async () => {
    permissions.current = ['users.view'];
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('client@oxshare.com')).toBeInTheDocument();
  });
});
