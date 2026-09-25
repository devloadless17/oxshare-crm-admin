import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { OpenAccountModal } from './open-account-modal';

/**
 * Opening a trading account from the console — the product choice (backend
 * 0142).
 *
 * A group may back several products, and the product decides the account's
 * commission type. So the dialog asks for the product ONLY when the chosen group
 * has more than one, sends it, and will not submit without it — the API refuses
 * to guess, and a request it can only refuse is a click wasted.
 */
const { getMt5Groups, getMt5GroupMirror, createTradingAccount } = vi.hoisted(() => ({
  getMt5Groups: vi.fn(),
  getMt5GroupMirror: vi.fn(),
  createTradingAccount: vi.fn(),
}));

vi.mock('@/lib/api/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/admin')>('@/lib/api/admin');
  return {
    ...actual,
    adminApi: { getMt5Groups, getMt5GroupMirror, createTradingAccount },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  getMt5Groups.mockResolvedValue([
    { name: 'real\\Shared', currency: 'USD', leverageDefault: 100 },
    { name: 'real\\ECN', currency: 'USD', leverageDefault: 100 },
  ]);
  getMt5GroupMirror.mockResolvedValue([
    {
      name: 'real\\Shared',
      currency: 'USD',
      leverageDefault: 100,
      accountCount: 0,
      products: [
        { id: 'p-standard', name: 'Standard', environment: 'live' },
        { id: 'p-premium', name: 'Premium', environment: 'live' },
      ],
    },
    {
      name: 'real\\ECN',
      currency: 'USD',
      leverageDefault: 100,
      accountCount: 0,
      products: [{ id: 'p-ecn', name: 'ECN', environment: 'live' }],
    },
  ]);
  createTradingAccount.mockResolvedValue({
    id: 'acc-1',
    login: '910001',
    group: 'real\\Shared',
    masterPassword: 'Master!1',
    investorPassword: 'Investor!1',
  });
});

function renderModal() {
  return renderWithProviders(
    <OpenAccountModal open onClose={vi.fn()} userId="client-1" clientLabel="Client One" />,
  );
}

async function chooseGroup(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('combobox', { name: /mt5 group/i }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('choosing the product for a shared group', () => {
  it('asks nothing extra for a group only one product sells', async () => {
    const user = userEvent.setup();
    renderModal();

    await chooseGroup(user, /real\\ECN/);

    expect(screen.queryByRole('combobox', { name: /^product$/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /open account/i }));
    await waitFor(() => expect(createTradingAccount).toHaveBeenCalledTimes(1));
    expect(createTradingAccount.mock.calls[0]?.[0]).not.toHaveProperty('productId');
  });

  it('asks for the product when the group is sold by several, and sends it', async () => {
    const user = userEvent.setup();
    renderModal();

    await chooseGroup(user, /real\\Shared/);

    // Not submittable until a product is chosen — the API would refuse.
    expect(screen.getByRole('button', { name: /open account/i })).toBeDisabled();

    await user.click(await screen.findByRole('combobox', { name: /^product$/i }));
    await user.click(await screen.findByRole('option', { name: 'Premium' }));
    await user.click(screen.getByRole('button', { name: /open account/i }));

    await waitFor(() =>
      expect(createTradingAccount).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'real\\Shared', productId: 'p-premium' }),
      ),
    );
  });
});
