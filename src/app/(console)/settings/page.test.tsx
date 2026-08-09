import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AdminSettingsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * /settings — three tabs over three independently-guarded resources.
 *
 * Each panel owns its own query and is tested directly (see
 * components/rbac/smtp-settings-panel.test.tsx). What is pinned here is the
 * wiring the tab split could get wrong:
 *
 *  - WHICH tabs a given admin is offered. The Email tab is master-admin-only,
 *    so a sub-admin must not see it at all rather than see it 403.
 *  - that only the ACTIVE panel mounts. Every panel fetches on mount, so
 *    rendering all three would fire three requests on a screen where the
 *    operator reads one — including the SMTP one, which 403s for a sub-admin.
 *  - that the active tab comes from the URL, which is what makes "Settings →
 *    Email" a link somebody can send.
 *  - that roles and the admin directory are still absent. They live at /roles
 *    and /admin-users, and a second copy here is how the old page drifted.
 *  - that Security is GONE. Its panels were deleted with the tab, so a bookmark
 *    to `?tab=security` has to land somewhere rather than render blank.
 */

const { getPlatformLinks, getGeneralSettings, getSmtpSettings } = vi.hoisted(() => ({
  getPlatformLinks: vi.fn(),
  getGeneralSettings: vi.fn(),
  getSmtpSettings: vi.fn(),
}));

// Both exports — see the note in roles/page.test.tsx. Nothing on this page
// reaches for `api.admin` any more, but the page still imports the module, so
// the mock has to answer for both names or the import throws.
vi.mock('@/lib/api', () => {
  const api = { admin: {} };
  return { api, default: api };
});

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getPlatformLinks,
      getGeneralSettings,
      getSmtpSettings,
    },
  };
});

/** The `?tab=` value the page reads, swapped per test. */
const search = { current: new URLSearchParams() };
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => search.current,
  usePathname: () => '/settings',
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

const identity = { role: 'master_admin', permissions: ALL_PERMISSIONS };

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
  identity.permissions = ALL_PERMISSIONS;
  search.current = new URLSearchParams();

  getPlatformLinks.mockResolvedValue([]);
  getGeneralSettings.mockResolvedValue({
    brandName: 'OxShare',
    supportEmail: null,
    supportUrl: null,
    maintenanceNotice: null,
    updatedAt: null,
  });
  getSmtpSettings.mockResolvedValue({
    host: 'smtp.example.com',
    port: 587,
    username: 'mailer',
    passwordSet: true,
    fromAddress: '"OxShare" <no-reply@oxshare.com>',
    secure: false,
    source: 'database',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

describe('which tabs an admin is offered', () => {
  it('offers all three to a master admin', () => {
    renderWithProviders(<AdminSettingsPage />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['General', 'Email', 'Platforms']);
  });

  it('hides the Email tab from a non-master admin', () => {
    // The API answers 403 for anyone but a master admin. Offering the tab would
    // be offering a screen that always fails.
    identity.role = 'sub_admin';
    identity.permissions = ['settings.edit', 'roles.edit'];
    renderWithProviders(<AdminSettingsPage />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['General', 'Platforms']);
  });

  it('defaults to General when no tab is in the URL', async () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/brand and contact/i)).toBeInTheDocument();
  });
});

describe('the active tab comes from the URL', () => {
  it('opens the tab named in ?tab=', async () => {
    search.current = new URLSearchParams('tab=platforms');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /platforms/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText(/trading platform downloads/i)).toBeInTheDocument();
  });

  it('falls back to the first tab for an unknown ?tab=', async () => {
    // A renamed tab in an old bookmark. Landing on General beats a blank panel.
    search.current = new URLSearchParams('tab=nonsense');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/brand and contact/i)).toBeInTheDocument();
  });

  it('falls back when a sub-admin opens a link to the master-only Email tab', () => {
    // Synchronous on purpose: the assertion is that the SMTP query never starts,
    // and awaiting anything first would give it a chance to.
    identity.role = 'sub_admin';
    identity.permissions = ['settings.edit'];
    search.current = new URLSearchParams('tab=email');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute('aria-selected', 'true');
    expect(getSmtpSettings).not.toHaveBeenCalled();
  });

  it('writes the tab back to the URL on a click, without a history entry', async () => {
    renderWithProviders(<AdminSettingsPage />);

    await userEvent.click(screen.getByRole('tab', { name: /platforms/i }));

    // `replace`, not `push`: clicking four tabs should not bury the page the
    // operator arrived from under four history entries.
    expect(replace).toHaveBeenCalledWith('/settings?tab=platforms', { scroll: false });
  });
});

describe('only the active panel mounts', () => {
  it('does not fetch the other tabs on load', async () => {
    renderWithProviders(<AdminSettingsPage />);
    await screen.findByText(/brand and contact/i);

    expect(getGeneralSettings).toHaveBeenCalledTimes(1);
    expect(getSmtpSettings).not.toHaveBeenCalled();
    expect(getPlatformLinks).not.toHaveBeenCalled();
  });

  it('fetches a tab only once it is opened', async () => {
    search.current = new URLSearchParams('tab=platforms');
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText(/trading platform downloads/i);
    expect(getPlatformLinks).toHaveBeenCalledTimes(1);
    expect(getGeneralSettings).not.toHaveBeenCalled();
  });
});

describe('the Security tab is gone', () => {
  it('is not offered to a master admin', () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.queryByRole('tab', { name: /security/i })).toBeNull();
  });

  it('lands an old ?tab=security bookmark on General', async () => {
    // The panels behind it were deleted, so this is the same path as any other
    // stale link — General, not a blank panel.
    search.current = new URLSearchParams('tab=security');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/brand and contact/i)).toBeInTheDocument();
  });
});

describe('what the settings page still does not carry', () => {
  it('has no roles or admin directory', async () => {
    // The point of the earlier split. Both moved to /roles and /admin-users;
    // leaving a second copy here is how the old /roles page drifted out of sync.
    renderWithProviders(<AdminSettingsPage />);
    await screen.findByText(/brand and contact/i);

    expect(screen.queryByRole('button', { name: /create custom role/i })).toBeNull();
    expect(screen.queryByText(/admin account directory/i)).toBeNull();
    expect(screen.queryByRole('tab', { name: /roles/i })).toBeNull();
  });
});
