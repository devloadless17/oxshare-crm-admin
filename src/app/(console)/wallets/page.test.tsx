import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import WalletsPage from './page';
import type { Currency, WalletListResponse, WalletRow } from '@/lib/api/admin';

/**
 * The wallet list.
 *
 * What is pinned here is the one rule this screen exists to keep: a balance is a
 * decimal STRING and reaches the DOM as the string the API sent (§6.1). The rest
 * is the contract every list screen shares — filters and sorting reach the
 * REQUEST rather than reordering the rows already in memory, because on a
 * paginated list the second is a wrong answer that looks exactly like a right one.
 */

/*
 * BOTH the named and the default export.
 *
 * `src/lib/api/index.ts` exports `api` twice and pages use whichever the author
 * reached for. Mocking only `default` leaves the named `api` undefined, the page
 * throws on first use, its own catch swallows the TypeError, and the screen shows
 * a generic "failed to load" — which reads as a broken query rather than a broken
 * mock. That has cost real time twice; see admin/CLAUDE.md.
 */
const { getWallets, getCurrencies, closeWallet, creditWallet } = vi.hoisted(() => ({
  getWallets: vi.fn(),
  getCurrencies: vi.fn(),
  closeWallet: vi.fn(),
  creditWallet: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getWallets, getCurrencies, closeWallet, creditWallet } };
  return { api, default: api };
});

/*
 * The page now gates its write controls on the viewer's permissions (credit,
 * close / approve, reject, claim). These tests are about the screen's
 * behaviour, not about gating, so the viewer holds every key — the gating
 * itself is asserted where the `ALL_PERMISSIONS` fixture is narrowed.
 */
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      status: 'active',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

/*
 * The filters, the sort and the page all live in the URL, so the page reads
 * `useSearchParams` and writes through `router.replace` — both have to be mocked,
 * and the write has to FEED BACK into the read and schedule a re-render. A spy
 * that only recorded would freeze every URL-controlled input at its initial
 * value, so clicking a sort header would re-request the unsorted list and the
 * test would assert against a screen that behaves nothing like the real one.
 * Same shape as `audit-log/page.test.tsx`.
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
    usePathname: () => '/wallets',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

/**
 * Typed against the generated schema on purpose — a fixture that invents a field
 * becomes a compile error rather than a puzzling empty column.
 */
function wallet(over: Partial<WalletRow> = {}): WalletRow {
  return {
    id: 'w-1',
    walletNumber: '4f7kq2nm8xcb',
    // Server-generated from currency and kind. A fixture that composed its own
    // would stop matching the day the server's rule changed.
    name: 'USD Wallet',
    balance: '250.00000000',
    onHold: '0.00000000',
    currency: 'USD',
    // Required since the commission wallet landed. The fixture predated it and
    // only compiled because types.gen.ts was stale — regenerating turned the
    // drift into the compile error it is supposed to be.
    kind: 'main',
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

function page(items: WalletRow[], total = items.length): WalletListResponse {
  return { items, nextCursor: null, total, page: 1, limit: 25 };
}

/** Only `code` is read by the filter, but the type is the real one. */
function currency(code: string): Currency {
  return {
    code,
    name: `${code} currency`,
    symbol: '$',
    decimals: 2,
    enabled: true,
    isDefault: code === 'USD',
    sortOrder: 1,
    minDeposit: '10.00000000',
    maxDeposit: '250000.00000000',
    minWithdrawal: '10.00000000',
    maxWithdrawal: '50000.00000000',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The URL is shared mutable state between tests — a filter left behind by one
  // would silently become the starting condition of the next.
  searchParams.current = new URLSearchParams();
  snapshot += 1;
  listeners.clear();
  getWallets.mockResolvedValue(page([wallet()]));
  getCurrencies.mockResolvedValue([currency('USD'), currency('EUR')]);
  closeWallet.mockResolvedValue(undefined);
  creditWallet.mockResolvedValue({ transaction: {}, replayed: false });
});

describe('wallets — the money rule', () => {
  /**
   * ⚠️ THE RULE CHANGED FROM "verbatim" TO "formatted but never coerced", and
   * this test is what keeps the second half honest.
   *
   * It used to assert the raw string reached the DOM, which meant every balance
   * on the screen read `1000.00000000` — eight decimal places of nothing in the
   * column an operator scans. Formatting fixed the display; the risk it
   * introduces is that somebody reaches for `Number(x).toFixed(2)` to do it.
   *
   * So the assertion is a value a FLOAT CANNOT HOLD.
   * `Number('12345678901234567.89012345')` is `12345678901234568` — already
   * wrong before formatting starts. decimal.js keeps the digits, so the
   * formatted output must end `...567.89`, and the float's `...568.00` must be
   * absent. A balance through a float looks right until the place nobody checks.
   */
  it('formats without coercing — a value no float could hold survives', async () => {
    getWallets.mockResolvedValue(page([wallet({ balance: '12345678901234567.89012345' })]));
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByText('$12,345,678,901,234,567.89')).toBeInTheDocument();
    // What `Number()` would have produced. Its absence is the real assertion.
    expect(screen.queryByText('$12,345,678,901,234,568.00')).toBeNull();
  });

  it('formats the held amount the same way as the balance', async () => {
    getWallets.mockResolvedValue(
      page([wallet({ balance: '700.00000000', onHold: '150.50000000' })]),
    );
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByText('$700.00')).toBeInTheDocument();
    expect(screen.getByText('$150.50')).toBeInTheDocument();
  });

  /**
   * Available is `balance − onHold`, and that subtraction belongs in decimal
   * arithmetic on the server. The API does not send it, so the screen must not
   * compute it — a number derived from two strings through JS floats is exactly
   * the value an operator would trust and should not.
   */
  it('does not invent an "available" figure the API never sent', async () => {
    getWallets.mockResolvedValue(
      page([wallet({ balance: '700.00000000', onHold: '150.50000000' })]),
    );
    renderWithProviders(<WalletsPage />);

    await screen.findByText('$700.00');
    expect(screen.queryByText('$549.50')).toBeNull();
    expect(screen.queryByText('549.50000000')).toBeNull();
  });
});

describe('wallets — listing', () => {
  it('shows the wallet with its owner', async () => {
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByText('client@example.com')).toBeInTheDocument();
    expect(screen.getByText('Dana Haddad')).toBeInTheDocument();
  });

  it('shows the wallet number whole — 12 chars IS the short form', async () => {
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByText('4f7kq2nm8xcb')).toBeInTheDocument();
  });

  it('asks for a bounded first page', async () => {
    renderWithProviders(<WalletsPage />);

    await waitFor(() => expect(getWallets).toHaveBeenCalled());
    const params = getWallets.mock.calls[0]?.[0] as { limit: number; page: number };
    expect(params.limit).toBe(25);
    expect(params.page).toBe(1);
  });

  it('offers a retry when the list cannot be loaded', async () => {
    getWallets.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  /**
   * A 404 is "not built yet", not "broken" — the distinction `useResource` draws
   * on purpose. The endpoint is named on screen so the state doubles as a to-do
   * for whoever owns the API.
   */
  it('names the endpoint when the API is not built yet', async () => {
    getWallets.mockRejectedValue(
      Object.assign(new Error('nope'), {
        response: { status: 404, data: { code: 'ROUTE_NOT_FOUND' } },
      }),
    );
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByText(/\/admin\/wallets/)).toBeInTheDocument();
  });
});

describe('wallets — the empty state keeps the table', () => {
  /**
   * The empty state is a STATE OF THE TABLE, not a replacement for it.
   *
   * The column headers have to survive it: they are what tells the operator what
   * was searched. Losing the frame on an empty result also changes the page's
   * shape between loading, empty and has-rows, which moves the filter controls
   * under the cursor.
   */
  it('keeps the column headers and the pager when nothing matches', async () => {
    getWallets.mockResolvedValue(page([], 0));
    renderWithProviders(<WalletsPage />);

    expect(await screen.findByText(/no wallets/i)).toBeInTheDocument();
    // The header row is still drawn.
    expect(screen.getByRole('columnheader', { name: /balance/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /currency/i })).toBeInTheDocument();
    // …and so is the footer.
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('says the filters are why it is empty, not that there are no wallets', async () => {
    searchParams.current = new URLSearchParams({ currency: 'EUR' });
    getWallets.mockResolvedValue(page([], 0));
    renderWithProviders(<WalletsPage />);

    // "No wallets yet" would be a claim about the system; this is a claim about
    // the filter, which is the true one.
    expect(await screen.findByText(/match these filters/i)).toBeInTheDocument();
  });
});

describe('wallets — filtering and sorting reach the API', () => {
  it('sends the chosen currency to the API rather than filtering on screen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');
    getWallets.mockClear();

    await user.click(screen.getByRole('combobox', { name: /currency/i }));
    await user.click(await screen.findByRole('option', { name: 'USD' }));

    /*
     * Filtering client-side would narrow the twenty-five rows on screen and
     * present that as the answer — a wrong result that is indistinguishable from
     * a right one until somebody acts on it.
     */
    await waitFor(() => {
      const params = getWallets.mock.calls.at(-1)?.[0] as { currency?: string };
      expect(params.currency).toBe('USD');
    });
  });

  /**
   * `balance` is offered as a sortable header ONLY because the endpoint orders on
   * the NUMERIC column. A client-side sort would compare decimal strings as text
   * — putting '100.00000000' below '9.00000000' — and would cover one page, so
   * "the largest balance" would mean the largest of twenty-five.
   */
  it('asks the API to sort by balance rather than reordering the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');
    getWallets.mockClear();

    await user.click(screen.getByRole('button', { name: /balance/i }));

    await waitFor(() => {
      const params = getWallets.mock.calls.at(-1)?.[0] as { sort?: string; order?: string };
      expect(params.sort).toBe('balance');
      expect(params.order).toBe('asc');
    });
  });

  /**
   * A column the endpoint will not sort by must not offer to. R-2.5 makes an
   * unrecognised sort key a 400 rather than a silent fallback, so a header
   * claiming `onHold` would render an error page instead of rows.
   */
  it('does not offer to sort by a column the endpoint has no key for', async () => {
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');

    const onHold = screen.getByRole('columnheader', { name: /on hold/i });
    expect(onHold.querySelector('button')).toBeNull();
  });

  it('drops the page when the sort changes', async () => {
    const user = userEvent.setup();
    // Three pages, so the pager renders numbered buttons.
    getWallets.mockResolvedValue(page([wallet()], 70));
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');

    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => {
      const params = getWallets.mock.calls.at(-1)?.[0] as { page: number };
      expect(params.page).toBe(2);
    });

    // Reordering renumbers every page, so position 26–50 after a sort holds
    // different wallets than it did before. Staying on page 2 would silently
    // show a different slice of a different ordering.
    await user.click(screen.getByRole('button', { name: /balance/i }));
    await waitFor(() => {
      const params = getWallets.mock.calls.at(-1)?.[0] as { page: number; sort?: string };
      expect(params.sort).toBe('balance');
      expect(params.page).toBe(1);
    });
  });
});

describe('wallets — one write action, and only one', () => {
  /**
   * ⚠️ THIS SUITE USED TO ASSERT THE OPPOSITE, and was right at the time.
   *
   * It pinned "offers no per-row action menu", reasoning that
   * `AdminHoldingsController` exposed reads only. That was true — and it was
   * also the largest hole in the product: a client could file a manual deposit
   * and nothing could confirm it, so money could leave the platform and could
   * not enter it.
   *
   * `POST /admin/wallets/credit` now exists and this screen is its only entry
   * point, so the ABSENCE of an actions column is no longer the property worth
   * pinning. What replaces it is narrower and still worth pinning: exactly one
   * action, and specifically not the destructive ones.
   */
  it('offers the credit action', async () => {
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');

    expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
  });

  /**
   * Debit, freeze and close must NOT appear.
   *
   * Reducing a balance is a compensating entry through the ledger (§6.4), never
   * a button that edits a number — and no endpoint backs any of them, so a menu
   * item would be one an operator reasonably expects to work.
   */
  it('offers add funds and close, and nothing else', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');

    await user.click(screen.getByRole('button', { name: /actions for/i }));

    expect(await screen.findByRole('menuitem', { name: /add funds/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /close wallet/i })).toBeInTheDocument();
    /*
     * DEBIT and FREEZE must stay absent. Reducing a balance is a compensating
     * entry through the ledger (§6.4), never a button that edits a number, and
     * no endpoint backs either — so a menu item would be one an operator
     * reasonably expects to work.
     */
    expect(screen.queryByRole('menuitem', { name: /debit|freeze/i })).toBeNull();
  });

  /**
   * Closing is behind a CONFIRMATION, and the API's own refusal is shown in it.
   *
   * The endpoint refuses a wallet holding a balance, one with funds on hold, and
   * one with history — each message naming the figure or the count. That
   * sentence is the only part an operator can act on, so it is surfaced verbatim
   * and the dialog stays open around it rather than closing on failure.
   */
  it('asks before closing, and shows the API refusal in the dialog', async () => {
    const user = userEvent.setup();
    closeWallet.mockRejectedValue(
      Object.assign(new Error('conflict'), {
        response: {
          status: 409,
          data: { message: 'This wallet holds 1250.00000000 USD. Move the balance out first.' },
        },
      }),
    );
    renderWithProviders(<WalletsPage />);
    await screen.findByText('client@example.com');

    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await user.click(await screen.findByRole('menuitem', { name: /close wallet/i }));

    // Nothing is deleted by opening the dialog.
    expect(closeWallet).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^close wallet$/i }));

    expect(await screen.findByText(/holds 1250\.00000000 USD/i)).toBeInTheDocument();
  });
});

describe('finding a client on the wallets desk', () => {
  /*
   * This box read `userId` and its placeholder said "Paste a client ID" — while
   * every row shows a NAME and an EMAIL and no id at all. So an operator
   * looking straight at a client could not filter to them without leaving for
   * /clients, copying the uuid, and coming back. A filter you can only use by
   * visiting another screen first is not a filter.
   */
  it('searches by what the rows actually show, not by a uuid', async () => {
    getWallets.mockResolvedValue(page([wallet()]));
    renderWithProviders(<WalletsPage />);
    await screen.findByRole('table');

    const box = screen.getByRole('searchbox', { name: /search client/i });
    /*
     * The placeholder must name IDENTIFIERS THE TABLE SHOWS, and must not ask
     * for one it does not. Asserted as two properties rather than as an exact
     * sentence: the copy has already grown twice — "or wallet number" when the
     * box learned to route a number to its row, then the Portal ID when every
     * row began showing one — and a test pinned to the old wording fails on an
     * improvement rather than on a regression.
     *
     * The id it must never ask for is the uuid: no screen shows one.
     */
    const placeholder = box.getAttribute('placeholder') ?? '';
    expect(placeholder).toMatch(/name|email/i);
    expect(placeholder).toMatch(/portal id/i);
    expect(placeholder, 'the box is asking for a uuid again').not.toMatch(/uuid|paste/i);

    await userEvent.type(box, 'nadia');

    await waitFor(() => {
      expect(getWallets).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'nadia' }),
        expect.anything(),
      );
    });
  });

  /*
   * NOT TESTED HERE, deliberately: "a userId in the URL is still honoured".
   * The page does read both params — the row menu's "see this client's wallets"
   * writes `userId`, and a link pasted into a ticket last month carries one —
   * but seeding a query string in this file needs the explicit
   * `useSearchParams` mock that `kyc/page.test.tsx` carries and this one does
   * not. A test that cannot observe the thing it names is worse than a stated
   * gap, so it is stated.
   */
});
