import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import NetworkAccessPage from './page';

/**
 * Network access — the RBAC-08 allowlist as its own page (it was a Settings tab
 * until 25 Sep 2026). The panel's own behaviour is pinned beside it in
 * `ip-allowlist-panel.test.tsx`; what this pins is the page: one title, and the
 * read/change split carried through to the controls.
 */
const { getIpAllowlist, addIpAllowlistRule, removeIpAllowlistRule } = vi.hoisted(() => ({
  getIpAllowlist: vi.fn(),
  addIpAllowlistRule: vi.fn(),
  removeIpAllowlistRule: vi.fn(),
}));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getIpAllowlist, addIpAllowlistRule, removeIpAllowlistRule } };
  return { api, default: api };
});

const permissions = { current: ALL_PERMISSIONS };

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

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIpAllowlist.mockResolvedValue({
    enforced: true,
    disabledByConfig: false,
    yourIp: '203.0.113.5',
    rules: [
      {
        id: 'rule-1',
        cidr: '203.0.113.0/24',
        label: 'Beirut office',
        createdBy: 'a-1',
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    ],
  });
});

describe('the network access page', () => {
  it('shows the allowlist under ONE title', async () => {
    renderWithProviders(<NetworkAccessPage />);

    expect(await screen.findByText('203.0.113.0/24')).toBeInTheDocument();
    /* The page's h1 carries the title; the panel's own heading is switched off. */
    expect(screen.getAllByRole('heading', { name: /network access/i })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /network access/i })).toBeInTheDocument();
  });

  it('offers the add control to an admin who may change the rules', async () => {
    renderWithProviders(<NetworkAccessPage />);

    await screen.findByText('203.0.113.0/24');
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  /*
   * Read-only means READ-ONLY. Seeing which networks are trusted is an audit
   * question; adding one can lock every administrator out.
   */
  it('offers no add control to an admin who may only read', async () => {
    permissions.current = ['settings.security.view'];
    renderWithProviders(<NetworkAccessPage />);

    await screen.findByText('203.0.113.0/24');
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
  });
});
