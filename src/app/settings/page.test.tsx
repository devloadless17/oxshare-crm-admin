import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import AdminSettingsPage from './page';

/**
 * /settings — what protects this API.
 *
 * The page is thin by design: both panels own their own queries and are tested
 * directly (see components/rbac/ip-allowlist-panel.test.tsx). What is pinned
 * here is the wiring that decides who is shown what, because it is the part the
 * split could have got wrong:
 *
 *  - the RBAC-08 allowlist is read-only without roles.manage. Before the split
 *    this lived behind a tab that was only RENDERED for roles.manage, so the
 *    route now requires that permission (lib/permissions.ts) and the panel is
 *    handed canManage rather than assuming it.
 *  - the security controls are master-admin only. The API refuses anyone else
 *    regardless (R-4.1), but showing the panel implies it can be used.
 */

const { getIpAllowlist } = vi.hoisted(() => ({ getIpAllowlist: vi.fn() }));

// Both exports — see the note in roles/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getIpAllowlist,
      addIpAllowlistRule: vi.fn(),
      removeIpAllowlistRule: vi.fn(),
    },
  };
  return { api, default: api };
});

const identity = { role: 'master_admin', permissions: ['*'] as string[] };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      get role() {
        return identity.role;
      },
      get permissions() {
        return identity.permissions;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  identity.role = 'master_admin';
  identity.permissions = ['*'];
  getIpAllowlist.mockResolvedValue([]);
});

describe('what the settings page shows', () => {
  it('renders the network access panel', async () => {
    renderWithProviders(<AdminSettingsPage />);
    expect(await screen.findByText(/network access/i)).toBeInTheDocument();
  });

  it('no longer carries roles or the admin directory', async () => {
    // The point of the split. Both moved to /roles and /admin-users; leaving a
    // second copy here is how the old /roles page drifted out of sync.
    renderWithProviders(<AdminSettingsPage />);
    await screen.findByText(/network access/i);

    expect(screen.queryByRole('button', { name: /create custom role/i })).toBeNull();
    expect(screen.queryByText(/admin account directory/i)).toBeNull();
  });

  it('does not fetch roles or admin users', async () => {
    const api = (await import('@/lib/api')).api as unknown as { admin: Record<string, unknown> };
    renderWithProviders(<AdminSettingsPage />);
    await screen.findByText(/network access/i);

    expect(api.admin['getRoles']).toBeUndefined();
    expect(api.admin['getAdminUsers']).toBeUndefined();
  });
});

describe('who is shown the security controls', () => {
  // Matched as a HEADING, not as text: the page subtitle also contains the
  // phrase "security controls", so a bare text matcher finds two nodes and
  // reports an ambiguity that reads like a rendering bug.
  it('shows them to a master admin', async () => {
    renderWithProviders(<AdminSettingsPage />);
    expect(await screen.findByRole('heading', { name: /security controls/i })).toBeInTheDocument();
  });

  it('hides them from a non-master admin holding roles.manage', async () => {
    // R-4.1 — the API refuses a non-master regardless. Rendering the panel would
    // offer a control that always fails.
    identity.role = 'sub_admin';
    identity.permissions = ['roles.manage'];
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText(/network access/i);
    expect(screen.queryByRole('heading', { name: /security controls/i })).toBeNull();
  });
});
