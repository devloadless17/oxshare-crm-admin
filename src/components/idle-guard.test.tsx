/*
 * The idle rule, at the console: an administrator who touches nothing for the
 * window is signed out; one who touches anything, in any tab, is not.
 *
 * The server half (tokens that die at "last activity + window") is pinned by
 * the backend's test/admin-idle-timeout.spec.ts.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logout = vi.fn<() => Promise<void>>();
const clearAdminSession = vi.fn<() => void>();
const refreshAdminToken = vi.fn<() => Promise<boolean>>();
const announceSessionEvent = vi.fn<(event: string) => void>();
let admin: { id: string } | null = { id: 'a1' };

vi.mock('@/context/AdminAuthContext', () => ({ useAdmin: () => ({ admin }) }));
vi.mock('@/lib/api/auth', () => ({ authApi: { logout: () => logout() } }));
vi.mock('@/lib/api/client', () => ({
  clearAdminSession: () => clearAdminSession(),
  refreshAdminToken: () => refreshAdminToken(),
}));
vi.mock('@/lib/session-channel', () => ({
  announceSessionEvent: (event: string) => announceSessionEvent(event),
}));

import { IdleGuard } from './idle-guard';
import {
  idleSeconds,
  isIdleExpired,
  needsReport,
  noteReported,
  refreshEveryMs,
  resetActivity,
  resetIdleClockForTests,
  setIdleWindow,
} from '@/lib/idle';

const MIN = 60_000;
const realLocation = window.location;
let location: { pathname: string; search: string; href: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T09:00:00Z'));
  resetIdleClockForTests();
  admin = { id: 'a1' };
  logout.mockReset().mockResolvedValue();
  refreshAdminToken.mockReset().mockResolvedValue(true);
  clearAdminSession.mockReset();
  announceSessionEvent.mockReset();
  location = { pathname: '/clients/1000245', search: '?tab=kyc', href: '' };
  Object.defineProperty(window, 'location', { configurable: true, value: location });
  // A fifteen-minute window and a session that began this instant.
  setIdleWindow(900);
  resetActivity();
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

/** Let `ms` pass, with the guard's one-second clock ticking through it. */
const pass = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('the idle clock', () => {
  it('reports the idle age, and expires only at the window', () => {
    vi.advanceTimersByTime(10 * MIN);
    expect(idleSeconds()).toBe(600);
    expect(isIdleExpired()).toBe(false);
    vi.advanceTimersByTime(5 * MIN);
    expect(isIdleExpired()).toBe(true);
  });

  it('never expires while the window is unknown', () => {
    setIdleWindow(undefined);
    vi.advanceTimersByTime(60 * MIN);
    expect(isIdleExpired()).toBe(false);
    // …and renews on the cadence it had before the rule.
    expect(refreshEveryMs()).toBe(10 * MIN);
  });

  it('counts activity in ANOTHER tab, which only the shared stamp can show', () => {
    vi.advanceTimersByTime(14 * MIN);
    window.localStorage.setItem('oxshare-crm-admin-last-activity', String(Date.now()));
    vi.advanceTimersByTime(5 * MIN);
    expect(isIdleExpired()).toBe(false);
    expect(idleSeconds()).toBe(300);
  });

  it('asks for an immediate report only when the server deadline is close', () => {
    // Deadline = reported + 15 min + 1 min grace; a renewal comes every 3:45.
    expect(refreshEveryMs()).toBe(3.75 * MIN);
    vi.advanceTimersByTime(11 * MIN);
    expect(needsReport()).toBe(false);
    vi.advanceTimersByTime(1 * MIN);
    expect(needsReport()).toBe(true);
    noteReported(Date.now());
    expect(needsReport()).toBe(false);
  });
});

describe('IdleGuard', () => {
  it('stays silent while somebody is working, however long', async () => {
    render(<IdleGuard />);
    for (let i = 0; i < 6; i += 1) {
      await pass(10 * MIN);
      fireEvent.keyDown(window, { key: 'a' });
    }
    expect(screen.queryByRole('status')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('warns in the last minute, and any movement takes the warning away', async () => {
    render(<IdleGuard />);
    await pass(14 * MIN - 2000);
    expect(screen.queryByRole('status')).toBeNull();

    await pass(4000);
    expect(screen.getByRole('status')).toHaveTextContent(/still there/i);

    fireEvent.pointerMove(window);
    await pass(1000);
    expect(screen.queryByRole('status')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs out at the window, on the server, and says why on the sign-in page', async () => {
    render(<IdleGuard />);
    await pass(15 * MIN + 1000);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(announceSessionEvent).toHaveBeenCalledWith('signed-out');
    expect(location.href).toBe(
      `/login?next=${encodeURIComponent('/clients/1000245?tab=kyc')}&reason=idle`,
    );
  });

  it('still leaves the console when the sign-out call cannot reach the API', async () => {
    logout.mockRejectedValue(new Error('network'));
    render(<IdleGuard />);
    await pass(15 * MIN + 1000);

    expect(clearAdminSession).toHaveBeenCalled();
    expect(location.href).toContain('reason=idle');
  });

  it('judges a laptop that slept the moment it wakes', async () => {
    render(<IdleGuard />);
    // Timers do not run while a machine sleeps; the wall clock does.
    vi.setSystemTime(Date.now() + 40 * MIN);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('tells the server at once when somebody returns near the end of the window', async () => {
    render(<IdleGuard />);
    await pass(13 * MIN);
    fireEvent.pointerDown(window);

    expect(refreshAdminToken).toHaveBeenCalledTimes(1);
    // …and not again on the next mouse move.
    fireEvent.pointerMove(window);
    expect(refreshAdminToken).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a signed-out visitor', async () => {
    admin = null;
    render(<IdleGuard />);
    await pass(60 * MIN);
    expect(logout).not.toHaveBeenCalled();
    expect(location.href).toBe('');
  });
});
