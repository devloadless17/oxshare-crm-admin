import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import { NotificationBell } from './notification-bell';

/**
 * The admin bell — a list of TASKS, and what makes one disappear.
 *
 * The owner's rules, each pinned by the behaviour that makes it true:
 *  - the badge counts what still waits on the reader, capped, never drawn at 0;
 *  - a task reads as the action ("Approve withdrawal"), names the client by name
 *    and Portal ID — the Portal ID alone when the role hides names;
 *  - CLEARING a task takes it out of the inbox at once, with an Undo;
 *  - OPENING the panel clears nothing (the signal must survive until read);
 *  - "Mark all as read" never marks past the newest row on screen;
 *  - History says how a task ended and who ended it;
 *  - no filter row: the inbox is read, not sorted through;
 *  - a "your notifications changed" event re-reads the list (another admin
 *    handled a task — it must leave this inbox without anyone clicking).
 */

const { list, summary, markRead, markUnread, markAllRead, toast, realtime } = vi.hoisted(() => {
  // The socket handlers the bell registered, so a test can play an event in.
  const handlers: Record<string, (payload?: unknown) => void> = {};
  return {
    list: vi.fn(),
    summary: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markAllRead: vi.fn(),
    toast: vi.fn(),
    realtime: { handlers },
  };
});

// The chime, counted — a burst must ring ONCE.
const { chime } = vi.hoisted(() => ({ chime: vi.fn() }));
vi.mock('@/lib/notification-sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notification-sound')>()),
  playNotificationSound: chime,
}));

vi.mock('@/lib/api/admin-notifications', () => ({
  adminNotificationsApi: {
    list,
    summary,
    markRead,
    markUnread,
    markAllRead,
    markSubjectRead: vi.fn(),
  },
}));
// Only `toast` is observed; the real `Toaster` stays, because the shared
// render helper mounts one.
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast,
}));
vi.mock('@/hooks/use-realtime', () => ({
  useRealtime: (handlers: Record<string, (payload?: unknown) => void>) => {
    realtime.handlers = handlers;
    return { connected: false };
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

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

const task = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'admin.withdrawal.requested',
  category: 'withdrawals',
  params: { transactionId: 't-1', amount: '1250.00000000', currency: 'USD' },
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  subject: { kind: 'transaction', id: 't-1' },
  client: { portalId: 1000245, firstName: 'Sara', lastName: 'Ahmed' },
  resolution: null,
  ...over,
});

const page = (items: unknown[], nextCursor: string | null = null, maskedFields: string[] = []) => ({
  items,
  nextCursor,
  maskedFields,
});

const counts = (over: Record<string, number> = {}) => ({
  deposits: 0,
  withdrawals: 0,
  kyc: 0,
  ib: 0,
  transfers: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  list.mockResolvedValue(page([]));
  summary.mockResolvedValue({ count: 0, byCategory: counts() });
  markRead.mockResolvedValue({ id: 'n-1', readAt: new Date().toISOString() });
  markUnread.mockResolvedValue({ id: 'n-1', readAt: null });
  markAllRead.mockResolvedValue({ updated: 1 });
});

async function openBell() {
  await userEvent.click(screen.getByRole('button', { name: /open notifications/i }));
}

describe('the badge', () => {
  it('counts what still waits on the reader, and says so', async () => {
    summary.mockResolvedValue({ count: 3, byCategory: counts({ withdrawals: 3 }) });
    renderWithProviders(<NotificationBell />);
    expect(
      await screen.findByRole('button', { name: /3 tasks need your action/i }),
    ).toBeInTheDocument();
  });

  it('caps at 99+ and draws nothing at zero', async () => {
    summary.mockResolvedValue({ count: 240, byCategory: counts() });
    const { unmount } = renderWithProviders(<NotificationBell />);
    expect(await screen.findByText('99+')).toBeInTheDocument();
    unmount();

    summary.mockResolvedValue({ count: 0, byCategory: counts() });
    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('a task', () => {
  it('reads as the action, names the client by name and Portal ID, and states the amount', async () => {
    list.mockResolvedValue(page([task()]));
    renderWithProviders(<NotificationBell />);
    await openBell();

    expect(await screen.findByText('Approve withdrawal')).toBeInTheDocument();
    expect(screen.getByText('Sara Ahmed')).toBeInTheDocument();
    expect(screen.getByText(/1000245/)).toBeInTheDocument();
    expect(screen.getByText(/1,250\.00/)).toBeInTheDocument();
    // The inbox was asked for, not history — and nothing was marked by opening.
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'inbox' }),
      expect.anything(),
    );
    expect(markRead).not.toHaveBeenCalled();
  });

  it('names the client by Portal ID alone when the role hides names', async () => {
    list.mockResolvedValue(
      page([task({ client: { portalId: 1000245 } })], null, ['client.firstName']),
    );
    renderWithProviders(<NotificationBell />);
    await openBell();

    await screen.findByText('Approve withdrawal');
    expect(screen.getByText(/1000245/)).toBeInTheDocument();
    expect(screen.queryByText('Sara Ahmed')).not.toBeInTheDocument();
  });

  it('links to the desk opened on the task’s own record, never a search', async () => {
    list.mockResolvedValue(page([task()]));
    renderWithProviders(<NotificationBell />);
    await openBell();

    const link = await screen.findByRole('link', { name: /approve withdrawal/i });
    expect(link).toHaveAttribute('href', '/transactions?open=t-1');
  });

  it('renders no link for a reader who may not open that screen', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'withdrawals.view');
    list.mockResolvedValue(page([task()]));
    renderWithProviders(<NotificationBell />);
    await openBell();

    await screen.findByText('Approve withdrawal');
    expect(screen.queryByRole('link', { name: /approve withdrawal/i })).not.toBeInTheDocument();
  });

  it('draws a kind this build does not know as a plain row, with no link and no crash', async () => {
    list.mockResolvedValue(page([task({ kind: 'admin.future.kind', category: 'future' })]));
    renderWithProviders(<NotificationBell />);
    await openBell();

    expect(await screen.findByText('Notification')).toBeInTheDocument();
    expect(screen.getByText(/refresh the page to update/i)).toBeInTheDocument();
    // The ROW links nowhere — nothing in this build knows where it is handled.
    // (The panel's own "Open all notifications" footer link is not the row's.)
    expect(within(screen.getByRole('listitem')).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('what makes a task disappear', () => {
  it('clearing one takes it out of the inbox at once, with an Undo', async () => {
    list.mockResolvedValueOnce(page([task()])).mockResolvedValue(page([]));
    renderWithProviders(<NotificationBell />);
    await openBell();

    await userEvent.click(
      await screen.findByRole('button', { name: /mark .*approve withdrawal.* as read/i }),
    );
    expect(markRead).toHaveBeenCalledWith('n-1');
    await waitFor(() => expect(screen.queryByText('Approve withdrawal')).not.toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(
      'Marked as read',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
  });

  it('"Mark all as read" never marks past the newest row on screen', async () => {
    const newest = new Date(Date.now() - 60_000).toISOString();
    list.mockResolvedValue(
      page([
        task({ id: 'n-2', createdAt: newest }),
        task({ id: 'n-1', createdAt: new Date(Date.now() - 600_000).toISOString() }),
      ]),
    );
    renderWithProviders(<NotificationBell />);
    await openBell();

    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    // Emptying the whole inbox asks once, inline — nothing is sent before that.
    expect(markAllRead).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(markAllRead).toHaveBeenCalledWith({ upTo: newest });
  });

  it('re-reads the list when told its notifications changed — a task handled elsewhere', async () => {
    list.mockResolvedValueOnce(page([task()])).mockResolvedValue(page([]));
    renderWithProviders(<NotificationBell />);
    await openBell();
    await screen.findByText('Approve withdrawal');

    realtime.handlers['notification.changed']?.();
    await waitFor(() => expect(screen.queryByText('Approve withdrawal')).not.toBeInTheDocument());
  });

  it('says "all caught up" when nothing waits, with the way to history', async () => {
    renderWithProviders(<NotificationBell />);
    await openBell();

    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /view history/i }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ view: 'history' }),
        expect.anything(),
      ),
    );
  });
});

describe('history', () => {
  it('says how a task ended and who ended it', async () => {
    list.mockResolvedValue(
      page([
        task({
          readAt: new Date().toISOString(),
          resolution: { at: new Date().toISOString(), outcome: 'success', byName: 'Omar Ali' },
        }),
      ]),
    );
    renderWithProviders(<NotificationBell />);
    await openBell();
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));

    // `success` on a withdrawal is a PAYOUT — the category decides the word.
    expect(await screen.findByText('Paid · Omar Ali')).toBeInTheDocument();
  });

  it('marks a task still waiting as "Needs action"', async () => {
    list.mockResolvedValue(page([task({ readAt: new Date().toISOString() })]));
    renderWithProviders(<NotificationBell />);
    await openBell();
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText('Needs action')).toBeInTheDocument();
  });
});

describe('no filters', () => {
  it('draws no category chips — the list is read, not sorted through', async () => {
    // The owner's call (25 Sep 2026): five tasks need no filter row, and the
    // row of chips did not fit the panel. What a task IS is on the row itself.
    summary.mockResolvedValue({ count: 3, byCategory: counts({ withdrawals: 2, kyc: 1 }) });
    list.mockResolvedValue(page([task()]));
    renderWithProviders(<NotificationBell />);
    await openBell();

    await screen.findByText('Approve withdrawal');
    expect(screen.queryByRole('group', { name: /categor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^deposits|^withdrawals|^kyc/i })).toBeNull();
    // And the feed is asked for the inbox alone — no category axis.
    expect(list).toHaveBeenCalledWith(
      { view: 'inbox', cursor: undefined, limit: 20 },
      expect.anything(),
    );
  });
});

describe('arrivals', () => {
  const arrival = (portalId: number) => ({
    kind: 'admin.withdrawal.requested',
    params: { transactionId: 't-1', amount: '50.00000000', currency: 'USD' },
    subjectPortalId: portalId,
  });

  it('announces a lone task in full — the action, the client, the amount', async () => {
    renderWithProviders(<NotificationBell />);
    realtime.handlers['notification.created']?.(arrival(1000245));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(
      'Approve withdrawal',
      expect.objectContaining({ description: expect.stringContaining('#1000245') }),
    );
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('makes a burst ONE announcement — one chime, one toast', async () => {
    // The transfer scheduler announces every stuck transfer in one pass.
    renderWithProviders(<NotificationBell />);
    for (let i = 0; i < 5; i += 1) {
      realtime.handlers['notification.created']?.(arrival(1000240 + i));
    }

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(
      '5 new tasks need your action',
      expect.objectContaining({ id: 'notifications-burst' }),
    );
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('following the toast reads the task — it leaves the inbox like a clicked row', async () => {
    renderWithProviders(<NotificationBell />);
    realtime.handlers['notification.created']?.({ ...arrival(1000245), id: 'n-9' });

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    const options = toast.mock.calls[0]?.[1] as { action?: { onClick: () => void } } | undefined;
    options?.action?.onClick();
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('n-9'));
  });

  it('shows no toast while the panel is open — the list is already moving', async () => {
    renderWithProviders(<NotificationBell />);
    await openBell();
    realtime.handlers['notification.created']?.(arrival(1000245));

    await waitFor(() => expect(chime).toHaveBeenCalledTimes(1));
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('failure states', () => {
  it('a 403 reads as a closed door, never as "nothing to do"', async () => {
    list.mockRejectedValue({ response: { status: 403 } });
    renderWithProviders(<NotificationBell />);
    await openBell();

    await waitFor(() => expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument());
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });
});
