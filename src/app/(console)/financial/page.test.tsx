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

/*
 * "Mark resolved" goes through `adminApi` directly. A PARTIAL mock: the page
 * also reads the real vocabulary lists (directions, kinds, states) from this
 * module, and replacing them would test a page that cannot exist.
 */
const { resolveAttention } = vi.hoisted(() => ({ resolveAttention: vi.fn() }));
vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return { ...actual, adminApi: { ...actual.adminApi, resolveAttention } };
});

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

/*
 * The server's classification (16 Oct 2026), derived the way `movementDetails` derives it, so a
 * fixture that only says kind and direction still reads like a real row.
 */
function classified(kind: string, direction: string, provider: string) {
  const desk = provider === 'manual_admin';
  const type =
    kind === 'commission_transfer'
      ? 'commission_to_wallet'
      : kind === 'transfer'
        ? direction === 'withdrawal'
          ? 'transfer_to_account'
          : 'transfer_to_wallet'
        : direction === 'deposit'
          ? desk
            ? 'desk_credit'
            : 'deposit'
          : desk
            ? 'desk_debit'
            : 'withdrawal';
  const wallet = {
    kind: 'wallet',
    walletNumber: 'abcd1234wxyz',
    walletKind: 'main',
    currency: 'USD',
  };
  const method = {
    kind: 'method',
    methodLabel: 'Whish Money',
    providerCode: 'rival',
    channelCode: 'whish',
  };
  const company = { kind: 'company' };
  const account = { kind: 'trading_account', login: '5000001', environment: 'live' };
  const ends: Record<string, [object, object]> = {
    deposit: [method, wallet],
    desk_credit: [company, wallet],
    withdrawal: [wallet, method],
    desk_debit: [wallet, company],
    transfer_to_account: [wallet, account],
    transfer_to_wallet: [account, wallet],
    commission_to_wallet: [{ ...wallet, walletKind: 'commission' }, wallet],
  };
  const [from, to] = ends[type] ?? [wallet, wallet];
  return {
    type,
    effect:
      type.startsWith('desk_') || type === 'deposit' || type === 'withdrawal'
        ? direction === 'deposit'
          ? 'in'
          : 'out'
        : 'internal',
    from,
    to,
    onward: null,
    origin: kind === 'payment' ? null : kind === 'commission_transfer' ? 'commission' : 'client',
    source: null,
    requestedBy: null,
    approvedBy: null,
    decidedBy: null,
    deskReason: null,
    deskReasonAr: null,
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  ...classified(
    (over['kind'] as string | undefined) ?? 'payment',
    (over['direction'] as string | undefined) ?? 'deposit',
    (over['provider'] as string | undefined) ?? 'whish',
  ),
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
  typeCounts: { all: 1, deposit: 1 },
  groupCounts: { all: 1, deposit: 1 },
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
  accounting: [],
  effects: [{ currency: 'USD', effect: 'in', bucket: 'settled', count: 1, total: '100.12345678' }],
  net: [{ currency: 'USD', total: '100.12345678' }],
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

  it('labels a transfer by what it IS, never as a bare withdrawal — and names both ends', async () => {
    // Wallet-side direction on a transfer is 'withdrawal', and printing that word would read as
    // money leaving the platform. The type says what it is; the route says from where to where.
    getTransactions.mockResolvedValue(
      page({
        items: [
          row({ id: 'tx-t', kind: 'transfer', direction: 'withdrawal', methodName: 'transfer' }),
        ],
      }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('To trading account')).toBeInTheDocument();
    expect(screen.getByText('MT5 5000001')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Withdrawal')).toBeNull();
  });

  it('names the desk’s own credit as the desk’s, never a client’s deposit or a machine key', async () => {
    getTransactions.mockResolvedValue(
      page({ items: [row({ provider: 'manual_admin', methodName: 'manual_admin' })] }),
    );
    renderWithProviders(<FinancialPage />);

    expect(await screen.findByText('Desk credit')).toBeInTheDocument();
    expect(screen.getByText('Company (desk)')).toBeInTheDocument();
    expect(screen.queryByText('manual_admin')).toBeNull();
  });

  it('shows an unfamiliar type verbatim instead of blank', async () => {
    getTransactions.mockResolvedValue(page({ items: [row({ type: 'cpa_bonus' })] }));
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
      Object.assign(new Error('not built'), {
        response: { status: 404, data: { code: 'ROUTE_NOT_FOUND' } },
      }),
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
  it('an accounting tab narrows the REQUEST to its types and resets the page', async () => {
    const user = userEvent.setup();
    searchParams.current = new URLSearchParams('page=3');
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByRole('button', { name: /^withdrawals/i }));

    await waitFor(() => {
      const last = getTransactions.mock.calls.at(-1)?.[0] as {
        type?: string;
        facet?: string;
        page?: number;
      };
      // The client's withdrawals and the desk's debits — never a wallet → MT5 transfer.
      expect(last.type).toBe('withdrawal,desk_debit');
      expect(last.facet).toBe('type');
      expect(last.page).toBe(1);
    });
    // The filter is a URL, so "every withdrawal" is a link, not a session.
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('group=withdrawal'), {
      scroll: false,
    });
  });

  it('type and state dropdowns reach the request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByLabelText('Type'));
    await user.click(await screen.findByRole('option', { name: 'Desk credit' }));
    await waitFor(() => {
      expect((getTransactions.mock.calls.at(-1)?.[0] as { type?: string }).type).toBe(
        'desk_credit',
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

  it('the summary shares the list’s filters, minus paging and the tab’s types', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);
    await screen.findByText('jane@client.test');

    await user.click(screen.getByLabelText('State'));
    await user.click(await screen.findByRole('option', { name: 'Pending' }));
    await user.click(screen.getByRole('button', { name: /^withdrawals/i }));

    await waitFor(() => {
      const last = getTransactionsSummary.mock.calls.at(-1)?.[0] as {
        state?: string;
        type?: string;
        limit?: number;
      };
      expect(last.state).toBe('pending');
      // …minus paging: the tiles describe the whole filtered set…
      expect(last.limit).toBeUndefined();
      // …and minus the types: Money in keeps its total while the Withdrawals tab is active.
      expect(last.type).toBeUndefined();
    });
  });
});

describe('the tiles render the server’s numbers', () => {
  it('shows the accounting group counts and the server’s settled totals per effect', async () => {
    getTransactions.mockResolvedValue(
      page({ groupCounts: { all: 12, deposit: 7, withdrawal: 3, transfer: 2 } }),
    );
    getTransactionsSummary.mockResolvedValue(
      summary({
        effects: [
          { currency: 'USD', effect: 'in', bucket: 'settled', count: 7, total: '1250.50000000' },
          { currency: 'USD', effect: 'out', bucket: 'settled', count: 3, total: '400.00000000' },
        ],
        net: [{ currency: 'USD', total: '850.50000000' }],
      }),
    );
    renderWithProviders(<FinancialPage />);

    // Totals as formatted SERVER strings — nothing on this page added decimal strings together.
    expect(await screen.findByText('$1,250.50')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByText('$850.50')).toBeInTheDocument();
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

  it('falls back to the Portal ID — never the uuid — when everything readable is hidden', async () => {
    getTransactions.mockResolvedValue(
      page({
        items: [row({ user: { id: '0b7d3c9e-4f21-48a6-9c05-2d8e11aa3f47', portalId: 1000245 } })],
        maskedFields: [
          'financial.user.email',
          'financial.user.firstName',
          'financial.user.lastName',
        ],
      }),
    );
    renderWithProviders(<FinancialPage />);

    // The Portal ID is unmaskable and is what remains; the uuid the row is
    // keyed on is not shown even here.
    expect(await screen.findByText('#1000245')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('0b7d3c9e');
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
    // It opens THIS withdrawal on the desk — never a search for the client's
    // email, which listed every request of theirs and put the address in a URL.
    expect(link).toHaveAttribute('href', '/transactions?open=tx-p');
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

describe('a payment only a person can settle — the attention flag', () => {
  const REASON = 'The platform REVERSED this deposit after it settled.';
  const flagged = (over: Record<string, unknown> = {}) =>
    row({
      id: 'tx-flag',
      needsAttention: true,
      attentionReason: REASON,
      user: {
        id: 'u-1',
        portalId: 1000245,
        email: 'jane@client.test',
        firstName: 'Jane',
        lastName: 'Client',
      },
      ...over,
    });

  it('badges the row with WHY, and marks it resolved with a note', async () => {
    getTransactions.mockResolvedValue(page({ items: [flagged()] }));
    resolveAttention.mockResolvedValue({ id: 'tx-flag', needsAttention: false });
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);

    const table = await screen.findByRole('table');
    expect(await within(table).findByText(REASON)).toBeInTheDocument();
    expect(within(table).getByText('Needs attention')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Actions for this movement' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark resolved' }));

    const dialog = await screen.findByRole('dialog', { name: 'Mark as resolved' });
    // What is being resolved, in the operator's terms: the money and the Portal ID.
    expect(
      within(dialog).getByText(/deposit of \$100\.12 for client #1000245/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(REASON)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Mark resolved' });
    // The API's own minimum — ten characters — stated before the click.
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('What did you find?'),
      '  Checked: a duplicate.  ',
    );
    await user.click(confirm);

    await waitFor(() =>
      expect(resolveAttention).toHaveBeenCalledWith('tx-flag', 'Checked: a duplicate.'),
    );
    // The badge and the filter are the SERVER's — the list is asked again.
    await waitFor(() => expect(getTransactions.mock.calls.length).toBeGreaterThan(1));
  });

  it('keeps the refusal on screen — "somebody resolved it while you were looking"', async () => {
    getTransactions.mockResolvedValue(page({ items: [flagged()] }));
    resolveAttention.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: 'This payment no longer needs attention — somebody resolved it.' },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<FinancialPage />);

    const table = await screen.findByRole('table');
    await user.click(
      await within(table).findByRole('button', { name: 'Actions for this movement' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Mark resolved' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark as resolved' });
    await user.type(within(dialog).getByLabelText('What did you find?'), 'Checked the dashboard.');
    await user.click(within(dialog).getByRole('button', { name: 'Mark resolved' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Mark as resolved' })).toBeInTheDocument();
  });

  it('offers it only to an operator holding the key the DIRECTION needs', async () => {
    // A deposit needs deposits.approve; this operator can settle payouts only.
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'deposits.approve');
    getTransactions.mockResolvedValue(page({ items: [flagged()] }));
    renderWithProviders(<FinancialPage />);

    const table = await screen.findByRole('table');
    await within(table).findByText(REASON);
    // The badge still says so; the action is withheld — a button that 403s is
    // worse than no button, and this row has no other action to offer.
    expect(within(table).queryByRole('button', { name: 'Actions for this movement' })).toBeNull();
  });

  it('narrows to flagged payments from the URL — where a task link lands — and toggles off', async () => {
    const user = userEvent.setup();
    searchParams.current = new URLSearchParams('userId=1000245&attention=true');
    renderWithProviders(<FinancialPage />);

    await waitFor(() =>
      expect(getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '1000245', attention: 'true' }),
        expect.anything(),
      ),
    );
    const toggle = screen.getByRole('button', { name: 'Needs attention' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(replace).toHaveBeenLastCalledWith(expect.not.stringContaining('attention'), {
      scroll: false,
    });
  });
});
