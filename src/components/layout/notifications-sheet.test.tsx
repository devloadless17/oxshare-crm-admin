import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import { NotificationsSheet } from './notifications-sheet';

/**
 * The bell, live.
 *
 * What is pinned here is the honesty rules the placeholder version existed to
 * protect: the badge draws ONLY from a counted answer (zero or unknown → no
 * badge), an unknown kind renders a generic row rather than a raw slug, a 404
 * renders BackendPending naming the endpoint, and nothing is marked read as a
 * side effect of opening the panel.
 */

const {
  getNotifications,
  getNotificationsUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  getNotificationsUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getNotifications,
      getNotificationsUnreadCount,
      markNotificationRead,
      markAllNotificationsRead,
    },
  };
  return { api, default: api };
});

// The identity the rows gate their deep links on — mocked, per the repo rule
// that a test STATES the identity it asserts about. `permissions.current` is
// mutable so the no-view-permission case below can narrow it.
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

const notification = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'admin.withdrawal.requested',
  params: {
    transactionId: 't-1',
    userId: 'u-1',
    amount: '250.00000000',
    currency: 'USD',
  },
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
});

const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getNotifications.mockResolvedValue(page([]));
  getNotificationsUnreadCount.mockResolvedValue({ count: 0 });
  markNotificationRead.mockResolvedValue(notification({ readAt: new Date().toISOString() }));
  markAllNotificationsRead.mockResolvedValue({ updated: 0 });
});

async function openSheet() {
  await userEvent.click(screen.getByRole('button', { name: /open notifications/i }));
}

describe('the badge', () => {
  it('shows the unread count on the trigger', async () => {
    getNotificationsUnreadCount.mockResolvedValue({ count: 3 });
    renderWithProviders(<NotificationsSheet />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /3 unread/i })).toBeInTheDocument();
    });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('draws NO badge at zero — a badge that counts nothing is not drawn', async () => {
    getNotificationsUnreadCount.mockResolvedValue({ count: 0 });
    renderWithProviders(<NotificationsSheet />);

    await waitFor(() => expect(getNotificationsUnreadCount).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unread/i })).not.toBeInTheDocument();
  });

  it('caps the badge at 9+', async () => {
    getNotificationsUnreadCount.mockResolvedValue({ count: 42 });
    renderWithProviders(<NotificationsSheet />);

    await waitFor(() => expect(screen.getByText('9+')).toBeInTheDocument());
  });
});

describe('the list', () => {
  it('renders a known kind with interpolated, formatted copy — no raw placeholders', async () => {
    getNotifications.mockResolvedValue(page([notification()]));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText('Withdrawal requested')).toBeInTheDocument();
    // The money went through formatMoney, and no `{amount}` survived.
    const body = screen.getByText(/requested a withdrawal of/i);
    expect(body.textContent).toContain('250');
    expect(body.textContent).not.toContain('{');
  });

  it('renders an UNKNOWN kind as a generic row, never a raw slug', async () => {
    getNotifications.mockResolvedValue(
      page([notification({ id: 'n-x', kind: 'future.event.kind', params: {} })]),
    );
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText('Notification')).toBeInTheDocument();
    expect(screen.queryByText('future.event.kind')).not.toBeInTheDocument();
  });

  it('marks a clicked unread row read — and does NOT mark on open', async () => {
    getNotifications.mockResolvedValue(page([notification()]));
    getNotificationsUnreadCount.mockResolvedValue({ count: 1 });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await screen.findByText('Withdrawal requested');
    // Opening alone marked nothing.
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(markAllNotificationsRead).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('link', { name: /withdrawal requested/i }));
    expect(markNotificationRead).toHaveBeenCalledWith('n-1');
  });

  it('renders a plain row, not a link, when the admin cannot open the destination', async () => {
    // Fanned out on withdrawals.APPROVE; the /transactions queue gates on
    // withdrawals.VIEW. A role granting one without the other still gets the
    // information — but never a link into the "no access" panel.
    permissions.current = ['withdrawals.approve'];
    getNotifications.mockResolvedValue(page([notification()]));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await screen.findByText('Withdrawal requested');
    expect(screen.queryByRole('link', { name: /withdrawal requested/i })).not.toBeInTheDocument();
  });

  it('does not call mark-read for an already-read row', async () => {
    getNotifications.mockResolvedValue(
      page([notification({ readAt: '2026-08-09T00:00:00.000Z' })]),
    );
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await userEvent.click(await screen.findByRole('link', { name: /withdrawal requested/i }));
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('"Mark all as read" calls the endpoint and refetches', async () => {
    getNotifications.mockResolvedValue(page([notification()]));
    getNotificationsUnreadCount.mockResolvedValue({ count: 1 });
    markAllNotificationsRead.mockResolvedValue({ updated: 1 });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await userEvent.click(await screen.findByRole('button', { name: /mark all as read/i }));
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1));
    // Both the list and the count are invalidated by the shared key prefix.
    await waitFor(() => expect(getNotifications.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows the real empty state', async () => {
    getNotifications.mockResolvedValue(page([]));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
    // The placeholder era is over: no preview notice, no sample rows.
    expect(screen.queryByText(/not live yet/i)).not.toBeInTheDocument();
  });

  it('a 404 renders BackendPending naming the endpoint — never sample rows', async () => {
    getNotifications.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText(/GET \/admin\/notifications/)).toBeInTheDocument();
  });

  it('a failure renders the retry card, and retry refires the request', async () => {
    getNotifications.mockRejectedValue(new Error('boom'));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    const retry = await screen.findByRole('button', { name: /^retry$/i });
    getNotifications.mockResolvedValue(page([notification()]));
    await userEvent.click(retry);

    expect(await screen.findByText('Withdrawal requested')).toBeInTheDocument();
  });
});
