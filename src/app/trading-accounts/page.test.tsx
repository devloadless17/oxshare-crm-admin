import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import TradingAccountsPage from './page';
import type { TradingAccountListResponse, TradingAccountRow } from '@/lib/api/admin';

/**
 * The trading-account list.
 *
 * Two contracts are pinned here that nothing else in the app enforces:
 *
 *  - `balance` is a decimal STRING and reaches the DOM as the string the API
 *    sent (§6.1).
 *  - `login` is a STRING and is NULLABLE. Leading zeros are significant to the
 *    MT5 bridge, so it must never be parsed; and NULL means MetaTrader has not
 *    issued one yet, which is a state rather than a missing value.
 */

/*
 * BOTH the named and the default export — see admin/CLAUDE.md. Mocking only
 * `default` leaves the named `api` undefined, the page throws on first use and
 * its own catch turns that into a generic "failed to load", which reads as a
 * broken query rather than a broken mock.
 */
const { getTradingAccounts } = vi.hoisted(() => ({ getTradingAccounts: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { getTradingAccounts } };
  return { api, default: api };
});

/*
 * Filters, sort and page live in the URL, so `replace` must feed back into
 * `useSearchParams` AND schedule a re-render — a spy that only recorded would
 * freeze every URL-controlled input at its initial value. Same shape as
 * `audit-log/page.test.tsx`.
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
    usePathname: () => '/trading-accounts',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

/** Typed against the generated schema, so an invented field is a compile error. */
function account(over: Partial<TradingAccountRow> = {}): TradingAccountRow {
  return {
    id: 'ta-1',
    login: '5001234',
    mt5Group: 'real\\Standard',
    environment: 'live',
    currency: 'USD',
    balance: '1000.00000000',
    tier: null,
    leverage: 500,
    status: 'active',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    user: {
      id: 'u-1',
      email: 'client@example.com',
      firstName: 'Dana',
      lastName: 'Haddad',
    },
    ...over,
  };
}

function page(items: TradingAccountRow[], total = items.length): TradingAccountListResponse {
  return { items, nextCursor: null, total, page: 1, limit: 25 };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  snapshot += 1;
  listeners.clear();
  getTradingAccounts.mockResolvedValue(page([account()]));
});

describe('trading accounts — the money rule', () => {
  it('renders the balance as the exact string the API sent', async () => {
    getTradingAccounts.mockResolvedValue(
      page([account({ balance: '12345678901234567.89012345' })]),
    );
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText('12345678901234567.89012345')).toBeInTheDocument();
  });
});

describe('trading accounts — the MT5 login', () => {
  /**
   * A login is an IDENTIFIER, not a quantity. `Number('0005001234')` is 5001234,
   * and the bridge would not recognise it — so the leading zeros have to survive
   * all the way to the DOM.
   */
  it('keeps a login with leading zeros intact', async () => {
    getTradingAccounts.mockResolvedValue(page([account({ login: '0005001234' })]));
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText('0005001234')).toBeInTheDocument();
  });

  /**
   * NULL is legitimate — MT5 has not issued a login yet. An em-dash or a blank
   * cell reads as a rendering fault; naming the state says which of the two it
   * is.
   */
  it('says a login is unassigned rather than leaving the cell blank', async () => {
    getTradingAccounts.mockResolvedValue(page([account({ login: null })]));
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText(/not assigned/i)).toBeInTheDocument();
  });

  it('says leverage is unset when the bridge has not assigned a group', async () => {
    getTradingAccounts.mockResolvedValue(page([account({ leverage: null })]));
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText(/not set/i)).toBeInTheDocument();
  });
});

describe('trading accounts — listing', () => {
  it('shows the account with its owner and environment', async () => {
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText('client@example.com')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('asks for a bounded first page', async () => {
    renderWithProviders(<TradingAccountsPage />);

    await waitFor(() => expect(getTradingAccounts).toHaveBeenCalled());
    const params = getTradingAccounts.mock.calls[0]?.[0] as { limit: number; page: number };
    expect(params.limit).toBe(25);
    expect(params.page).toBe(1);
  });

  it('offers a retry when the list cannot be loaded', async () => {
    getTradingAccounts.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the endpoint when the API is not built yet', async () => {
    getTradingAccounts.mockRejectedValue(
      Object.assign(new Error('nope'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText(/\/admin\/trading-accounts/)).toBeInTheDocument();
  });
});

describe('trading accounts — the empty state keeps the table', () => {
  it('keeps the column headers and the pager when nothing matches', async () => {
    getTradingAccounts.mockResolvedValue(page([], 0));
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText(/no trading accounts/i)).toBeInTheDocument();
    // The frame survives: headers above, pager below, so the page does not
    // change shape between loading, empty and has-rows.
    expect(screen.getByRole('columnheader', { name: /mt5 login/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /balance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});

describe('trading accounts — filtering and sorting reach the API', () => {
  it('sends the chosen environment to the API rather than filtering on screen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');
    getTradingAccounts.mockClear();

    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Demo' }));

    await waitFor(() => {
      const params = getTradingAccounts.mock.calls.at(-1)?.[0] as { environment?: string };
      expect(params.environment).toBe('demo');
    });
  });

  it('sends the chosen status to the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');
    getTradingAccounts.mockClear();

    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(await screen.findByRole('option', { name: 'Suspended' }));

    await waitFor(() => {
      const params = getTradingAccounts.mock.calls.at(-1)?.[0] as { status?: string };
      expect(params.status).toBe('suspended');
    });
  });

  /**
   * An unrecognised value in a hand-edited URL must not become a filter. R-2.5
   * makes the endpoint answer one with a 400, on a link an operator may have
   * pasted from somewhere — so the page narrows it away instead.
   */
  it('ignores an environment the API does not define', async () => {
    searchParams.current = new URLSearchParams({ environment: 'production' });
    renderWithProviders(<TradingAccountsPage />);

    await waitFor(() => expect(getTradingAccounts).toHaveBeenCalled());
    const params = getTradingAccounts.mock.calls[0]?.[0] as { environment?: string };
    expect(params.environment).toBeUndefined();
  });

  it('asks the API to sort by balance rather than reordering the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');
    getTradingAccounts.mockClear();

    await user.click(screen.getByRole('button', { name: /balance/i }));

    await waitFor(() => {
      const params = getTradingAccounts.mock.calls.at(-1)?.[0] as {
        sort?: string;
        order?: string;
      };
      expect(params.sort).toBe('balance');
      expect(params.order).toBe('asc');
    });
  });

  /**
   * `leverage` is absent from the endpoint's sort allowlist, so the header must
   * not offer to sort by it — R-2.5 would answer the request with a 400 rather
   * than a silent fallback, replacing rows with an error page.
   */
  it('does not offer to sort by a column the endpoint has no key for', async () => {
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    const leverage = screen.getByRole('columnheader', { name: /leverage/i });
    expect(leverage.querySelector('button')).toBeNull();
  });
});

describe('trading accounts — no write actions', () => {
  /**
   * MetaTrader is the system of record for logins, groups and leverage
   * (ARCHITECTURE §1), and `AdminHoldingsController` exposes reads only. A row
   * menu here would have to invent its entries.
   */
  it('offers no per-row action menu', async () => {
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    expect(screen.queryByRole('columnheader', { name: /actions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /suspend|close|edit/i })).toBeNull();
  });
});
