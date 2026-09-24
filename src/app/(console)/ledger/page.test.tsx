import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import LedgerPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * ADM-13 — the append-only ledger screen.
 *
 * ## What this file exists to pin
 *
 * The ledger is the evidence an operator reads when reconciliation says the
 * books do not balance, so every case here is about it telling the truth about
 * money and about its own completeness:
 *
 *  - amounts and running balances are STRINGS all the way to the DOM (§6.1).
 *    `Number('12345678901234567.89')` is already wrong before formatting, and a
 *    running balance is exactly the column where that lands.
 *  - a filtered view must not be mistakable for the whole platform. An operator
 *    chasing a shortfall who believes they are looking at everything, and is
 *    not, draws the wrong conclusion.
 *  - there are NO write controls. `ledger_entries` is append-only and a database
 *    trigger refuses UPDATE and DELETE; a screen offering an edit would teach an
 *    operator something false about the system.
 */
const { getLedger } = vi.hoisted(() => ({ getLedger: vi.fn() }));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getLedger } };
  return { api, default: api };
});

/*
 * A minimal app-router stand-in.
 *
 * `useTableQueryState` reads the URL and writes filters back through
 * `router.replace`, so without this the page throws "invariant expected app
 * router to be mounted" before it renders a row. The store is external and the
 * snapshot is a counter, because React only re-renders on a CHANGED snapshot
 * and a fresh `URLSearchParams` identity does not qualify — the same shape
 * `clients/page.test.tsx` established.
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
    usePathname: () => '/ledger',
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

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'led-1',
  walletId: 'w-1',
  userId: '11111111-1111-1111-1111-111111111111',
  amount: '250.00000000',
  balanceAfter: '1250.00000000',
  currency: 'USD',
  entryType: 'deposit',
  referenceType: 'transaction',
  referenceId: 'txn-9',
  createdAt: '2026-08-20T10:00:00.000Z',
  ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  items: [entry()],
  nextCursor: null,
  total: 1,
  page: 1,
  limit: 25,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  permissions.current = ALL_PERMISSIONS;
  getLedger.mockResolvedValue(page());
});

describe('what the ledger shows', () => {
  it('lists an entry with its amount and the balance it produced', async () => {
    renderWithProviders(<LedgerPage />);

    // EXACT strings. `/250\.00/` matches both the amount and the balance —
    // `$250.00` and `$1,250.00` — so a loose matcher finds two nodes and reports
    // an ambiguity that reads like a rendering bug.
    expect(await screen.findByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText('$1,250.00')).toBeInTheDocument();
  });

  it('renders the amount from the STRING, not a coerced number', async () => {
    // A balance past 2^53 is the case that proves it: if anything on this path
    // called Number(), the last digits would change on the way to the DOM.
    getLedger.mockResolvedValue(
      page({
        items: [entry({ amount: '12345678901234567.89', balanceAfter: '12345678901234567.89' })],
      }),
    );
    renderWithProviders(<LedgerPage />);

    // Both cells hold it, so this is findAll — the point is the DIGITS, which a
    // Number() anywhere on the path would have changed.
    expect(await screen.findAllByText('$12,345,678,901,234,567.89')).toHaveLength(2);
  });

  it('names the entry type rather than showing a raw enum value', async () => {
    renderWithProviders(<LedgerPage />);
    expect(await screen.findByText('Deposit')).toBeInTheDocument();
  });

  it('shows an unfamiliar entry type verbatim instead of blank', async () => {
    // A type the API grows before this screen learns it. A blank cell reads as
    // missing data; the raw value is at least true.
    getLedger.mockResolvedValue(page({ items: [entry({ entryType: 'clawback' })] }));
    renderWithProviders(<LedgerPage />);

    expect(await screen.findByText('clawback')).toBeInTheDocument();
  });

  it('says the list is empty rather than rendering a blank table', async () => {
    getLedger.mockResolvedValue(page({ items: [], total: 0 }));
    renderWithProviders(<LedgerPage />);

    expect(await screen.findByText(/no ledger entries/i)).toBeInTheDocument();
  });

  it('offers a retry when the ledger cannot be loaded', async () => {
    // Not an empty state: "we could not read it" and "there is nothing" are
    // different answers, and only one of them means the books are fine.
    getLedger.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<LedgerPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no ledger entries/i)).toBeNull();
  });
});

describe('filtering', () => {
  it('asks the SERVER for the entry type, not the browser', async () => {
    // Filtering one page client-side would show "no deposits" whenever the
    // deposits happen to be on page two — on a reconciliation screen that is a
    // wrong answer, not a slow one.
    const user = userEvent.setup();
    renderWithProviders(<LedgerPage />);
    await screen.findByText('$250.00');

    await user.click(screen.getByLabelText(/entry type/i));
    await user.click(await screen.findByRole('option', { name: 'Payout' }));

    const last = getLedger.mock.calls.at(-1)?.[0] as { entryType?: string };
    expect(last.entryType).toBe('payout');
  });

  it('offers every entry type the column can hold', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LedgerPage />);
    await screen.findByText('$250.00');

    await user.click(screen.getByLabelText(/entry type/i));
    for (const label of ['Deposit', 'Withdrawal', 'Commission', 'Rebate', 'Payout', 'Adjustment']) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  /*
   * The Client column names the client — first name, last name, email. Until
   * this landed, the only way to narrow the ledger to a person was `userId`, a
   * uuid the screen prints NOWHERE: half the screen spoke in names and the
   * other half demanded an id, so narrowing to the client you were reading
   * about meant leaving for /clients to copy a uuid and coming back.
   */
  it('narrows to a client by the NAME the screen shows, not by a uuid', async () => {
    renderWithProviders(<LedgerPage />);
    await screen.findByText('$250.00');

    await userEvent.type(screen.getByRole('searchbox'), 'alexandra');

    await waitFor(() => expect(getLedger.mock.calls.at(-1)?.[0]?.q).toBe('alexandra'), {
      timeout: 3000,
    });
    expect(screen.getByRole('searchbox')).toHaveValue('alexandra');
  });

  it('asks the SERVER to search, rather than filtering the page in the browser', async () => {
    // Same reason as the entry-type filter above: a client-side match over the
    // twenty-five rows on screen answers "this client has no movements" from a
    // slice, which on a reconciliation screen is a wrong answer, not a slow one.
    renderWithProviders(<LedgerPage />);
    await screen.findByText('$250.00');

    const before = getLedger.mock.calls.length;
    await userEvent.type(screen.getByRole('searchbox'), 'alexandra');

    await waitFor(() => expect(getLedger.mock.calls.length).toBeGreaterThan(before), {
      timeout: 3000,
    });
  });

  it('asks for a bounded page rather than the whole table', async () => {
    // §5 names unindexed filters and unbounded reads as the admin-table risk,
    // and the ledger is the largest table in the system.
    renderWithProviders(<LedgerPage />);
    await screen.findByText('$250.00');

    const first = getLedger.mock.calls[0]?.[0] as { limit?: number };
    expect(first.limit).toBeGreaterThan(0);
    expect(first.limit).toBeLessThanOrEqual(100);
  });
});

describe('the ledger never offers to change itself', () => {
  it('draws no edit or delete control on any row', async () => {
    // `ledger_entries` is append-only and a TRIGGER refuses UPDATE and DELETE
    // (§6.4). A correction is a compensating entry, so there is nothing here to
    // edit — and a disabled button would still imply there was.
    renderWithProviders(<LedgerPage />);
    await screen.findByText('$250.00');

    const table = screen.getByRole('table');
    expect(within(table).queryByRole('button', { name: /edit|delete|remove/i })).toBeNull();
  });
});

describe('whose money each row is', () => {
  /*
   * This column is headed "Client" and rendered `r.userId` — a raw uuid — on
   * the screen an operator opens precisely to ask whose money a movement is.
   * `/wallets` and `/trading-accounts` have shown a named Owner all along.
   */
  it('names the client rather than printing a uuid', async () => {
    getLedger.mockResolvedValue(
      page({
        items: [
          entry({
            userFirstName: 'Nadia',
            userLastName: 'Haddad',
            userEmail: 'nadia@example.com',
          }),
        ],
      }),
    );

    renderWithProviders(<LedgerPage />);

    expect(await screen.findByText('Nadia Haddad')).toBeInTheDocument();
    expect(screen.getByText('nadia@example.com')).toBeInTheDocument();
    // The uuid is no longer the thing identifying the person.
    expect(screen.queryByText('11111111-1111-1111-1111-111111111111')).not.toBeInTheDocument();
  });

  it('says so in words when the client record is GONE, rather than dropping the row', async () => {
    /*
     * NULL, not absent — the LEFT join's answer for an entry whose client row
     * has been removed, the Portal ID with it. `ledger_entries` is append-only,
     * so the row must still appear: a reconciliation that silently drops rows
     * is worse than one saying whose they were cannot be resolved. The uuid
     * stays on hover for forensics and is not printed.
     */
    getLedger.mockResolvedValue(
      page({
        items: [
          entry({ userFirstName: null, userLastName: null, userEmail: null, userPortalId: null }),
        ],
      }),
    );

    renderWithProviders(<LedgerPage />);

    const gone = await screen.findByText('Client no longer exists');
    expect(gone).toHaveAttribute('title', '11111111-1111-1111-1111-111111111111');
    expect(screen.queryByText('11111111-1111-1111-1111-111111111111')).toBeNull();
  });

  it('names a client by Portal ID beside their name, and by it alone when a role hides both', async () => {
    getLedger.mockResolvedValue(
      page({
        items: [
          entry({
            id: 'e-1',
            userFirstName: 'Ada',
            userLastName: 'Lovelace',
            userEmail: 'ada@client.test',
            userPortalId: 1000245,
          }),
          entry({
            id: 'e-2',
            userFirstName: undefined,
            userLastName: undefined,
            userEmail: undefined,
            userPortalId: 1000246,
          }),
        ],
      }),
    );

    renderWithProviders(<LedgerPage />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('#1000245')).toBeInTheDocument();
    expect(screen.getByText('#1000246')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('11111111-1111-1111-1111-111111111111');
  });

  it('says ONCE which columns a role hides, instead of a chip in every row', async () => {
    /*
     * Masked fields arrive ABSENT — `maskByShape` removes the key rather than
     * blanking it — so without this notice a masked operator sees a uuid and
     * cannot tell "your role hides this" from "this client has no name". The
     * per-row redaction chip is deliberately NOT used on a list; `/clients`
     * settled that, because fifty identical chips spend space on one fact.
     */
    getLedger.mockResolvedValue(
      page({
        items: [entry()],
        maskedFields: ['client.email', 'client.firstName'],
      }),
    );

    renderWithProviders(<LedgerPage />);

    expect(await screen.findByRole('note')).toBeInTheDocument();
  });
});
