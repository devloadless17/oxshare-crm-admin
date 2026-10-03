import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DepositRejectDialog } from './deposit-reject-dialog';

/**
 * Refusing a deposit: the reviewer's typed note can carry an Arabic twin
 * (0179) for a client reading the portal in Arabic. Blank, it is left out.
 */

const { getRejectionReasons } = vi.hoisted(() => ({ getRejectionReasons: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { getRejectionReasons } };
  return { api, default: api };
});

beforeEach(() => {
  vi.clearAllMocks();
  getRejectionReasons.mockResolvedValue([]);
});

async function rejectWith(arabic: string) {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  renderWithProviders(
    <DepositRejectDialog
      open
      clientName="Ada Client"
      amount="$100.00"
      saving={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  await user.type(screen.getByPlaceholderText('What they need to do next…'), 'Receipt unreadable');
  const ar = screen.getByLabelText('Your note in Arabic (optional)');
  expect(ar).toHaveAttribute('dir', 'rtl');
  expect(screen.getByText(/shown to clients reading the portal in arabic/i)).toBeInTheDocument();
  if (arabic) await user.type(ar, arabic);
  await user.click(screen.getByRole('button', { name: 'Refuse deposit' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  return onConfirm.mock.calls[0]![0] as Record<string, unknown>;
}

describe('refusing a deposit, in Arabic too', () => {
  it('sends the Arabic typed, trimmed', async () => {
    const body = await rejectWith(' الإيصال غير مقروء ');
    expect(body).toEqual({ reason: 'Receipt unreadable', reasonAr: 'الإيصال غير مقروء' });
  });

  it('leaves it out when blank', async () => {
    const body = await rejectWith('');
    expect(body.reasonAr).toBeUndefined();
    expect(body.reason).toBe('Receipt unreadable');
  });
});
