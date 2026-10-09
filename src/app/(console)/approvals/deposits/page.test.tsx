import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import DepositApprovalsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { TransactionRow } from '@/lib/api/admin';

/*
 * The deposit desk is the only queue in this console where a decision MINTS
 * BALANCE, so the cases here are the ones whose wrong answer is invisible:
 *
 *  - "no receipt" rendering as an empty cell is indistinguishable from an image
 *    that failed to load, and invites an approval on the assumption it is there.
 *  - the two permissions collapsing into one would hand anybody who can refuse a
 *    deposit the power to credit a wallet.
 *  - an idempotency key that is not derived from the row lets a double-click
 *    credit twice.
 *  - a failed load rendering as an empty queue says nobody is waiting, which is
 *    the one answer a console must never invent.
 */
const { getDeskDeposits, approveDeposit, rejectDeposit, getRejectionReasons } = vi.hoisted(() => ({
  getDeskDeposits: vi.fn(),
  approveDeposit: vi.fn(),
  rejectDeposit: vi.fn(),
  getRejectionReasons: vi.fn(),
}));

/*
 * BOTH exports. `src/lib/api/index.ts` exports `api` as named AND default, and
 * mocking only `default` leaves the named one undefined — the page throws, its
 * own catch swallows it, and what renders is a generic "failed to load" that
 * reads as a broken query rather than a broken mock.
 */
// The period lives in the URL (`useDateRange`), so the page needs a router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/approvals/deposits',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getDeskDeposits, approveDeposit, rejectDeposit, getRejectionReasons } };
  return { api, default: api };
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

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-1',
    kind: 'payment',
    direction: 'deposit',
    state: 'pending',
    amount: '250.00000000',
    currency: 'USD',
    methodName: 'Offline / receipt',
    provider: 'manual_offline_receipt',
    providerRef: 'OX-ABC123',
    proofFilename: 'receipt-1.png',
    walletId: 'w-1',
    createdAt: new Date('2026-09-15T10:00:00Z').toISOString(),
    user: { id: 'u-1', email: 'client@oxshare.com', firstName: 'Omar', lastName: 'Haddad' },
    ...over,
  } as unknown as TransactionRow;
}

const page = (rows: TransactionRow[]) => ({
  items: rows,
  total: rows.length,
  page: 1,
  limit: 25,
  counts: { pending: rows.length },
  nextCursor: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getDeskDeposits.mockResolvedValue(page([row()]));
  approveDeposit.mockResolvedValue({ id: 'tx-1', state: 'success' });
  rejectDeposit.mockResolvedValue({ id: 'tx-1', state: 'rejected' });
  getRejectionReasons.mockResolvedValue([{ id: 'r-1', label: 'The receipt is unreadable' }]);
});

describe('the offline deposit queue', () => {
  it('changes the rows per page when asked — the buyer found this control dead', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepositApprovalsPage />);
    await screen.findByText('Omar Haddad');

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '100' }),
    );

    await waitFor(() =>
      expect(
        getDeskDeposits.mock.calls.some(
          ([params]) => (params as { limit?: number; page?: number }).limit === 100,
        ),
      ).toBe(true),
    );
  });

  it('shows the client, the amount and a way into the receipt', async () => {
    renderWithProviders(<DepositApprovalsPage />);

    // Awaits something the QUERY renders — a header control would resolve during
    // `loading` and assert against an empty list.
    expect(await screen.findByText('Omar Haddad')).toBeInTheDocument();
    expect(screen.getByText('OX-ABC123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open receipt/i })).toBeInTheDocument();
  });

  it('opens an image receipt in the lightbox rather than a new tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepositApprovalsPage />);

    /*
     * A BUTTON, not a link: judging whether the amount and sender on a phone
     * snapshot match the row used to mean leaving the queue for a browser tab
     * and tabbing back to compare. The dialog keeps the row on screen.
     */
    await user.click(await screen.findByRole('button', { name: /open receipt/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Through `assetUrl`, so the path keeps its own bucket — `buildKycDocUrl`
    // would re-prefix it to `uploads/kyc/uploads/deposit-proofs/…`.
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('uploads/deposit-proofs/receipt-1.png'),
    );
  });

  it('keeps a PDF receipt on a link, because the CSP will not embed one', async () => {
    getDeskDeposits.mockResolvedValue(page([row({ proofFilename: 'advice-1.pdf' })]));
    renderWithProviders(<DepositApprovalsPage />);

    // `object-src 'none'` with no `frame-src` is deliberate — an operator
    // opening a PDF a stranger sent is the threat model.
    expect(await screen.findByRole('link', { name: /open receipt/i })).toHaveAttribute(
      'href',
      expect.stringContaining('uploads/deposit-proofs/advice-1.pdf'),
    );
  });

  it('SAYS "no receipt" in words rather than leaving the cell blank', async () => {
    getDeskDeposits.mockResolvedValue(page([row({ proofFilename: null })]));
    renderWithProviders(<DepositApprovalsPage />);

    // A blank cell reads as a broken image, which invites an approval on the
    // assumption that there is something there.
    expect(await screen.findByText(/no receipt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open receipt/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open receipt/i })).not.toBeInTheDocument();
  });

  it('shows what the client gave to identify the payment, under the question as asked', async () => {
    getDeskDeposits.mockResolvedValue(
      page([
        row({
          proofDetails: [
            {
              fieldId: 'f_phone00001',
              label: 'Phone number you sent from',
              type: 'phone',
              value: '+96170123456',
            },
            { fieldId: 'f_code000001', label: 'Transfer code', type: 'text', value: 'ZX-9981' },
          ],
        }),
      ]),
    );
    renderWithProviders(<DepositApprovalsPage />);

    expect(await screen.findByText('Phone number you sent from')).toBeInTheDocument();
    expect(screen.getByText('+96170123456')).toBeInTheDocument();
    expect(screen.getByText('ZX-9981')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Transfer code' })).toBeInTheDocument();
  });

  it('asks before crediting, and sends an idempotency key derived from the row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepositApprovalsPage />);
    await screen.findByText('Omar Haddad');

    await user.click(screen.getByRole('button', { name: /deposit actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /approve & credit/i }));

    // The confirm names the amount, because this queue is rows of near-identical
    // figures and the menu opens under whichever was clicked.
    expect(await screen.findByText(/credit \$250\.00\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^approve & credit$/i }));

    await waitFor(() => expect(approveDeposit).toHaveBeenCalledWith('tx-1', 'approve:tx-1'));
  });

  it('warns in the confirm when there is no receipt to check against', async () => {
    const user = userEvent.setup();
    getDeskDeposits.mockResolvedValue(page([row({ proofFilename: null })]));
    renderWithProviders(<DepositApprovalsPage />);
    await screen.findByText('Omar Haddad');

    await user.click(screen.getByRole('button', { name: /deposit actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /approve & credit/i }));

    expect(await screen.findByText(/no receipt is attached/i)).toBeInTheDocument();
  });

  it('separates approving from refusing', async () => {
    // Only the refuse permission: crediting a wallet is a different power from
    // declining a claim, and collapsing them hands out the bigger one.
    permissions.current = ALL_PERMISSIONS.filter((k) => k !== 'deposits.approve');
    const user = userEvent.setup();
    renderWithProviders(<DepositApprovalsPage />);
    await screen.findByText('Omar Haddad');

    await user.click(screen.getByRole('button', { name: /deposit actions/i }));
    expect(await screen.findByRole('menuitem', { name: /refuse/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /approve & credit/i })).not.toBeInTheDocument();
  });

  it('tells the operator a refusal returns nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepositApprovalsPage />);
    await screen.findByText('Omar Haddad');

    await user.click(screen.getByRole('button', { name: /deposit actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /refuse/i }));

    /*
     * The sentence that stops a withdrawal-shaped assumption: a refused
     * withdrawal is refunded, a refused deposit never took anything.
     */
    expect(await screen.findByText(/nothing is refunded/i)).toBeInTheDocument();
  });

  it('offers a retry when the queue fails to load, never an empty list', async () => {
    getDeskDeposits.mockRejectedValue(new Error('boom'));
    renderWithProviders(<DepositApprovalsPage />);

    // An empty queue in front of an operator whose request 500'd says nobody is
    // waiting — the one answer a console must not invent.
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/nothing waiting here/i)).not.toBeInTheDocument();
  });
});
