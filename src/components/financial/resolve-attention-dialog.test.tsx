import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ResolveAttentionDialog, type AttentionTarget } from './resolve-attention-dialog';

const resolveAttention = vi.fn();
const finishFlaggedDeposit = vi.fn();
vi.mock('@/lib/api/admin', () => ({
  adminApi: {
    resolveAttention: (...args: unknown[]) => resolveAttention(...args) as unknown,
    finishFlaggedDeposit: (...args: unknown[]) => finishFlaggedDeposit(...args) as unknown,
  },
}));

const permissions = { current: ['deposits.approve', 'deposits.reject'] };
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'desk@oxshare.com',
      get permissions() {
        return permissions.current;
      },
    },
  }),
}));

/**
 * FINISHING A FLAGGED HOSTED DEPOSIT (backend 0173) moves money, so the one
 * thing asserted is that the right decision reaches the right endpoint — and
 * only for a deposit paid on a provider's page.
 */
const hosted: AttentionTarget = {
  id: 'tx-1',
  direction: 'deposit',
  amount: '100.00000000',
  currency: 'USD',
  reason: '50 USDT arrived on this deposit’s link, but the provider has not confirmed it.',
  portalId: 1000245,
  state: 'pending',
  providerPaymentId: 'INV-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['deposits.approve', 'deposits.reject'];
  finishFlaggedDeposit.mockResolvedValue({
    id: 'tx-1',
    state: 'success',
    amount: '50.00000000',
    currency: 'USD',
  });
  resolveAttention.mockResolvedValue({ id: 'tx-1', needsAttention: false });
});

describe('a flagged hosted deposit', () => {
  it('credits what arrived through the finish endpoint, with the reason', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResolveAttentionDialog target={hosted} onClose={() => undefined} onDone={() => undefined} />,
    );

    await user.click(screen.getByRole('radio', { name: /credit what arrived/i }));
    await user.type(screen.getByLabelText(/what did you find/i), 'Confirmed on the dashboard');
    await user.click(screen.getByRole('button', { name: /credit what arrived/i }));

    expect(finishFlaggedDeposit).toHaveBeenCalledWith(
      'tx-1',
      { decision: 'credit', reason: 'Confirmed on the dashboard' },
      'finish-deposit:tx-1',
    );
    expect(resolveAttention).not.toHaveBeenCalled();
  });

  it('closes it without credit', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResolveAttentionDialog target={hosted} onClose={() => undefined} onDone={() => undefined} />,
    );

    await user.click(screen.getByRole('radio', { name: /close without credit/i }));
    await user.type(screen.getByLabelText(/what did you find/i), 'Refunded by the provider');
    await user.click(screen.getByRole('button', { name: /close without credit/i }));

    expect(finishFlaggedDeposit).toHaveBeenCalledWith(
      'tx-1',
      { decision: 'close', reason: 'Refunded by the provider' },
      'finish-deposit:tx-1',
    );
  });

  it('offers only "Mark resolved" on anything that is not an open hosted deposit', () => {
    renderWithProviders(
      <ResolveAttentionDialog
        target={{ ...hosted, providerPaymentId: null }}
        onClose={() => undefined}
        onDone={() => undefined}
      />,
    );
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('never offers a decision the reader may not take', () => {
    permissions.current = ['deposits.approve'];
    renderWithProviders(
      <ResolveAttentionDialog target={hosted} onClose={() => undefined} onDone={() => undefined} />,
    );
    expect(screen.getByRole('radio', { name: /credit what arrived/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /close without credit/i })).toBeNull();
  });
});
