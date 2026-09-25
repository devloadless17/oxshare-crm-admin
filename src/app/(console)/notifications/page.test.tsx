import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import NotificationsPage from './page';

/**
 * The notifications page — every task, with a desk's tools for going back
 * through its work. Its filters live in the URL, so a view is linkable and
 * survives a refresh; these pin that the URL is what drives the request.
 */

const { list, summary, replace, search } = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  replace: vi.fn(),
  search: { current: new URLSearchParams() },
}));

vi.mock('@/lib/api/admin-notifications', () => ({
  adminNotificationsApi: {
    list,
    summary,
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markAllRead: vi.fn(),
    markSubjectRead: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => search.current,
}));
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      role: 'master_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const counts = { deposits: 1, withdrawals: 2, kyc: 0, ib: 0, transfers: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  search.current = new URLSearchParams();
  list.mockResolvedValue({ items: [], nextCursor: null, maskedFields: [] });
  summary.mockResolvedValue({
    count: 3,
    byCategory: counts,
  });
});

describe('the notifications page', () => {
  it('opens on the inbox, with the count on its tab', async () => {
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Inbox (3)' })).toBeInTheDocument();
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'inbox' }),
        expect.anything(),
      ),
    );
  });

  it('reads History and its client search from the URL', async () => {
    search.current = new URLSearchParams('view=history&q=1000245');
    renderWithProviders(<NotificationsPage />);
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'history', q: '1000245' }),
        expect.anything(),
      ),
    );
    // Nothing matched the search — said as such, not as "nothing ever happened".
    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument();
  });

  it('offers no filters — only History has a search, for finding an old task', async () => {
    renderWithProviders(<NotificationsPage />);
    await screen.findByRole('tab', { name: 'Inbox (3)' });
    expect(screen.queryByRole('group', { name: /categor|status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    // A stale filter in the URL is ignored rather than half-applied.
    expect(list.mock.calls[0]?.[0]).toEqual({
      view: 'inbox',
      q: undefined,
      cursor: undefined,
      limit: 30,
    });
  });

  it('writes the tab to the URL rather than holding it', async () => {
    renderWithProviders(<NotificationsPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    expect(replace).toHaveBeenCalledWith('/notifications?view=history', { scroll: false });
  });
});
