import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import FinancialPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The Financial page — every money movement, platform-wide.
 *
 * ## What this file exists to pin
 *
 *  - amounts are STRINGS all the way to the DOM (§6.1) — the union serves
 *    NUMERIC(28,8), and `Number('12345678901234567.89')` is wrong before
 *    formatting starts.
 *  - every filter is SERVER-side: tabs, dropdowns, dates and search all
 *    change the request, never slice the page in the browser.
 *  - the page is READ-ONLY. The withdrawal desk owns the money actions; a
 *    duplicate approve button here would be a second lifecycle to keep honest.
 *  - the tiles render the server's numbers — counts the API computed and
 *    decimal strings the API summed — and never arithmetic of their own.
 */
const { getTransactions, getTransactionsSummary, getCurrencies } = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getTransactionsSummary: vi.fn(),
  getCurrencies: vi.fn(),
}));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getTransactions, getTransactionsSummary, getCurrencies } };
  return { api, default: api };
});

/*
 * The minimal app-router stand-in `ledger/page.test.tsx` established —
 * external store + counter snapshot, because React only re-renders on a
 * CHANGED snapshot and a fresh URLSearchParams identity does not qualify.
 */
const listeners = new Set<() => void>();
const searchParams = { current: new URLSearchParams() };
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
    usePathname: () => '/financial',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
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

const row = (over: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  kind: 'payment',
  direction: 'deposit',
  state: 'success',
  amount: '100.12345678',
  currency: 'USD',
  methodName: 'Whish Money',
  provider: 'whish',
  providerRef: 'ref-9',
  destination: null,
  rejectionReason: null,
  tradingAccountId: null,
  walletId: 'w-1',
  createdAt: '2026-08-20T10:00:00.000Z',
  settledAt: '2026-08-20T10:05:00.000Z',
  user: { id: 'u-1', email: 'jane@client.test', firstName: 'Jane', lastName: 'Client' },
  ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  items: [row()],
  nextCursor: null,
  total: 1,
  page: 1,
  limit: 25,
  counts: { all: 1, success: 1 },
  directionCounts: { all: 1, deposit: 1 },
  ...over,
});

const summary = (over: Record<string, unknown> = {}) => ({
  rows: [
    {
      direction: 'deposit',
      kind: 'payment',
      state: 'success',
      currency: 'USD',
      count: 1,
      total: '100.12345678',
    },
  ],
  directions: [{ direction: 'deposit', currency: 'USD', count: 1, total: '100.12345678' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  permissions.current = ALL_PERMISSIONS;
  getTransactions.mockResolvedValue(page());
  getTransactionsSummary.mockResolvedValue(summary());
  getCurrencies.mockResolvedValue([
    { code: 'USD', name: 'US Dollar', enabled: true },
    { code: 'USDT', name: 'Tether', enabled: true },
  ]);
});

describe('what the list shows', () => {
  it('lists a movement with its client and its formatted amount', async () => {
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('jane@client.test')).toBeInTheDocument();
    // EXACT string — a loose matcher can land on the tile hint instead.
    expect(await screen.findAllByText('$100.12')).not.toHaveLength(0);
    expect(screen.getByText('Jane Client')).toBeInTheDocument();
  });

  it('renders the amount from the STRING, not a coerced number', async () => {
    // Past 2^53 — if anything on this path called Number(), the last digits
    // would change on the way to the DOM.
    getTransactions.mockResolvedValue(page({ items: [row({ amount: '12345678901234567.89' })] }));
    getTransactionsSummary.mockResolvedValue(
      summary({
        directions: [
          { direction: 'deposit', currency: 'USD', count: 1, total: '12345678901234567.89' },
        ],
      }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findAllByText('$12,345,678,901,234,567.89')).not.toHaveLength(0);
  });

  it('labels a transfer by its KIND, never as a bare withdrawal', async () => {
    // Wallet-side direction on a transfer is 'withdrawal', and printing that
    // word would read as money leaving the platform. The badge must say what
    // it is instead.
    getTransactions.mockResolvedValue(
      page({
        items: [
          row({ id: 'tx-t', kind: 'transfer', direction: 'withdrawal', methodName: 'transfer' }),
        ],
      }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('Trading transfer')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Withdrawal')).toBeNull();
  });

  it('names a manual credit instead of printing the machine key', async () => {
    // `manual_admin` is the one provider a screen may recognise by name — the
    // row went through no payment method, so its methodName falls back to the
    // raw provider key, which is not a rail name anyone should read.
    getTransactions.mockResolvedValue(
      page({ items: [row({ provider: 'manual_admin', methodName: 'manual_admin' })] }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('Manual credit')).toBeInTheDocument();
    expect(screen.queryByText('manual_admin')).toBeNull();
  });

  it('shows an unfamiliar kind verbatim instead of blank', async () => {
    getTransactions.mockResolvedValue(
      page({ items: [row({ kind: 'cpa_bonus', methodName: 'cpa' })] }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('cpa_bonus')).toBeInTheDocument();
  });

  it('says the list is empty rather than rendering a blank table', async () => {
    getTransactions.mockResolvedValue(page({ items: [], total: 0 }));
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText(/no money has moved/i)).toBeInTheDocument();
  });

  it('names the missing endpoint when the API answers 404', async () => {
    // `unavailable` is a to-do for the API owner, not a failure — the screen
    // must say which endpoint it wanted (the BackendPending contract).
    getTransactions.mockRejectedValue(
      Object.assign(new Error('not built'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText(/GET \/admin\/transactions/)).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    getTransactions.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no money has moved/i)).toBeNull();
  });
});

describe('every filter asks the server', () => {
  it('direction tab narrows the REQUEST and resets the page', async () => {
    const user = userEvent.setup();
    searchParams.current = new URLSearchParams('page=3');
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByRole('button', { name: /^withdrawal/i }));

    await waitFor(() => {
      const last = getTransactions.mock.calls.at(-1)?.[0] as {
        direction?: string;
        page?: number;
      };
      expect(last.direction).toBe('withdrawal');
      expect(last.page).toBe(1);
    });
    // The filter is a URL, so "every withdrawal" is a link, not a session.
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('direction=withdrawal'), {
      scroll: false,
    });
  });

  it('kind and state dropdowns reach the request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByLabelText('Kind'));
    await user.click(await screen.findByRole('option', { name: 'Commission transfer' }));
    await waitFor(() => {
      expect((getTransactions.mock.calls.at(-1)?.[0] as { kind?: string }).kind).toBe(
        'commission_transfer',
      );
    });

    await user.click(screen.getByLabelText('State'));
    await user.click(await screen.findByRole('option', { name: 'Pending' }));
    await waitFor(() => {
      expect((getTransactions.mock.calls.at(-1)?.[0] as { state?: string }).state).toBe('pending');
    });
  });

  it('currency options come from the currencies endpoint, not the rows', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByLabelText('Currency'));
    // USDT is offered even though no row on screen holds it — the vocabulary
    // is the platform's, not the current page's.
    expect(await screen.findByRole('option', { name: 'USDT' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'USDT' }));

    await waitFor(() => {
      expect((getTransactions.mock.calls.at(-1)?.[0] as { currency?: string }).currency).toBe(
        'USDT',
      );
    });
  });

  it('search is debounced and lands on the server as q', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.type(screen.getByLabelText(/search movements/i), 'jane');

    await waitFor(() => {
      expect((getTransactions.mock.calls.at(-1)?.[0] as { q?: string }).q).toBe('jane');
    });
  });

  it('KEEPS EVERY CHARACTER TYPED, without waiting for the router', async () => {
    /*
     * The reported bug: "I cannot type normally in the financial search".
     *
     * The input was bound directly to `url.get('q')`, so each keystroke was
     * written to the URL and read back through the router's ASYNC `replace`.
     * The value the box displayed therefore lagged a render behind the typing,
     * which drops characters and moves the caret — the same failure the KYC and
     * withdrawal queues fixed by holding the term in local state.
     *
     * Asserted on the INPUT rather than on the request, because the request was
     * never the broken half: the debounced `q` arrived correctly (the case
     * above passes either way), while what the operator saw did not.
     */
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    const box = screen.getByLabelText(/search movements/i);
    await user.type(box, 'jane doe');

    expect(box, 'characters were dropped between keystrokes').toHaveValue('jane doe');
  });

  it('asks for a bounded page rather than the whole union', async () => {
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    const first = getTransactions.mock.calls[0]?.[0] as { limit?: number };
    expect(first.limit).toBeGreaterThan(0);
    expect(first.limit).toBeLessThanOrEqual(100);
  });

  it('the summary shares the list’s filters, minus paging and the direction axis', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByLabelText('State'));
    await user.click(await screen.findByRole('option', { name: 'Pending' }));
    await user.click(screen.getByRole('button', { name: /^withdrawal/i }));

    await waitFor(() => {
      const last = getTransactionsSummary.mock.calls.at(-1)?.[0] as {
        state?: string;
        direction?: string;
        limit?: number;
      };
      expect(last.state).toBe('pending');
      // …minus paging: the tiles describe the whole filtered set…
      expect(last.limit).toBeUndefined();
      // …and minus direction/kind: the Deposits tile keeps its total while
      // the Withdrawals tab is active (the tabs' own two-axis rule).
      expect(last.direction).toBeUndefined();
    });
  });
});

describe('the tiles render the server’s numbers', () => {
  it('shows the direction counts and the server-summed totals', async () => {
    getTransactions.mockResolvedValue(
      page({ directionCounts: { all: 12, deposit: 7, withdrawal: 5 } }),
    );
    getTransactionsSummary.mockResolvedValue(
      summary({
        directions: [
          { direction: 'deposit', currency: 'USD', count: 7, total: '1250.50000000' },
          { direction: 'withdrawal', currency: 'USD', count: 5, total: '400.00000000' },
        ],
      }),
    );
    renderWithProviders(<FinancialPage />);

    // Counts from `directionCounts`, totals as formatted SERVER strings —
    // nothing on this page added decimal strings together.
    expect(await screen.findByText('$1,250.50')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    // '12' renders twice on purpose: the Movements tile and the All tab badge
    // describe the same server-computed figure.
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
  });
});

describe('RBAC-03: masked client fields are dropped and announced', () => {
  it('hides the masked email, says so once, and keeps the rest of the row', async () => {
    // The response OMITS masked fields (the server removed them) and names
    // them in maskedFields — the screen drops the value and shows the notice,
    // never an em dash that reads as "this client has no email".
    getTransactions.mockResolvedValue(
      page({
        items: [
          row({
            user: { id: 'u-1', firstName: 'Jane', lastName: 'Client' },
          }),
        ],
        maskedFields: ['financial.user.email'],
      }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('Jane Client')).toBeInTheDocument();
    expect(screen.queryByText('jane@client.test')).toBeNull();
    // The notice, once, above the table — the clients-list pattern.
    expect(screen.getByText(/email address/i)).toBeInTheDocument();
  });

  it('falls back to the client id when everything readable is hidden', async () => {
    getTransactions.mockResolvedValue(
      page({
        items: [row({ user: { id: 'u-1' } })],
        maskedFields: [
          'financial.user.email',
          'financial.user.firstName',
          'financial.user.lastName',
        ],
      }),
    );
    renderWithProviders(<FinancialPage />);

    // The id is unmaskable (rows are addressed by it) and is what remains.
    expect(await screen.findByText('u-1')).toBeInTheDocument();
    expect(screen.queryByText('Jane Client')).toBeNull();
  });
});

describe('the page never offers to move money', () => {
  it('draws no approve, reject, edit or delete control on any row', async () => {
    getTransactions.mockResolvedValue(
      page({
        items: [row({ id: 'tx-p', direction: 'withdrawal', state: 'pending' })],
      }),
    );
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    const table = screen.getByRole('table');
    expect(
      within(table).queryByRole('button', { name: /approve|reject|edit|delete|settle|cancel/i }),
    ).toBeNull();
  });

  it('links a pending withdrawal to the desk instead', async () => {
    getTransactions.mockResolvedValue(
      page({
        items: [row({ id: 'tx-p', direction: 'withdrawal', state: 'pending' })],
      }),
    );
    renderWithProviders(<FinancialPage />);

    const link = await screen.findByRole('link', { name: /review on the desk/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/transactions?state=all&q=jane%40client.test'),
    );
  });

  it('melts the desk link into text for an operator without withdrawals.view', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => !key.startsWith('withdrawals.'));
    getTransactions.mockResolvedValue(
      page({
        items: [row({ id: 'tx-p', direction: 'withdrawal', state: 'pending' })],
      }),
    );
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    expect(screen.queryByRole('link', { name: /review on the desk/i })).toBeNull();
  });
});
