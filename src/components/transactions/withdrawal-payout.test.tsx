import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { WithdrawalRow } from '@/lib/api/admin';
import { CancelWithdrawalDialog } from './withdrawal-payout';

/**
 * Cancelling an approved withdrawal: the reviewer's typed note can carry an
 * Arabic twin (0179), shown to a client reading the portal in Arabic. Blank, it
 * is left out and that client reads the English.
 */

const { getRejectionReasons, cancelWithdrawal } = vi.hoisted(() => ({
  getRejectionReasons: vi.fn(),
  cancelWithdrawal: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: { ...actual.adminApi, getRejectionReasons, cancelWithdrawal },
  };
});

const target = {
  id: 'w-1',
  amount: '100.00000000',
  currency: 'USD',
  state: 'approved',
  providerPayoutId: null,
  user: { id: 'c-1', email: 'client@oxshare.com', firstName: 'Ada', lastName: 'Client' },
} as unknown as WithdrawalRow;

beforeEach(() => {
  vi.clearAllMocks();
  getRejectionReasons.mockResolvedValue([]);
  cancelWithdrawal.mockResolvedValue({ ...target, state: 'rejected' });
});

async function cancelWith(arabic: string) {
  const user = userEvent.setup();
  renderWithProviders(
    <CancelWithdrawalDialog target={target} onClose={vi.fn()} onDone={vi.fn(async () => {})} />,
  );
  await user.type(screen.getByLabelText(/^note/i), 'Client asked to stop it');
  const ar = screen.getByLabelText('Reason in Arabic (optional)');
  expect(ar).toHaveAttribute('dir', 'rtl');
  if (arabic) await user.type(ar, arabic);
  await user.click(screen.getByRole('button', { name: 'Cancel the withdrawal' }));
  await waitFor(() => expect(cancelWithdrawal).toHaveBeenCalledTimes(1));
  return cancelWithdrawal.mock.calls[0]![1] as Record<string, unknown>;
}

describe('cancelling a withdrawal, in Arabic too', () => {
  it('sends the Arabic typed, trimmed', async () => {
    const body = await cancelWith(' طلب العميل إيقافه ');
    expect(body).toMatchObject({
      reason: 'Client asked to stop it',
      reasonAr: 'طلب العميل إيقافه',
    });
  });

  it('leaves it out when blank', async () => {
    const body = await cancelWith('');
    expect(body.reasonAr).toBeUndefined();
  });
});
