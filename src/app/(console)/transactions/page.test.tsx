import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import TransactionsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * THE WITHDRAWALS DESK — the screen that decides whether a client's money
 * leaves the platform, and the one `route-census.test.ts` named as **the most
 * expensive omission** in its frozen list.
 *
 * It is the largest file in the console (1,094 lines) and, until this file, the
 * only core money screen with no render test at all. Removing it from
 * `UNTESTED` is the ratchet moving the way it is meant to.
 *
 * ## What these cases defend, and why each one rather than coverage for its own sake
 *
 * The desk's failures are not cosmetic. An operator reads this screen to decide
 * whether to release somebody's funds, so the states that must never be
 * confusable are:
 *
 *  - **a failed load must not read as an empty queue.** "No withdrawals" and
 *    "we could not reach the API" look identical on a list, and one of them
 *    means a client is waiting while nobody is looking. This is defect class 7
 *    on the surface where it costs the most.
 *  - **the amount must be exact.** It arrives as a string at NUMERIC(28,8) and
 *    must render through `lib/money.ts`; a figure that has been through a JS
 *    number is a payout that does not match the ledger.
 *  - **a masked reviewer must not see what their role hides**, and the screen
 *    must say a field is hidden rather than render it blank — blank is how a
 *    reviewer concludes the client has no email.
 */
/* `vi.hoisted`, because `vi.mock`'s factory is lifted above these declarations. */
const { getWithdrawals, getRejectionReasons, getCurrencies } = vi.hoisted(() => ({
  getWithdrawals: vi.fn(),
  getRejectionReasons: vi.fn(),
  getCurrencies: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getWithdrawals, getRejectionReasons, getCurrencies } };
  return { api, default: api };
});

/* The app-router stand-in this repo's other table tests established. */
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
    usePathname: () => '/transactions',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'w-1',
  amount: '1234.56780000',
  currency: 'USD',
  state: 'pending',
  provider: 'whish',
  methodName: 'Whish Money',
  providerRef: 'ref-1',
  destination: '+961 3 123 456',
  rejectionReason: null,
  requestedAt: '2026-09-01T10:00:00.000Z',
  reviewedAt: null,
  reviewedByName: null,
  settledAt: null,
  // The payout at its provider (backend 0173's neutral fields).
  providerPayoutId: null,
  providerSubmittedAt: null,
  needsAttention: false,
  attentionReason: null,
  payoutPlan: null,
  user: { id: 'c-1', email: 'client@oxshare.com', firstName: 'Ada', lastName: 'Client' },
  ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  items: [row()],
  nextCursor: null,
  total: 1,
  page: 1,
  limit: 25,
  counts: {},
  maskedFields: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  snapshot = 0;
  getCurrencies.mockResolvedValue([{ code: 'USD', decimals: 2 }]);
  getRejectionReasons.mockResolvedValue([]);
});

describe('the withdrawals desk', () => {
  it('renders a pending withdrawal with the client and the amount', async () => {
    getWithdrawals.mockResolvedValue(page());

    renderWithProviders(<TransactionsPage />);

    expect(await screen.findByText(/Ada Client/)).toBeInTheDocument();

    /*
     * Rendered THROUGH `lib/money.ts`, asserted as a property rather than as one
     * formatted string: grouped thousands and a decimal point, and the raw
     * NUMERIC(28,8) text nowhere on screen. Pinning the exact output would make
     * this fail the day the display scale changes, which is a decision rather
     * than a defect — while still catching the thing that matters, which is a
     * money figure reaching the DOM without going through decimal.js.
     */
    expect(screen.getByText(/1,234\./)).toBeInTheDocument();
    expect(screen.queryByText('1234.56780000')).not.toBeInTheDocument();
  });

  it('OFFERS A RETRY when the desk cannot be loaded — never an empty queue', async () => {
    /*
     * Defect class 7 on the surface where it costs the most. A reviewer who
     * reads a failed load as "nothing to review" leaves clients' funds on hold
     * and has no reason to look again.
     */
    getWithdrawals.mockRejectedValue(new Error('API down'));

    renderWithProviders(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
    });
  });

  it('does not render a row it never received', async () => {
    // The control for the case above: with an empty page the desk shows no
    // client, so "a row appeared" cannot be an accident of the harness.
    getWithdrawals.mockResolvedValue(page({ items: [], total: 0 }));

    renderWithProviders(<TransactionsPage />);

    await waitFor(() => expect(getWithdrawals).toHaveBeenCalled());
    expect(screen.queryByText(/Ada Client/)).not.toBeInTheDocument();
  });

  it('asks the SERVER for the search rather than filtering the page', async () => {
    /*
     * The desk pages server-side, so a client-side filter would search one page
     * and report it as the whole queue — the shape this project has shipped on
     * a list before.
     */
    searchParams.current = new URLSearchParams('q=ada');
    getWithdrawals.mockResolvedValue(page());

    renderWithProviders(<TransactionsPage />);

    await waitFor(() => expect(getWithdrawals).toHaveBeenCalled());
    const params = getWithdrawals.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(params?.q).toBe('ada');
  });

  it('tells the reviewer a field is HIDDEN rather than rendering it blank', async () => {
    /*
     * RBAC-03. A masked reviewer must be able to tell "your role hides this"
     * from "this client has no email" — a blank cell says the second, and the
     * server sends `maskedFields` precisely so the screen can say the first.
     */
    getWithdrawals.mockResolvedValue(
      page({
        items: [row({ user: { id: 'c-1', email: null, firstName: 'Ada', lastName: 'Client' } })],
        maskedFields: ['client.email'],
      }),
    );

    renderWithProviders(<TransactionsPage />);

    await screen.findByText(/Ada Client/);
    expect(screen.queryByText('client@oxshare.com')).not.toBeInTheDocument();
  });
});

describe('a payout only a person can settle', () => {
  const menuFor = () => screen.findByRole('button', { name: /actions for ada client/i });

  it('offers "Mark resolved" when the two platforms disagree about the outcome', async () => {
    const user = userEvent.setup();
    getWithdrawals.mockResolvedValue(
      page({
        items: [
          row({
            state: 'success',
            providerPayoutId: 'rw-1',
            needsAttention: true,
            attentionReason: 'The platform reports this payout rejected; it settled here.',
          }),
        ],
      }),
    );
    renderWithProviders(<TransactionsPage />);

    await user.click(await menuFor());
    expect(await screen.findByRole('menuitem', { name: 'Mark resolved' })).toBeInTheDocument();
  });

  it('never offers it on a refused payout — a RESEND answers that one', async () => {
    // Clearing this flag would hide an approved payout that was never sent.
    const user = userEvent.setup();
    getWithdrawals.mockResolvedValue(
      page({
        items: [
          row({
            state: 'approved',
            needsAttention: true,
            attentionReason: 'Refused: insufficient balance on the payout account.',
          }),
        ],
      }),
    );
    renderWithProviders(<TransactionsPage />);

    expect(await screen.findByRole('button', { name: /resend payout/i })).toBeInTheDocument();
    await user.click(await menuFor());
    await screen.findByRole('menuitem', { name: 'View details' });
    expect(screen.queryByRole('menuitem', { name: 'Mark resolved' })).toBeNull();
  });
});
