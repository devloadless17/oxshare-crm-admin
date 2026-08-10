import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Laptop } from 'lucide-react';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import { AdminSessionsPanel, describeDevice } from './admin-sessions-panel';

/**
 * The session list, and the one control on it that must NOT be drawn.
 *
 * Two things are worth pinning here. The first is that the current session has
 * no sign-out button: the server refuses to revoke it, so rendering one offers
 * an action that is never valid and reports a 400 as though the operator had
 * done something wrong. The second is `describeDevice`, which is a pile of
 * regexes over strings nobody reads carefully — and whose two ordering
 * constraints (Chrome before Safari, iOS before macOS) are invisible until they
 * are wrong.
 */

const { sessions, revokeSession } = vi.hoisted(() => ({
  sessions: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ authApi: { sessions, revokeSession } }));

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Safari/604';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  createdAt: '2026-08-01T09:00:00.000Z',
  lastActiveAt: '2026-08-08T09:00:00.000Z',
  expiresAt: '2026-09-01T09:00:00.000Z',
  userAgent: CHROME,
  ip: '198.51.100.4',
  current: false,
  ...over,
});

beforeEach(() => {
  sessions.mockReset();
  revokeSession.mockReset();
});

describe('AdminSessionsPanel', () => {
  it('draws no sign-out button for the session making the request', async () => {
    sessions.mockResolvedValue([row({ current: true })]);
    renderWithProviders(<AdminSessionsPanel icon={Laptop} />);

    // Awaits something the QUERY renders, not a header — the header is present
    // during `loading`, so awaiting it would assert against an empty list.
    expect(await screen.findByText('This device')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });

  it('draws one for every other session', async () => {
    sessions.mockResolvedValue([row({ current: true }), row({ id: 'other-id', current: false })]);
    renderWithProviders(<AdminSessionsPanel icon={Laptop} />);

    const buttons = await screen.findAllByRole('button', { name: /sign out/i });
    expect(buttons).toHaveLength(1);
  });

  it('confirms before ending one, and names the device in the question', async () => {
    // The confirmation is the whole safety of this control: the row label alone
    // is "Chrome · Windows", which is every second machine in the building.
    const user = userEvent.setup();
    sessions.mockResolvedValue([row({ id: 'doomed-id' })]);
    revokeSession.mockResolvedValue({ message: 'ok' });

    renderWithProviders(<AdminSessionsPanel icon={Laptop} />);
    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    const dialog = await answerConfirm(user, 'confirm');
    expect(dialog).toMatch(/Chrome · Windows/);
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('doomed-id'));
  });

  it('sends nothing when the confirmation is declined', async () => {
    const user = userEvent.setup();
    sessions.mockResolvedValue([row({ id: 'spared-id' })]);

    renderWithProviders(<AdminSessionsPanel icon={Laptop} />);
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    await answerConfirm(user, 'cancel');

    expect(revokeSession).not.toHaveBeenCalled();
  });

  it('says the address was not recorded rather than leaving a gap', async () => {
    // `null` for sessions predating capture. A blank there reads as a render
    // bug; the words say which fact is missing.
    sessions.mockResolvedValue([row({ ip: null, current: true })]);
    renderWithProviders(<AdminSessionsPanel icon={Laptop} />);

    expect(await screen.findByText(/address not recorded/)).toBeInTheDocument();
  });
});

describe('describeDevice', () => {
  it('reports Chrome, not Safari, for a Chrome user agent', () => {
    // EVERY Chrome UA also contains "Safari". Testing Safari first is the
    // classic version of this bug and would label every desktop row wrong.
    expect(describeDevice(CHROME)).toBe('Chrome · Windows');
  });

  it('reports iOS, not macOS, for an iPhone', () => {
    // iOS user agents carry "like Mac OS X", so the Mac test has to come after.
    expect(describeDevice(IPHONE)).toMatch(/iOS$/);
  });

  it('says it does not know rather than guessing', () => {
    // A wrong device name is worse than none: it would talk somebody out of
    // ending a session they should end.
    expect(describeDevice(null)).toBe('Unrecognised device');
    expect(describeDevice('curl/8.4.0')).toBe('Unrecognised device');
  });

  it('treats an absent user agent the same as a null one', () => {
    // The generated DTO field is optional, so `undefined` and `null` both reach
    // here and both mean "nothing was recorded".
    expect(describeDevice(undefined)).toBe('Unrecognised device');
  });
});
