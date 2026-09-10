import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '@/test/render';
import { UserMenu } from './user-menu';

/*
 * Mirrors the portal's user-menu test on the admin identity. The rules pinned:
 *  1. The header trigger carries the operator's NAME (the top-right pill).
 *  2. A FAILED sign-out keeps the menu open with the error visible inside it,
 *     and never pretends the session ended — on the console that approves
 *     withdrawals, a silent failed sign-out is the worst outcome available.
 */

const logout = vi.fn();

/*
 * Radix 2.1.24 (newer than the portal's) refuses jsdom's synthetic pointer
 * sequence, so the menu is opened by KEYBOARD — which is also the interaction
 * the aria contract actually promises.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: /account menu/i });
  trigger.focus();
  await user.keyboard('{Enter}');
}
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      name: 'Ada Admin',
      email: 'ada@oxshare.com',
      roleName: 'Administrator',
      avatarUrl: null,
    },
    logout,
  }),
}));

vi.mock('@/lib/toast', () => ({ toastError: vi.fn() }));

beforeEach(() => logout.mockReset());

describe('the header account menu', () => {
  it('shows the operator name in the trigger pill', () => {
    render(<UserMenu collapsed variant="header" />);
    expect(screen.getByRole('button', { name: /account menu/i })).toHaveTextContent('Ada Admin');
  });

  it('opens with Profile, Theme and Log out, repeating the identity and ROLE inside', async () => {
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await openMenu(user);

    expect(await screen.findByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^logout$/i })).toBeInTheDocument();
    // The role, not the email — "what can I do here" is the operator's question.
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  /*
   * `Theme ▸` expands IN PLACE — the regression this pins.
   *
   * As a `DropdownMenuSub` it opened a second panel to the SIDE of a menu
   * already anchored to the right edge of the header. At 393px there is no room
   * there, so Radix flipped it left and it hung off the parent over the page
   * content. The three options arriving in the SAME menu is what makes that
   * impossible to reintroduce, and `queryByRole('menu')` staying at one panel is
   * how this test can tell "expanded below" from "flew out beside".
   *
   * Asserting them as `menuitemradio` also pins that the control is still a
   * radio group rather than three loose buttons.
   */
  it('expands Light, Dark and System into the same menu', async () => {
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await openMenu(user);

    const theme = await screen.findByRole('menuitem', { name: /theme/i });
    // Collapsed to start with, exactly as the submenu row was.
    expect(theme).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();

    await user.click(theme);

    for (const name of [/^light$/i, /^dark$/i, /^system$/i]) {
      expect(await screen.findByRole('menuitemradio', { name })).toBeInTheDocument();
    }
    // One panel, not two: the options are rows in the menu that was already open.
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('a failed sign-out keeps the menu open and says so INSIDE it', async () => {
    logout.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /^logout$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/still signed in/i);
    expect(screen.getByRole('menuitem', { name: /^logout$/i })).toBeInTheDocument();
  });

  it('a successful sign-out closes the menu and renders no error', async () => {
    logout.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /^logout$/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
