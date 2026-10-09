import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import PartnersPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbPartnerPage, IbPartnerRow } from '@/lib/api/admin';

/**
 * The partner directory — Introducing brokers ▸ Partners.
 *
 * Each case is a rule with a wrong answer that renders perfectly:
 *
 *  - earnings in two currencies must stay two lines — summed, they are a
 *    plausible figure describing nothing;
 *  - a person is named by Portal ID, never by uuid, and a parent outside the
 *    reader's territory is said to be exactly that rather than "Direct";
 *  - search and state reach the SERVER, which pages — a filter over the rows on
 *    screen would look identical and be wrong;
 *  - every write is offered only on the key its API enforces;
 *  - a refusal renders as a refusal, never as "no partners".
 */
const { getIbPartners, setIbPartnerActive, getPartnerDetail } = vi.hoisted(() => ({
  getIbPartners: vi.fn(),
  setIbPartnerActive: vi.fn(),
  getPartnerDetail: vi.fn(),
}));

// BOTH the named export and the default — see admin/CLAUDE.md.
vi.mock('@/lib/api', () => {
  const api = { admin: { getIbPartners, setIbPartnerActive, getPartnerDetail } };
  return { api, default: api };
});

/*
 * The filters live in the URL, and `replace` FEEDS BACK into
 * `useSearchParams` through a subscribable store, because the real router
 * does — the same harness `clients/page.test.tsx` explains at length.
 */
const searchParams = { current: new URLSearchParams() };
const listeners = new Set<() => void>();
let snapshot = 0;
const replace = vi.fn((url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
  snapshot += 1;
  for (const notify of listeners) notify();
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () => {
      useSyncExternalStore(
        (onChange: () => void) => {
          listeners.add(onChange);
          return () => listeners.delete(onChange);
        },
        () => snapshot,
        () => snapshot,
      );
      return searchParams.current;
    },
    usePathname: () => '/partners',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

const permissions = { current: ALL_PERMISSIONS };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      role: 'sub_admin',
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

const TOP_UUID = 1000009;

function partner(over: Partial<IbPartnerRow> = {}): IbPartnerRow {
  return {
    account: {
      userId: TOP_UUID,
      level: 1,
      referralCode: 'R6AA6AMV',
      active: true,
      agencyId: 'ag-1',
      approvedAt: '2026-09-21T12:00:00.000Z',
    },
    user: {
      id: TOP_UUID,
      portalId: 1000009,
      email: 'amira@example.com',
      firstName: 'Amira',
      lastName: 'Topline',
    },
    parentPortalId: null,
    parentOutsideTerritory: false,
    agencyName: 'Levant Partners',
    earnings: [],
    subPartnerCount: 0,
    clientCount: 0,
    ...over,
  };
}

function page(rows: IbPartnerRow[], over: Partial<IbPartnerPage> = {}): IbPartnerPage {
  return {
    rows,
    total: rows.length,
    totalCapped: false,
    nextCursor: null,
    prevCursor: null,
    maskedFields: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  searchParams.current = new URLSearchParams();
  snapshot = 0;
  listeners.clear();
  getIbPartners.mockResolvedValue(page([partner()]));
  setIbPartnerActive.mockResolvedValue({});
});

async function openRowMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /actions for/i }));
  return within(await screen.findByRole('menu'));
}

describe('the partner directory — what a row says', () => {
  it('names the partner by Portal ID and never prints a uuid', async () => {
    const { container } = renderWithProviders(<PartnersPage />);

    expect(await screen.findByText('Amira Topline')).toBeInTheDocument();
    expect(screen.getByText(/#1000009/)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('0b7d3c9e');
    expect(container.querySelector('a[href="/clients/1000009"]')).not.toBeNull();
  });

  it('keeps each currency on its own line — never one total', async () => {
    getIbPartners.mockResolvedValue(
      page([
        partner({
          earnings: [
            { currency: 'EUR', confirmed: '90.00000000', pending: '0' },
            { currency: 'USD', confirmed: '100.00000000', pending: '5.00000000' },
          ],
        }),
      ]),
    );
    renderWithProviders(<PartnersPage />);
    await screen.findByText('Amira Topline');

    const cell = screen.getByText(/100\.00/).closest('td') as HTMLElement;
    expect(within(cell).getByText(/90\.00/)).toBeInTheDocument();
    // The pending figure is said as pending, and only where there is one.
    expect(within(cell).getByText(/5\.00 pending/)).toBeInTheDocument();
    // 190 is what adding them would say. It must appear nowhere.
    expect(screen.queryByText(/190/)).not.toBeInTheDocument();
  });

  it('says "Nothing yet" for a partner with no earnings, not $0.00', async () => {
    renderWithProviders(<PartnersPage />);
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it('shows the IB total as sub-partners plus clients', async () => {
    getIbPartners.mockResolvedValue(page([partner({ subPartnerCount: 2, clientCount: 5 })]));
    renderWithProviders(<PartnersPage />);
    expect(await screen.findByText('2 sub-partners · 5 clients')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('says a partner on no agency is offered every product', async () => {
    getIbPartners.mockResolvedValue(page([partner({ agencyName: null })]));
    renderWithProviders(<PartnersPage />);
    expect(await screen.findByText('All products')).toBeInTheDocument();
  });

  it('tells a direct partner, a visible parent and a hidden parent apart', async () => {
    getIbPartners.mockResolvedValue(
      page([
        partner(),
        partner({
          account: { ...partner().account, userId: 1000031, referralCode: 'CHILD002', level: 2 },
          user: { id: 1000031, portalId: 1000031, firstName: 'Basil', lastName: 'Branch' },
          parentPortalId: 1000009,
        }),
        partner({
          account: { ...partner().account, userId: 1000032, referralCode: 'CHILD003', level: 2 },
          user: { id: 1000032, portalId: 1000032, firstName: 'Celia', lastName: 'Hidden' },
          parentOutsideTerritory: true,
        }),
      ]),
    );
    const { container } = renderWithProviders(<PartnersPage />);
    await screen.findByText('Basil Branch');

    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('Outside your territory')).toBeInTheDocument();
    // The visible parent is a link to their profile, by Portal ID.
    expect(container.querySelectorAll('a[href="/clients/1000009"]').length).toBeGreaterThan(1);
  });

  it('marks a suspended partner', async () => {
    getIbPartners.mockResolvedValue(
      page([partner({ account: { ...partner().account, active: false } })]),
    );
    renderWithProviders(<PartnersPage />);
    expect(await screen.findByText('Suspended')).toBeInTheDocument();
  });

  it('says when a column is hidden from this reader', async () => {
    getIbPartners.mockResolvedValue(
      page([partner({ user: { id: TOP_UUID, portalId: 1000009 } })], {
        maskedFields: ['client.email'],
      }),
    );
    renderWithProviders(<PartnersPage />);
    await screen.findByText(/#1000009/);
    expect(screen.getByText(/email/i)).toBeInTheDocument();
  });
});

describe('the partner directory — search and state reach the server', () => {
  it('sends what is typed as `q`', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartnersPage />);
    await screen.findByText('Amira Topline');

    await user.type(screen.getByRole('searchbox', { name: /search partners/i }), 'r6aa6amv');

    await waitFor(() =>
      expect(getIbPartners).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'r6aa6amv' }),
        expect.anything(),
      ),
    );
  });

  it('sends the state from the URL, and ignores one the API would refuse', async () => {
    searchParams.current = new URLSearchParams('status=suspended');
    const { unmount } = renderWithProviders(<PartnersPage />);
    await waitFor(() =>
      expect(getIbPartners).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
        expect.anything(),
      ),
    );
    unmount();

    getIbPartners.mockClear();
    searchParams.current = new URLSearchParams('status=bogus');
    renderWithProviders(<PartnersPage />);
    await waitFor(() => expect(getIbPartners).toHaveBeenCalled());
    expect(getIbPartners).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined }),
      expect.anything(),
    );
  });
});

describe('the partner directory — what an operator may do', () => {
  it('offers every action to an operator holding every key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartnersPage />);

    const menu = await openRowMenu(user);
    expect(menu.getByRole('menuitem', { name: /view profile/i })).toHaveAttribute(
      'href',
      '/clients/1000009',
    );
    expect(menu.getByRole('menuitem', { name: /commission ledger/i })).toHaveAttribute(
      'href',
      '/commissions?ibUserId=1000009',
    );
    expect(menu.getByRole('menuitem', { name: /clients they introduced/i })).toHaveAttribute(
      'href',
      '/clients?referredBy=1000009',
    );
    expect(menu.getByRole('menuitem', { name: /change commission level/i })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: /move under another partner/i })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: /suspend partner/i })).toBeInTheDocument();
  });

  it('offers no write to an operator who may only read partners', async () => {
    const user = userEvent.setup();
    // Payouts are their own page now, on their own key; the profile needs `clients.view`.
    permissions.current = ['ib.partners.view', 'ib.commissions.view'];
    renderWithProviders(<PartnersPage />);

    const menu = await openRowMenu(user);
    expect(menu.getByRole('menuitem', { name: /commission ledger/i })).toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /view profile/i })).toBeNull();
    expect(menu.queryByRole('menuitem', { name: /change commission level/i })).toBeNull();
    expect(menu.queryByRole('menuitem', { name: /move under another partner/i })).toBeNull();
    expect(menu.queryByRole('menuitem', { name: /suspend partner/i })).toBeNull();
  });

  it('asks before suspending, then suspends that partner', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartnersPage />);

    const menu = await openRowMenu(user);
    await user.click(menu.getByRole('menuitem', { name: /suspend partner/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(setIbPartnerActive).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /suspend partner/i }));
    await waitFor(() => expect(setIbPartnerActive).toHaveBeenCalledWith(TOP_UUID, false));
  });
});

describe('the partner directory — when the list cannot be shown', () => {
  it('offers a retry on a failure, never an empty list', async () => {
    getIbPartners.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<PartnersPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no partner matches/i)).not.toBeInTheDocument();
  });

  it('renders a refusal as a refusal, not as "no partners"', async () => {
    getIbPartners.mockRejectedValue(
      Object.assign(new Error('forbidden'), { response: { status: 403, data: {} } }),
    );
    renderWithProviders(<PartnersPage />);

    await waitFor(() => expect(getIbPartners).toHaveBeenCalled());
    expect(await screen.findByText(/access|permission|allowed/i)).toBeInTheDocument();
    expect(screen.queryByText(/no partner matches/i)).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    getIbPartners.mockResolvedValue(page([]));
    renderWithProviders(<PartnersPage />);
    expect(await screen.findByText(/no partner matches/i)).toBeInTheDocument();
  });
});
