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
const { getTradingAccounts, fundTradingAccount } = vi.hoisted(() => ({
  getTradingAccounts: vi.fn(),
  fundTradingAccount: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getTradingAccounts, fundTradingAccount } };
  return { api, default: api };
});

/*
 * The acting operator's keys, mutable per test — what this screen RENDERS is a
 * function of them, so a test has to be able to state which it means. Left
 * unmocked, `useAdmin()` answers null and every gated control silently vanishes,
 * which is how the old "no write actions" assertion passed against a screen that
 * had them.
 */
const identity = { permissions: [] as string[] };

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      name: 'Trading Operator',
      email: 'ops@oxshare.com',
      role: 'sub_admin',
      get permissions() {
        return identity.permissions;
      },
    },
  }),
}));

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
    // `product` replaced `tier`, which had no writer and was therefore null on
    // every row the API ever served.
    product: 'Standard',
    leverage: 500,
    status: 'active',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    user: {
      id: 'u-1',
      portalId: 1000245,
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
  // Read-only by default: the money controls are opt-in per test.
  identity.permissions = ['trading.view'];
  searchParams.current = new URLSearchParams();
  snapshot += 1;
  listeners.clear();
  getTradingAccounts.mockResolvedValue(page([account()]));
});

describe('trading accounts — the money rule', () => {
  /**
   * ⚠️ The rule is "FORMATTED, never coerced". It was "verbatim", and rendering
   * the raw column meant every balance read `1000.00000000` in a list an
   * operator scans to compare accounts.
   *
   * The assertion is a value a FLOAT CANNOT HOLD, because that is precisely the
   * risk formatting introduces: `Number('12345678901234567.89012345')` is
   * `12345678901234568`, wrong before any rounding begins. decimal.js keeps the
   * digits, so the output ends `...567.89` and the float's `...568.00` appears
   * nowhere on the page.
   */
  it('formats without coercing — a value no float could hold survives', async () => {
    getTradingAccounts.mockResolvedValue(
      page([account({ balance: '12345678901234567.89012345' })]),
    );
    renderWithProviders(<TradingAccountsPage />);

    expect(await screen.findByText('$12,345,678,901,234,567.89')).toBeInTheDocument();
    expect(screen.queryByText('$12,345,678,901,234,568.00')).toBeNull();
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
      Object.assign(new Error('nope'), {
        response: { status: 404, data: { code: 'ROUTE_NOT_FOUND' } },
      }),
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

  /*
   * The Client column on this screen names the owner — email, and a name when
   * there is one. Its filter used to take `userId` and NOTHING else: a uuid
   * that appears nowhere on the page, so narrowing to the client whose row you
   * were reading meant leaving for /clients to copy an id. A filter has to
   * accept the identifiers its own screen prints.
   */
  it('narrows to a client by the identifiers the screen shows, not by a uuid', async () => {
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.type(screen.getByRole('searchbox'), 'alexandra');

    await waitFor(
      () => {
        const params = getTradingAccounts.mock.calls.at(-1)?.[0] as { q?: string };
        expect(params.q).toBe('alexandra');
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole('searchbox')).toHaveValue('alexandra');
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

/*
 * ── The write actions, and the permissions that decide they exist ──
 *
 * This block used to assert the OPPOSITE — "offers no per-row action menu" —
 * on the reasoning that `AdminHoldingsController` exposes reads only. That
 * stopped being true when `Mt5AccountsController` landed: the screen now opens
 * MT5 accounts and moves their balances.
 *
 * It kept passing for a reason worth recording, because it is how a stale
 * assertion survives a change it contradicts: `useAdmin()` was never mocked, so
 * `admin` was null, so every `hasPermission` answered false and nothing
 * rendered. The test asserted an absence it had itself caused, and the two
 * money controls on this screen had no coverage at all.
 *
 * The identity is stated per test now, which is the point: what renders here is
 * a function of the operator's keys, so a test has to say which keys it means.
 */
describe('trading accounts — the write actions are permission-gated', () => {
  it('offers no row menu and no open-account button to a read-only operator', async () => {
    identity.permissions = ['trading.view'];
    searchParams.current = new URLSearchParams('userId=u-1');
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    expect(screen.queryByRole('button', { name: /open a trading account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /actions for account/i })).toBeNull();
  });

  /*
   * `trading.create` alone. The row menu is gated on the DEPOSIT/WITHDRAW keys,
   * so it must stay absent — opening an account and moving money on one are
   * different privileges and the screen has to keep them apart.
   *
   * `?userId=` is set because the button only exists on a client-filtered view:
   * an account is opened FOR somebody, and the unfiltered list has no answer to
   * "for whom".
   */
  it('offers opening an account, but not moving money, on trading.create', async () => {
    identity.permissions = ['trading.view', 'trading.create'];
    searchParams.current = new URLSearchParams('userId=u-1');
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    expect(screen.getByRole('button', { name: /open a trading account/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for account/i })).toBeNull();
  });

  /*
   * ⚠️ `trading.deposit` ALONE IS NO LONGER ENOUGH, and this case used to
   * assert the opposite.
   *
   * It passed against the dealer balance dialog, which moved the MT5 figure on
   * `trading.deposit` with no wallet leg. That dialog is gone: a deposit now
   * mints into the client's wallet before transferring, so it needs
   * `wallets.credit` too, and an operator holding neither that nor
   * `trading.withdraw` can move no money at all.
   *
   * The menu is therefore OMITTED rather than rendered empty — `RowActions`
   * states the rule, and a menu whose only item explains why it cannot be used
   * is worse than its absence.
   */
  it('offers no money action on trading.deposit alone, and no open-account button', async () => {
    identity.permissions = ['trading.view', 'trading.deposit'];
    searchParams.current = new URLSearchParams('userId=u-1');
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    expect(screen.queryByRole('button', { name: /actions for account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open a trading account/i })).toBeNull();
  });

  it('offers the money action once wallets.credit is held alongside it', async () => {
    identity.permissions = ['trading.view', 'trading.deposit', 'wallets.credit'];
    searchParams.current = new URLSearchParams('userId=u-1');
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    expect(screen.getByRole('button', { name: /actions for account/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open a trading account/i })).toBeNull();
  });
});

/**
 * The ONE money control on this screen, in both directions.
 *
 * ## What these pin, and why each one exists
 *
 * There used to be TWO row actions: this and a dealer "Adjust balance on MT5"
 * that moved the MT5 figure with no wallet leg and no ledger entry. They were
 * consolidated because an operator cannot be asked to choose correctly between
 * two controls that visibly do the same thing, and the unrecorded one moved
 * money nothing could afterwards explain.
 *
 * So the cases below pin the consolidation itself: ONE action in the menu, both
 * directions inside it, the asymmetric permissions that gate them, and the
 * half-done deposit reported as money in the wallet rather than as a failure.
 */
describe('moving money on a trading account', () => {
  beforeEach(() => {
    fundTradingAccount.mockReset();
    searchParams.current = new URLSearchParams('userId=u-1');
  });

  /*
   * THE CONSOLIDATION, asserted by absence. The dealer dialog is gone, so its
   * label must not be anywhere in the menu — if somebody reinstates it, this is
   * what says so rather than a reviewer noticing two similar items.
   */
  it('offers one money action, and no dealer balance item', async () => {
    getTradingAccounts.mockResolvedValue(page([account()]));
    identity.permissions = ['trading.view', 'trading.deposit', 'wallets.credit'];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.click(screen.getByRole('button', { name: /actions for account/i }));

    expect(await screen.findByText(/add or remove funds/i)).toBeInTheDocument();
    expect(screen.queryByText(/adjust balance on mt5/i)).toBeNull();
  });

  /*
   * A DEPOSIT mints balance before it moves it, so `trading.deposit` alone is
   * not enough — without `wallets.credit` the deposit button is disabled while
   * the action itself still opens, because the operator may hold withdraw.
   */
  it('disables the deposit direction without wallets.credit', async () => {
    getTradingAccounts.mockResolvedValue(page([account()]));
    identity.permissions = ['trading.view', 'trading.withdraw'];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.click(screen.getByRole('button', { name: /actions for account/i }));
    await userEvent.click(await screen.findByText(/add or remove funds/i));

    // Opens on WITHDRAW, the direction this operator can actually use — rather
    // than on a disabled deposit, which reads as the feature being broken.
    expect(await screen.findByRole('button', { name: /^deposit$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^withdraw$/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /remove funds/i })).toBeInTheDocument();
  });

  /*
   * A WITHDRAWAL mints nothing, so requiring `wallets.credit` for it would mean
   * granting the power to create money in order to take some away.
   */
  it('disables the withdraw direction without trading.withdraw', async () => {
    getTradingAccounts.mockResolvedValue(page([account()]));
    identity.permissions = ['trading.view', 'trading.deposit', 'wallets.credit'];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.click(screen.getByRole('button', { name: /actions for account/i }));
    await userEvent.click(await screen.findByText(/add or remove funds/i));

    expect(await screen.findByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^deposit$/i })).toBeEnabled();
  });

  /*
   * Neither direction is offered on a DEMO account: practice money has no
   * wallet and no ledger to record a movement against, the server refuses it,
   * and there is no longer a dealer control to fall back on. A client tops up
   * their own demo account from the portal.
   */
  it('offers no money action at all on a demo account', async () => {
    getTradingAccounts.mockResolvedValue(page([account({ environment: 'demo' })]));
    identity.permissions = [
      'trading.view',
      'trading.deposit',
      'wallets.credit',
      'trading.withdraw',
    ];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    // The row menu is omitted rather than rendered empty — a menu with nothing
    // in it is a control that looks broken rather than absent.
    expect(screen.queryByRole('button', { name: /actions for account/i })).toBeNull();
  });

  /*
   * The amount travels as the STRING the operator typed, the direction travels
   * beside it UNSIGNED, and no currency is sent — the server derives it from
   * the account, because transfers do not convert.
   */
  it('sends the typed amount, the direction, and no currency', async () => {
    getTradingAccounts.mockResolvedValue(page([account()]));
    fundTradingAccount.mockResolvedValue({
      transaction: { id: 'tx-1', amount: '250.50000000', currency: 'USD' },
      replayed: false,
      transfer: { id: 'tr-1', state: 'settled' },
      transferError: null,
    });
    identity.permissions = ['trading.view', 'trading.deposit', 'wallets.credit'];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.click(screen.getByRole('button', { name: /actions for account/i }));
    await userEvent.click(await screen.findByText(/add or remove funds/i));

    await userEvent.type(await screen.findByLabelText(/amount/i), '250.5');
    await userEvent.type(screen.getByLabelText(/reason/i), 'Off-rail wire received');
    await userEvent.click(screen.getByRole('button', { name: /^add funds$/i }));

    await waitFor(() => expect(fundTradingAccount).toHaveBeenCalledTimes(1));
    const [id, body] = fundTradingAccount.mock.calls[0]!;
    expect(id).toBe('ta-1');
    expect(body).toEqual({
      amount: '250.5',
      reason: 'Off-rail wire received',
      direction: 'deposit',
    });
    expect(body).not.toHaveProperty('currency');
  });

  /*
   * WITHDRAW sends the same unsigned amount with the other direction. The sign
   * is the server's to apply, once — two sources of truth for a direction is
   * how a withdrawal becomes a deposit.
   */
  it('sends withdraw with an unsigned amount', async () => {
    getTradingAccounts.mockResolvedValue(page([account()]));
    fundTradingAccount.mockResolvedValue({
      transaction: null,
      replayed: false,
      transfer: { id: 'tr-2', state: 'settled' },
      transferError: null,
      destination: 'wallet',
    });
    identity.permissions = ['trading.view', 'trading.withdraw'];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.click(screen.getByRole('button', { name: /actions for account/i }));
    await userEvent.click(await screen.findByText(/add or remove funds/i));

    await userEvent.type(await screen.findByLabelText(/amount/i), '100');
    await userEvent.type(screen.getByLabelText(/reason/i), 'Reversing the duplicate credit');
    await userEvent.click(screen.getByRole('button', { name: /remove funds/i }));

    await waitFor(() => expect(fundTradingAccount).toHaveBeenCalledTimes(1));
    const [, body] = fundTradingAccount.mock.calls[0]!;
    expect(body.direction).toBe('withdraw');
    // UNSIGNED — the server derives the sign from the direction.
    expect(body.amount).toBe('100');
  });

  /*
   * ⚠️ THE HALF-DONE CASE, and it must not read as a failure.
   *
   * A failed onward transfer does NOT unwind the deposit, so the money is in
   * the client's wallet. Telling the operator it failed would send them to fund
   * it again — which would work, and would credit the client twice.
   */
  it('says the money is in the wallet when the transfer leg did not complete', async () => {
    getTradingAccounts.mockResolvedValue(page([account()]));
    fundTradingAccount.mockResolvedValue({
      transaction: { id: 'tx-1', amount: '250.00000000', currency: 'USD' },
      replayed: false,
      transfer: null,
      transferError: 'The MT5 bridge is not reachable.',
    });
    identity.permissions = ['trading.view', 'trading.deposit', 'wallets.credit'];
    renderWithProviders(<TradingAccountsPage />);
    await screen.findByText('client@example.com');

    await userEvent.click(screen.getByRole('button', { name: /actions for account/i }));
    await userEvent.click(await screen.findByText(/add or remove funds/i));

    await userEvent.type(await screen.findByLabelText(/amount/i), '250');
    await userEvent.type(screen.getByLabelText(/reason/i), 'Off-rail wire received');
    await userEvent.click(screen.getByRole('button', { name: /^add funds$/i }));

    // The wallet is named as holding the money, and the bridge's own reason is
    // quoted rather than replaced by a generic failure.
    expect(await screen.findByText(/in the client wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/bridge is not reachable/i)).toBeInTheDocument();
  });
});
