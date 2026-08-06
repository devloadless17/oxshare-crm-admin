import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { IpAllowlistPanel } from './ip-allowlist-panel';

/**
 * RBAC-08 — the screen that decides which networks reach the admin API.
 *
 * What is pinned here is not the list rendering; it is the two facts that make
 * this feature safe or dangerous, and which a later "tidy-up" would quietly
 * remove:
 *
 *  1. An EMPTY list means the protection is OFF. If the screen does not say so
 *     plainly, an operator sees a page called "Network Access", no errors, and
 *     concludes they are protected when nothing is enforced.
 *  2. The FIRST rule switches enforcement on immediately, so a rule that does
 *     not cover the machine you are using costs you this screen. The API refuses
 *     it, but a warning beforehand beats a rejection afterwards.
 */

const { getIpAllowlist, addIpAllowlistRule, removeIpAllowlistRule } = vi.hoisted(() => ({
  getIpAllowlist: vi.fn(),
  addIpAllowlistRule: vi.fn(),
  removeIpAllowlistRule: vi.fn(),
}));

// Both exports — lib/api/index.ts exposes `api` as a named export AND as default.
// Mocking only `default` leaves the named one undefined, the fetcher throws, and
// the screen shows its generic failure state, which reads as a broken query
// rather than a broken mock.
vi.mock('@/lib/api', () => {
  const api = { admin: { getIpAllowlist, addIpAllowlistRule, removeIpAllowlistRule } };
  return { api, default: api };
});

const rule = (over: Partial<{ id: string; cidr: string; label: string }> = {}) => ({
  id: 'rule-1',
  cidr: '203.0.113.0/24',
  label: 'Beirut office',
  createdBy: 'admin-1',
  createdAt: new Date('2026-08-01').toISOString(),
  ...over,
});

const status = (
  over: Partial<{ enforced: boolean; yourIp: string | null; rules: unknown[] }> = {},
) => ({
  enforced: false,
  yourIp: '203.0.113.9',
  rules: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getIpAllowlist.mockResolvedValue(status());
  addIpAllowlistRule.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
  removeIpAllowlistRule.mockResolvedValue({ message: 'Rule removed.' });
});

describe('what the screen says about enforcement', () => {
  it('says plainly that an empty list means the protection is OFF', async () => {
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByText(/not enforced/i)).toBeInTheDocument();
    // Not just "no rules" — the consequence has to be stated.
    expect(screen.getByText(/switched OFF/i)).toBeInTheDocument();
  });

  it('says it is enforced, and how many rules, once there are any', async () => {
    getIpAllowlist.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByText(/enforced — 1 rule/i)).toBeInTheDocument();
  });

  it('shows the admin their own address, so they can tell whether a rule covers them', async () => {
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByText('203.0.113.9')).toBeInTheDocument();
  });

  /**
   * The failure mode this whole block exists for: a control that is OFF while
   * the screen says it is ON.
   *
   * A `/0` rule makes the list non-empty, so the API answers `enforced: true`
   * and, before this, the panel drew a green shield reading "Enforced — 1 rule"
   * over an allowlist admitting the entire internet. The API now refuses to add
   * one, but rows predating that check — or written by direct SQL — still exist,
   * and this screen is the only place anyone would ever notice.
   */
  it('refuses to call a /0 rule "enforced", and names it', async () => {
    getIpAllowlist.mockResolvedValue(
      status({ enforced: true, rules: [rule({ cidr: '0.0.0.0/0', label: 'Everywhere' })] }),
    );
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/not effectively enforced/i)).toBeInTheDocument();
    expect(screen.queryByText(/^enforced — /i)).not.toBeInTheDocument();
    // Loud enough to interrupt: this is a live exposure, not a hint. And it
    // must NAME the offending rule — "something is wrong" without saying which
    // row leaves the operator hunting through the list.
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/matches every address/i);
    expect(banner).toHaveTextContent('0.0.0.0/0');
  });

  it('flags a /0 even when other, genuine rules are present', async () => {
    // The dangerous shape in practice: someone adds a real office range, then a
    // `/0` "temporarily", and the count in the banner still looks reassuring.
    getIpAllowlist.mockResolvedValue(
      status({
        enforced: true,
        rules: [rule(), rule({ id: 'rule-2', cidr: '::/0', label: 'Temp' })],
      }),
    );
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/not effectively enforced/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('::/0');
  });

  it('does not mistake a merely broad rule for a /0', async () => {
    // `10.0.0.0/20` ends in `0` but not in `/0`. Getting this wrong would cry
    // wolf on ordinary corporate ranges, and an alarm that is usually wrong is
    // one people learn to click past.
    getIpAllowlist.mockResolvedValue(
      status({ enforced: true, rules: [rule({ cidr: '10.0.0.0/20' })] }),
    );
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/enforced — 1 rule/i)).toBeInTheDocument();
    expect(screen.queryByText(/not effectively enforced/i)).not.toBeInTheDocument();
  });
});

describe('the lockout warning', () => {
  it('warns before the FIRST rule, which is the one that starts enforcement', async () => {
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByRole('note')).toHaveTextContent(/first rule/i);
  });

  it('does NOT warn once rules exist — later ones cannot lock you out', async () => {
    // The existing rules still cover you, so adding a branch office you are not
    // sitting in is an ordinary thing to do and should not be alarmed about.
    getIpAllowlist.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByText(/enforced/i);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('adding a rule', () => {
  it('sends the address and the label', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByLabelText(/address or range/i);

    await user.type(screen.getByLabelText(/address or range/i), '198.51.100.0/24');
    await user.type(screen.getByLabelText(/what is it/i), 'Datacentre');
    await user.click(screen.getByRole('button', { name: /add rule/i }));

    await waitFor(() =>
      expect(addIpAllowlistRule).toHaveBeenCalledWith({
        cidr: '198.51.100.0/24',
        label: 'Datacentre',
      }),
    );
  });

  it('will not submit without a label', async () => {
    // An unlabelled list is one nobody dares to prune later, so the rule is
    // enforced at both ends rather than hoped for.
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByLabelText(/address or range/i);

    await user.type(screen.getByLabelText(/address or range/i), '198.51.100.0/24');
    expect(screen.getByRole('button', { name: /add rule/i })).toBeDisabled();
    expect(addIpAllowlistRule).not.toHaveBeenCalled();
  });

  it("surfaces the server's refusal verbatim, including the lockout message", async () => {
    // The API refuses a first rule that excludes you, and its message names your
    // address. Replacing it with something generic loses the one detail that
    // tells the operator what to type instead.
    addIpAllowlistRule.mockRejectedValue({
      response: {
        data: {
          message:
            'Refusing: this would be the first rule … your own address (203.0.113.9) is not inside 198.51.100.0/24.',
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByLabelText(/address or range/i);

    await user.type(screen.getByLabelText(/address or range/i), '198.51.100.0/24');
    await user.type(screen.getByLabelText(/what is it/i), 'Wrong');
    await user.click(screen.getByRole('button', { name: /add rule/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/203\.0\.113\.9/);
  });
});

describe('removing a rule', () => {
  it('asks first, and does nothing if declined', async () => {
    getIpAllowlist.mockResolvedValue(
      status({ enforced: true, rules: [rule(), rule({ id: 'r-2', cidr: '10.0.0.0/8' })] }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);

    await user.click(await screen.findByRole('button', { name: /remove 203\.0\.113\.0\/24/i }));
    expect(removeIpAllowlistRule).not.toHaveBeenCalled();
  });

  it('warns that removing the LAST rule switches the protection off', async () => {
    // A far bigger consequence than deleting one row, and the only place the
    // operator will find out before it happens.
    getIpAllowlist.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);

    await user.click(await screen.findByRole('button', { name: /remove/i }));
    expect(confirm.mock.calls[0]?.[0]).toMatch(/switches this protection OFF/i);
  });

  it('removes once confirmed', async () => {
    getIpAllowlist.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);

    await user.click(await screen.findByRole('button', { name: /remove/i }));
    await waitFor(() => expect(removeIpAllowlistRule).toHaveBeenCalledWith('rule-1'));
  });
});

describe('permission gating', () => {
  it('offers no way to change anything without roles.manage', async () => {
    // Client-side gating is UX, not security — PermissionsGuard answers 403
    // independently. But rendering controls that always 403 is its own defect.
    getIpAllowlist.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
    renderWithProviders(<IpAllowlistPanel canManage={false} />);

    await screen.findByText(/enforced/i);
    expect(screen.queryByLabelText(/address or range/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add rule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('still shows the rules and the enforcement state read-only', async () => {
    getIpAllowlist.mockResolvedValue(status({ enforced: true, rules: [rule()] }));
    renderWithProviders(<IpAllowlistPanel canManage={false} />);
    expect(await screen.findByText('203.0.113.0/24')).toBeInTheDocument();
  });
});

describe('failure states', () => {
  it('offers a retry when the list cannot be loaded', async () => {
    getIpAllowlist.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the endpoints when the API is not built yet', async () => {
    getIpAllowlist.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByText(/GET \/admin\/ip-allowlist/)).toBeInTheDocument();
  });
});
