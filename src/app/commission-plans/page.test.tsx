import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import CommissionPlansPage from './page';

/**
 * Guards the commission-plan form against silent coercion.
 *
 * `position: Number(state.position) || 1` shipped here. Both inputs are
 * type="number", so a browser will not accept letters — but a user can CLEAR the
 * field, and `Number('') || 1` is also 1. So the plan saved at position 1 with no
 * complaint, on the screen that decides how partners get paid. The settlement
 * window had the same shape with a `|| 0` fallback, silently meaning "pay
 * immediately".
 *
 * Also pins the §6.1 rule that money and percentage fields go over the wire as
 * the STRINGS they were typed as. A test is the only thing that catches a
 * well-meaning `Number(...)` being reintroduced into the payload.
 */

const { get, post, put, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ default: { get, post, put, patch } }));

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      permissions: ['*'],
      createdAt: new Date().toISOString(),
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: [] });
  post.mockResolvedValue({ data: {} });
});

async function openCreateForm() {
  const user = userEvent.setup();
  renderWithProviders(<CommissionPlansPage />);
  await user.click(await screen.findByRole('button', { name: /new plan/i }));
  return user;
}

describe('commission plan form — integer fields', () => {
  it('refuses an empty position instead of silently saving 1', async () => {
    const user = await openCreateForm();

    await user.type(await screen.findByLabelText(/plan name/i), 'Standard IB');
    await user.clear(await screen.findByLabelText(/ladder position/i));

    await user.click(screen.getByRole('button', { name: /create plan/i }));

    // The old behaviour: Number('') || 1 -> posts position 1 and succeeds.
    await waitFor(() => {
      expect(screen.getByText(/position is required/i)).toBeInTheDocument();
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses an empty settlement window instead of silently saving 0', async () => {
    const user = await openCreateForm();

    await user.type(await screen.findByLabelText(/plan name/i), 'Standard IB');
    await user.clear(await screen.findByLabelText(/settlement window \(hours\)/i));

    await user.click(screen.getByRole('button', { name: /create plan/i }));

    // `Number('') || 0` meant "settle immediately", which is not what an empty
    // field asks for.
    await waitFor(() => {
      expect(screen.getByText(/settlement window is required/i)).toBeInTheDocument();
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('posts valid integers as numbers and money as strings (§6.1)', async () => {
    const user = await openCreateForm();

    await user.type(await screen.findByLabelText(/plan name/i), 'Standard IB');

    const commission = await screen.findByLabelText(/^commission value/i);
    await user.clear(commission);
    await user.type(commission, '12.50');

    const l1 = await screen.findByLabelText(/l1 share/i);
    await user.clear(l1);
    await user.type(l1, '70');

    await user.click(screen.getByRole('button', { name: /create plan/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];

    // Integers are numbers…
    expect(body.position).toBe(1);
    expect(body.settlementWindowHours).toBe(24);

    // …and every monetary or percentage field is still a string, exactly as
    // typed. A number here would be a §6.1 violation, and 12.50 becoming 12.5
    // is the mildest version of the damage.
    expect(body.commissionValue).toBe('12.50');
    expect(typeof body.commissionValue).toBe('string');
    expect(body.l1Share).toBe('70');
    expect(typeof body.l1Share).toBe('string');
    expect(typeof body.l2Share).toBe('string');
  });
});
