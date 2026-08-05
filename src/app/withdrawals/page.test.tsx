import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import WithdrawalsPage from './page';

/**
 * The withdrawal queue — where money actually leaves the platform.
 *
 * What is pinned here is the state machine and the money rules, because both are
 * enforced only by this screen's conventions today:
 *
 *  - amounts are rendered as the STRINGS the API sent (§6.1). A JS number here
 *    silently truncates past 2^53 and drops trailing zeros on a payout figure.
 *  - the lifecycle is pending -> approved -> settled. Approve/Reject appear only
 *    for pending, Mark Paid only for approved, and a settled row offers nothing.
 *  - settling requires the provider's reference, which backs
 *    UNIQUE(provider, provider_ref) server-side and is what makes settlement
 *    idempotent (§6.3) — so an empty one must be impossible to submit.
 *  - without withdrawals.approve the screen is read-only. Client-side gating is
 *    UX rather than security (the API enforces its own 403), but a reviewer who
 *    can see buttons they cannot use will file it as a bug.
 */

const { get, patch, getRejectionReasons } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  getRejectionReasons: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get, patch, admin: { getRejectionReasons } },
}));

const permissions = { current: ['*'] as string[] };

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

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'w-1',
    userId: 'u-1',
    // 8dp string, exactly as NUMERIC(28,8) serialises it.
    amount: '300.00000000',
    currency: 'USD',
    state: 'pending',
    provider: 'whish',
    destination: 'IBAN-LB-123',
    createdAt: '2026-08-03T15:25:26.524Z',
    user: { email: 'client@oxshare.com', firstName: 'John', lastName: 'Doe' },
    ...over,
  };
}

function page(rows: Record<string, unknown>[]) {
  return { items: rows, total: rows.length, page: 1, limit: 20 };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  get.mockResolvedValue({ data: page([row()]) });
  patch.mockResolvedValue({ data: {} });
  getRejectionReasons.mockResolvedValue([
    { id: 'r-1', context: 'withdrawal', label: 'Name mismatch', createdAt: '2026-08-01T00:00:00Z' },
  ]);
});

describe('withdrawal queue — money rendering', () => {
  it('renders the amount as the string the API sent, not a parsed number', async () => {
    renderWithProviders(<WithdrawalsPage />);

    // 300.00000000, not 300 — the trailing precision is part of the value, and
    // Number() would have eaten it.
    expect(await screen.findByText('300.00000000')).toBeInTheDocument();
  });

  it('keeps precision a float could not hold', async () => {
    get.mockResolvedValue({ data: page([row({ amount: '12345678901234567.89012345' })]) });

    renderWithProviders(<WithdrawalsPage />);

    expect(await screen.findByText('12345678901234567.89012345')).toBeInTheDocument();
  });
});

describe('withdrawal queue — lifecycle gating', () => {
  it('offers Approve and Reject for a pending request', async () => {
    renderWithProviders(<WithdrawalsPage />);

    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark paid/i })).toBeNull();
  });

  it('offers only Mark Paid once approved', async () => {
    get.mockResolvedValue({ data: page([row({ state: 'approved' })]) });
    renderWithProviders(<WithdrawalsPage />);

    expect(await screen.findByRole('button', { name: /mark paid/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^reject$/i })).toBeNull();
  });

  it('offers no action on a settled request', async () => {
    get.mockResolvedValue({ data: page([row({ state: 'success', providerRef: 'whish-1' })]) });
    renderWithProviders(<WithdrawalsPage />);

    await screen.findByText('300.00000000');
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark paid/i })).toBeNull();
  });

  it('is read-only without the withdrawals.approve permission', async () => {
    permissions.current = ['withdrawals.view'];
    renderWithProviders(<WithdrawalsPage />);

    expect(await screen.findByText(/view only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
  });
});

describe('withdrawal queue — approving', () => {
  it('approves the request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalsPage />);

    await user.click(await screen.findByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[0]).toBe('/admin/withdrawals/w-1/approve');
  });
});

describe('withdrawal queue — settling', () => {
  it('will not settle without the provider reference', async () => {
    get.mockResolvedValue({ data: page([row({ state: 'approved' })]) });
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalsPage />);

    await user.click(await screen.findByRole('button', { name: /mark paid/i }));

    // UNIQUE(provider, provider_ref) is what makes settlement idempotent, so an
    // empty reference must not be submittable.
    const confirm = await screen.findByRole('button', { name: /confirm payment/i });
    expect(confirm).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  });

  it('sends the trimmed provider reference', async () => {
    get.mockResolvedValue({ data: page([row({ state: 'approved' })]) });
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalsPage />);

    await user.click(await screen.findByRole('button', { name: /mark paid/i }));
    await user.type(await screen.findByLabelText(/provider reference/i), '  whish-payout-9911  ');

    await user.click(await screen.findByRole('button', { name: /confirm payment/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [url, body] = patch.mock.calls[0] as [string, { providerRef: string }];
    expect(url).toBe('/admin/withdrawals/w-1/settle');
    expect(body.providerRef).toBe('whish-payout-9911');
  });
});

/**
 * A double-clicked money action must be one operation — R-5.2.
 *
 * The state guards (`UPDATE … WHERE state = 'pending'`) already make a replayed
 * CAUSE a no-op. They do nothing about a replayed REQUEST: two clicks race, both
 * read `pending`, and only the rowcount check decides which one loses — after
 * both have reached the service. The key is what makes the second request a
 * replay of the first rather than a second operation.
 *
 * It is derived from the action and the row, not generated randomly, because
 * that is what the key means: approving withdrawal X is one intent however many
 * times the button is pressed.
 */
describe('idempotency on the money actions', () => {
  it('sends a stable key derived from the action and the row', async () => {
    const user = userEvent.setup();
    permissions.current = ['*'];
    renderWithProviders(<WithdrawalsPage />);

    await user.click(await screen.findByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [url, , config] = patch.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    const id = url.split('/')[3];

    expect(config.headers['Idempotency-Key']).toBe(`approve:${id}`);
  });

  it('sends the SAME key when the button is pressed twice', async () => {
    // The assertion that matters. Two distinct keys would present the second
    // click as a new withdrawal approval, which is the bug the header prevents.
    const user = userEvent.setup();
    permissions.current = ['*'];
    renderWithProviders(<WithdrawalsPage />);

    const button = await screen.findByRole('button', { name: /^approve$/i });
    await user.click(button);
    await user.click(button);

    await waitFor(() => expect(patch.mock.calls.length).toBeGreaterThanOrEqual(2));
    const keys = patch.mock.calls.map(
      (call) => (call[2] as { headers: Record<string, string> }).headers['Idempotency-Key'],
    );
    expect(new Set(keys).size).toBe(1);
  });
});
