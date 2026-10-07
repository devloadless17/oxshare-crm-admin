import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import NewApiKeyPage from './page';

/**
 * /api-keys/new — the permission catalog's load states.
 *
 * The catalog was a bare `useQuery` rendered as `catalog.data && …`, so a failed
 * load showed NOTHING under "Permissions": no spinner, no error, no retry. The
 * submit button needs at least one permission, so the form was silently
 * unsubmittable. It now goes through useResource + AsyncBoundary.
 */

const { getPermissions } = vi.hoisted(() => ({ getPermissions: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { getPermissions, createApiKey: vi.fn() } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/api-keys/new',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      permissions: ALL_PERMISSIONS,
      seesAllClients: true,
      status: 'active',
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NewApiKeyPage — permission catalog', () => {
  it('says the catalog failed and offers a retry, rather than rendering nothing', async () => {
    getPermissions.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewApiKeyPage />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    getPermissions.mockResolvedValue({
      clients: {
        group: 'clients',
        moduleName: 'Clients',
        description: '',
        permissions: [{ key: 'clients.view', label: 'View clients' }],
      },
    });
    await user.click(retry);

    expect(await screen.findByText('View clients')).toBeInTheDocument();
  });
});
