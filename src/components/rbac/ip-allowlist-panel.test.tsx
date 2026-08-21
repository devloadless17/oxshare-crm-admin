import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import { IpAllowlistPanel } from './ip-allowlist-panel';

/**
 * RBAC-08 — the screen that decides which networks reach the console.
 *
 * What is pinned here is not the list rendering; it is the three facts that make
 * this feature safe or dangerous, and which a later tidy-up would quietly
 * remove. This feature was DELETED ONCE because it caused problems in practice,
 * so every case below is about the screen refusing to mislead an operator.
 *
 *  1. An EMPTY list means the protection is OFF. Without that said in words, an
 *     operator sees a page called "Network access", no errors, and concludes
 *     they are protected when nothing is enforced.
 *  2. Rules present but enforcement switched off by configuration is a THIRD
 *     state. A green shield over it would be the worst screen in the console.
 *  3. The address shown is the one the SERVER sees. Behind the console's dev
 *     proxy that is ::1, not the operator's public address — and a rule written
 *     for the address they can see is one the server can never match. That
 *     confusion is what made this painful enough to delete.
 */
const { getIpAllowlist, addIpAllowlistRule, removeIpAllowlistRule } = vi.hoisted(() => ({
  getIpAllowlist: vi.fn(),
  addIpAllowlistRule: vi.fn(),
  removeIpAllowlistRule: vi.fn(),
}));

// Both exports — see the note in leverages/page.test.tsx.
vi.mock('@/lib/api', () => {
  const api = { admin: { getIpAllowlist, addIpAllowlistRule, removeIpAllowlistRule } };
  return { api, default: api };
});

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'rule-1',
  cidr: '203.0.113.0/24',
  label: 'Beirut office',
  createdBy: 'a-1',
  createdAt: '2026-08-20T10:00:00.000Z',
  ...over,
});

const status = (over: Record<string, unknown> = {}) => ({
  enforced: true,
  disabledByConfig: false,
  yourIp: '203.0.113.5',
  rules: [rule()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getIpAllowlist.mockResolvedValue(status());
  addIpAllowlistRule.mockResolvedValue(rule());
  removeIpAllowlistRule.mockResolvedValue({ message: 'ok' });
});

describe('what the screen says about enforcement', () => {
  it('says plainly that an empty list means the protection is OFF', async () => {
    getIpAllowlist.mockResolvedValue(status({ enforced: false, rules: [] }));
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/protection is OFF/i)).toBeInTheDocument();
    expect(screen.getByText(/reachable from any network/i)).toBeInTheDocument();
  });

  it('says it is enforcing, and over how many networks, when it is', async () => {
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByText(/enforcing/i)).toBeInTheDocument();
  });

  it('NEVER claims to be enforcing when configuration has switched it off', async () => {
    // The third state. The rules are saved and none of them is applied.
    getIpAllowlist.mockResolvedValue(status({ enforced: false, disabledByConfig: true }));
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/switched OFF by configuration/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Enforcing\./i)).toBeNull();
    // And the rules are still listed, because they still exist.
    expect(screen.getByText('203.0.113.0/24')).toBeInTheDocument();
  });
});

describe('the address, explained rather than printed', () => {
  it('says the address is the one the SERVER sees', async () => {
    // Printing it bare invites an operator to compare it with a "what is my IP"
    // site, see a different number, and conclude the console is broken.
    renderWithProviders(<IpAllowlistPanel canManage />);
    expect(await screen.findByText(/the address the SERVER sees/i)).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.5/)).toBeInTheDocument();
  });

  it('warns rather than showing nothing when the address is unknown', async () => {
    // An unknown address is a denial once any rule exists, so adding one now
    // would lock the operator out.
    getIpAllowlist.mockResolvedValue(status({ yourIp: null }));
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/could not determine the address/i)).toBeInTheDocument();
  });
});

describe('the first rule is the dangerous one', () => {
  it('warns before it, because it starts enforcement', async () => {
    getIpAllowlist.mockResolvedValue(status({ enforced: false, rules: [] }));
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByText(/this is the FIRST rule/i)).toBeInTheDocument();
  });

  it('does not repeat that warning once rules exist', async () => {
    // Repeating it on every add trains people to ignore it.
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByText('203.0.113.0/24');

    expect(screen.queryByText(/this is the FIRST rule/i)).toBeNull();
  });
});

describe('who may change it', () => {
  it('offers no add form and no remove control without the edit key', async () => {
    renderWithProviders(<IpAllowlistPanel canManage={false} />);
    await screen.findByText('203.0.113.0/24');

    expect(screen.queryByRole('button', { name: /add rule/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('sends the rule the operator typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByText('203.0.113.0/24');

    await user.type(screen.getByLabelText(/address or range/i), '198.51.100.0/24');
    await user.type(screen.getByLabelText(/what is it/i), 'VPN');
    await user.click(screen.getByRole('button', { name: /add rule/i }));

    expect(addIpAllowlistRule).toHaveBeenCalledWith({ cidr: '198.51.100.0/24', label: 'VPN' });
  });

  it('asks before removing a rule, and does nothing if declined', async () => {
    // Removing the last rule covering you is a lockout; the API refuses it, and
    // being asked first beats reading the refusal. Through the app's own
    // confirm dialog — this was the last `window.confirm` in the console.
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByText('203.0.113.0/24');

    await user.click(screen.getByRole('button', { name: /remove 203\.0\.113\.0\/24/i }));
    const asked = await answerConfirm(userEvent, 'cancel');

    expect(asked).toContain('203.0.113.0/24');
    expect(removeIpAllowlistRule).not.toHaveBeenCalled();
  });

  it('surfaces the API refusal instead of pretending the change worked', async () => {
    // The lockout refusals are the messages that matter most on this screen.
    removeIpAllowlistRule.mockRejectedValue(
      Object.assign(new Error('nope'), {
        response: {
          status: 400,
          data: { message: 'That is the last rule covering your own address.' },
        },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<IpAllowlistPanel canManage />);
    await screen.findByText('203.0.113.0/24');

    await user.click(screen.getByRole('button', { name: /remove 203\.0\.113\.0\/24/i }));
    await answerConfirm(userEvent, 'confirm');

    expect(await screen.findByRole('alert')).toHaveTextContent(/last rule covering/i);
  });
});

describe('load failure', () => {
  it('offers a retry rather than an empty list that reads as "no rules"', async () => {
    // "We could not read it" and "there are none" mean opposite things here:
    // one of them says the console is open to the internet.
    getIpAllowlist.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<IpAllowlistPanel canManage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/protection is OFF/i)).toBeNull();
  });
});
