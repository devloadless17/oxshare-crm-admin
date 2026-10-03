import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { TransactionRow } from '@/lib/api/admin';
import { AbandonTransferDialog } from './abandon-transfer-dialog';

/**
 * Releasing a stuck transfer: the reason reaches the client on the failed row,
 * and may carry an Arabic twin (0179) for a client reading the portal in Arabic.
 */

const { abandonTransfer } = vi.hoisted(() => ({ abandonTransfer: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { abandonTransfer } };
  return { api, default: api };
});

const target = {
  id: 't-1',
  amount: '50.00000000',
  currency: 'USD',
  createdAt: '2026-09-01T10:00:00.000Z',
  user: { id: 'c-1', email: 'client@oxshare.com' },
} as unknown as TransactionRow;

beforeEach(() => {
  vi.clearAllMocks();
  abandonTransfer.mockResolvedValue({ id: 't-1' });
});

async function releaseWith(arabic: string) {
  const user = userEvent.setup();
  renderWithProviders(<AbandonTransferDialog target={target} onClose={vi.fn()} onDone={vi.fn()} />);
  await user.type(
    screen.getByLabelText('What did the broker’s record show?'),
    'No deal in the MT5 history',
  );
  const ar = screen.getByLabelText('Reason in Arabic (optional)');
  expect(ar).toHaveAttribute('dir', 'rtl');
  if (arabic) await user.type(ar, arabic);
  await user.click(screen.getByRole('button', { name: 'Release the hold' }));
  await waitFor(() => expect(abandonTransfer).toHaveBeenCalledTimes(1));
  return abandonTransfer.mock.calls[0] as unknown[];
}

describe('releasing a transfer, in Arabic too', () => {
  it('sends the Arabic typed, trimmed', async () => {
    const [id, reason, , reasonAr] = await releaseWith(' لا توجد صفقة في سجل MT5 ');
    expect(id).toBe('t-1');
    expect(reason).toBe('No deal in the MT5 history');
    expect(reasonAr).toBe('لا توجد صفقة في سجل MT5');
  });

  it('sends null when blank — the client reads the English', async () => {
    const [, , , reasonAr] = await releaseWith('');
    expect(reasonAr).toBeNull();
  });
});
