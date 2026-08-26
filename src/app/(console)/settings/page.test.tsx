import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AdminSettingsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * /settings — three tabs over three independently-guarded resources.
 *
 * Trading is FIRST and is therefore the default landing tab. General used to
 * hold that slot and was removed with its table, so several assertions here
 * that read "lands on General" now read "lands on Trading" — the behaviour
 * being pinned is unchanged: a stale or forbidden `?tab=` resolves to the first
 * tab rather than rendering a blank panel.
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

const { getPlatformLinks, getTradingSettings, getSmtpSettings } = vi.hoisted(() => ({
  getPlatformLinks: vi.fn(),
  getTradingSettings: vi.fn(),
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
      getTradingSettings,
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
  getTradingSettings.mockResolvedValue({
    leverages: [50, 100, 200, 500],
    maxLiveAccounts: 5,
    maxDemoAccounts: 5,
    maxDemoDeposit: '1000000.00000000',
    /*
     * No IB fields. They were required here while the panel seeded text boxes
     * from them — an absent value rendered the string 'undefined' and, in one
     * case, threw inside `trimAmount` and surfaced as an unrelated
     * tab-navigation failure three tests away. All four went in 0103/0104 with
     * the controls that read them.
     */
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
  it('offers all five to a full-access admin', () => {
    renderWithProviders(<AdminSettingsPage />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    /*
     * Security is back — RBAC-08 was restored (D-51 → 41).
     *
     * Payments used to be absent here, and the note that stood in this place
     * blamed the fixture for not stubbing the Rival settings call. That was
     * the wrong diagnosis: the tab is gated on `settings.rival.view` alone,
     * and the key was simply missing from ALL_PERMISSIONS. The Rival API was
     * never reached either way — TabPanel renders null while inactive, so the
     * panel does not mount. Eight keys had drifted out of that fixture the
     * same way; see the header of src/test/permissions.ts for why it has to
     * be kept in step by hand.
     */
    expect(tabs).toEqual(['Trading', 'Email', 'Payments', 'Platforms', 'Security']);
  });

  it('hides the Email tab from a non-master admin', () => {
    // The API answers 403 for anyone but a master admin. Offering the tab would
    // be offering a screen that always fails.
    identity.role = 'sub_admin';
    identity.permissions = ['settings.edit', 'roles.edit'];
    renderWithProviders(<AdminSettingsPage />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Trading', 'Platforms']);
  });

  it('defaults to Trading when no tab is in the URL', async () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /trading/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/account opening/i)).toBeInTheDocument();
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
    // A renamed tab in an old bookmark. Landing on Trading beats a blank panel.
    search.current = new URLSearchParams('tab=nonsense');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /trading/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/account opening/i)).toBeInTheDocument();
  });

  it('falls back when a sub-admin opens a link to the master-only Email tab', () => {
    // Synchronous on purpose: the assertion is that the SMTP query never starts,
    // and awaiting anything first would give it a chance to.
    identity.role = 'sub_admin';
    identity.permissions = ['settings.edit'];
    search.current = new URLSearchParams('tab=email');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /trading/i })).toHaveAttribute('aria-selected', 'true');
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
    await screen.findByText(/account opening/i);

    expect(getTradingSettings).toHaveBeenCalledTimes(1);
    expect(getSmtpSettings).not.toHaveBeenCalled();
    expect(getPlatformLinks).not.toHaveBeenCalled();
  });

  it('fetches a tab only once it is opened', async () => {
    search.current = new URLSearchParams('tab=platforms');
    renderWithProviders(<AdminSettingsPage />);

    await screen.findByText(/trading platform downloads/i);
    expect(getPlatformLinks).toHaveBeenCalledTimes(1);
    expect(getTradingSettings).not.toHaveBeenCalled();
  });
});

describe('the Security tab is back — RBAC-08', () => {
  /*
   * This block asserted the opposite until the allowlist was restored. It was
   * deleted on 7 Aug as unwanted scope; the root CLAUDE.md records the tech lead
   * confirming on 2 Aug that RBAC-08 is IN scope and the committed total is 41,
   * and the deletion was never confirmed by them (D-51).
   */
  it('is offered to an admin holding settings.security.view', () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /security/i })).toBeInTheDocument();
  });

  it('is HIDDEN without that key, not merely disabled', () => {
    // Which networks a company works from is a map of where its people are. An
    // operator who cannot act on it does not need to read it.
    identity.permissions = ['settings.edit'];
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.queryByRole('tab', { name: /security/i })).toBeNull();
  });

  it('a ?tab=security link opens the panel rather than falling back', async () => {
    search.current = new URLSearchParams('tab=security');
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('tab', { name: /security/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/network access/i)).toBeInTheDocument();
  });
});

describe('what the settings page still does not carry', () => {
  it('has no roles or admin directory', async () => {
    // The point of the earlier split. Both moved to /roles and /admin-users;
    // leaving a second copy here is how the old /roles page drifted out of sync.
    renderWithProviders(<AdminSettingsPage />);
    await screen.findByText(/account opening/i);

    expect(screen.queryByRole('button', { name: /create custom role/i })).toBeNull();
    expect(screen.queryByText(/admin account directory/i)).toBeNull();
    expect(screen.queryByRole('tab', { name: /roles/i })).toBeNull();
  });
});
