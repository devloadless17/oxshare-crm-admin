import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import ReconciliationPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * THE §12.2 RECONCILIATION — does the money add up.
 *
 * Every wallet's cached `balance` against the sum of its own ledger entries.
 * The ledger is the truth; the balance is a projection of it, and this is the
 * screen that says the two still agree.
 *
 * ## The failure this screen must never have
 *
 * **A failed load must not read as "the books balance."** That is defect class
 * 7 at its most expensive: a control whose entire purpose is telling you about
 * a problem you do not know you have, reassuring you because it could not run.
 * Every other empty state in this product is merely confusing; this one is
 * actively false.
 *
 * The screen is built correctly for it — the verdict sits inside an
 * `AsyncBoundary` and is gated on `report` existing — and nothing proved it
 * until this file. That is the gap: the code was right and unwitnessed.
 *
 * ## The subtle one the page's own docblock predicted
 *
 * `report.balanced` is read rather than `discrepancies.length === 0`, because
 * it is the field the SERVICE decides: a future check — the unpaid confirmed
 * accruals one, when the commission engine returns — can make it false without
 * adding a single wallet row. A screen testing the array would quietly show
 * "all balanced" for exactly that case. The third case below is that future,
 * pinned now so the change that introduces it cannot ship silently.
 */
const { getReconciliation } = vi.hoisted(() => ({ getReconciliation: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { getReconciliation } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reconciliation',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

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

const report = (over: Record<string, unknown> = {}) => ({
  checkedAt: '2026-09-11T12:00:00.000Z',
  walletsChecked: 364,
  walletDiscrepancies: [],
  discrepancyCount: 0,
  totalDifference: '0.00000000',
  balanced: true,
  ...over,
});

const discrepancy = (over: Record<string, unknown> = {}) => ({
  walletId: 'w-1',
  walletNumber: 'W-0001',
  userId: 'c-1',
  currency: 'USD',
  balance: '100.00000000',
  ledgerSum: '90.00000000',
  difference: '10.00000000',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('the reconciliation report', () => {
  it('says the books balance when they do, and names how many were checked', async () => {
    getReconciliation.mockResolvedValue(report());

    renderWithProviders(<ReconciliationPage />);

    expect(await screen.findByText(/The books balance/i)).toBeInTheDocument();
    // The count is interpolated into a sentence, so match within it rather than
    // as a standalone node — a bare `getByText(/364/)` fails on a split text
    // node and would read as the screen not showing the figure at all.
    expect(screen.getByText(/All 364 wallet/i)).toBeInTheDocument();
  });

  it('RAISES the disagreement, with the wallet and the difference', async () => {
    getReconciliation.mockResolvedValue(
      report({
        balanced: false,
        walletDiscrepancies: [discrepancy()],
        discrepancyCount: 1,
        totalDifference: '10.00000000',
      }),
    );

    renderWithProviders(<ReconciliationPage />);

    expect(await screen.findByText(/disagree/i)).toBeInTheDocument();
    expect(screen.getByText(/W-0001/)).toBeInTheDocument();
    // And it must NOT be showing the reassuring banner at the same time.
    expect(screen.queryByText(/The books balance/i)).not.toBeInTheDocument();
  });

  it('does NOT report "balanced" when the service says false and no wallet row explains it', async () => {
    /*
     * The page's own docblock predicted this: a future check can set
     * `balanced: false` without producing a wallet discrepancy. A screen
     * deriving the verdict from `discrepancies.length === 0` would show "all
     * balanced" over a failing reconciliation — the exact inversion this
     * control exists to prevent.
     */
    getReconciliation.mockResolvedValue(
      report({ balanced: false, walletDiscrepancies: [], discrepancyCount: 0 }),
    );

    renderWithProviders(<ReconciliationPage />);

    /*
     * ⚠️ WAIT FOR THE VERDICT TO RENDER, not merely for the request to fire.
     *
     * The first version awaited `getReconciliation` having been called and then
     * asserted the banner absent — which is true before the component has
     * rendered anything at all, so it passed against a screen that DID go on to
     * show "the books balance". Proven: mutating the verdict to
     * `discrepancies.length === 0` left this case green.
     *
     * So wait for the state this report must produce — the disagreement notice
     * — and only then assert the reassuring one is absent. Same lesson as the
     * observer-snapshot lag: an assertion that runs before the thing it denies
     * could have happened is not an assertion.
     */
    expect(await screen.findByText(/disagree/i)).toBeInTheDocument();
    expect(screen.queryByText(/The books balance/i)).not.toBeInTheDocument();
  });

  it('A FAILED RUN MUST NOT READ AS BALANCED — it offers a retry instead', async () => {
    /*
     * The one that matters most on this screen. "Could not run" and "the books
     * balance" are opposite facts, and only one of them is safe to be wrong
     * about.
     */
    getReconciliation.mockRejectedValue(new Error('API down'));

    renderWithProviders(<ReconciliationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/The books balance/i)).not.toBeInTheDocument();
  });
});
