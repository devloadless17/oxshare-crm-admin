import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { CurrencyFormModal, type CurrencyFormValues } from './currency-form-modal';
import type { Currency } from '@/lib/api/admin';

/**
 * A currency's money limits, on its own form (0162).
 *
 * The owner could not let a client withdraw more than 50,000 LBP — about fifty
 * cents — because the limits were one set of numbers for every currency. Pinned
 * here: a new currency's limits start EMPTY and are required (never another
 * currency's numbers); an existing one's are shown as the operator typed them,
 * not at the ledger's 8 decimals; a big LBP figure is read back grouped; what is
 * sent is the decimal STRING typed; and the API's sentence lands under its box.
 */

const LBP: Currency = {
  code: 'LBP',
  name: 'Lebanese Pound',
  symbol: 'LL',
  decimals: 0,
  enabled: true,
  isDefault: false,
  sortOrder: 2,
  minDeposit: '1000000.00000000',
  maxDeposit: '5000000000.00000000',
  minWithdrawal: '1000000.00000000',
  maxWithdrawal: '500000000.00000000',
  maxWithdrawalDaily: '1000000000.00000000',
  maxAdminCredit: '100000000.00000000',
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
};

function open(props: Partial<Parameters<typeof CurrencyFormModal>[0]> = {}) {
  const onSubmit = vi.fn<(values: CurrencyFormValues) => void>();
  renderWithProviders(
    <CurrencyFormModal open saving={false} onClose={vi.fn()} onSubmit={onSubmit} {...props} />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('the currency form’s limits', () => {
  it('starts a NEW currency with empty, required limits — no borrowed numbers', () => {
    open();
    for (const label of [
      'Minimum deposit',
      'Maximum deposit',
      'Minimum withdrawal',
      'Maximum withdrawal',
      'Daily withdrawal limit',
      'Maximum admin credit',
    ]) {
      const box = screen.getByLabelText(label);
      expect(box).toHaveValue('');
      expect(box).toBeRequired();
    }
  });

  it('shows an existing currency’s limits as typed, and reads a billion back grouped', () => {
    open({ currency: LBP });
    expect(screen.getByLabelText('Maximum deposit')).toHaveValue('5000000000');
    expect(screen.getByText(/= 5,000,000,000 LBP/)).toBeInTheDocument();
  });

  it('sends the limits as the decimal strings typed', async () => {
    const { onSubmit, user } = open();
    await user.type(screen.getByLabelText(/^Code/), 'LBP');
    await user.type(screen.getByLabelText(/^Symbol/), 'LL');
    await user.type(screen.getByLabelText(/^Name/), 'Lebanese Pound');
    const fill: Record<string, string> = {
      'Minimum deposit': '1000000',
      'Maximum deposit': '5,000,000,000',
      'Minimum withdrawal': '1000000',
      'Maximum withdrawal': '500000000',
      'Daily withdrawal limit': '1000000000',
      'Maximum admin credit': '100000000',
    };
    for (const [label, value] of Object.entries(fill)) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      code: 'LBP',
      minDeposit: '1000000',
      // Separators typed for readability are stripped, never parsed as a number.
      maxDeposit: '5000000000',
      maxWithdrawalDaily: '1000000000',
      maxAdminCredit: '100000000',
    });
  });

  it('puts the API’s sentence under the box it is about', () => {
    open({
      currency: LBP,
      fieldErrors: {
        maxWithdrawal: 'The maximum withdrawal cannot be below the minimum withdrawal (1000000).',
      },
    });
    const box = screen.getByLabelText('Maximum withdrawal');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription(/cannot be below the minimum withdrawal/);
  });
});
