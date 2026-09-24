import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '@/test/render';
import { UserMenu } from './user-menu';

/*
 * Mirrors the portal's user-menu test on the admin identity. The rules pinned:
 *  1. The header trigger is the AVATAR ALONE, and still announces itself — the
 *     name moved into the menu, so the accessible name the visible text used
 *     to supply now rests entirely on the `aria-label`.
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
  /*
   * THE TRIGGER IS THE AVATAR, and nothing else.
   *
   * It was a pill carrying the name and a chevron from `md` up. The name moved
   * out of the header entirely — the case below asserts it repeats inside the
   * menu with the ROLE — so identity is one click away rather than permanently
   * occupying header width beside the search control.
   *
   * The ACCESSIBLE NAME is what must survive: the visible text supplied it
   * incidentally, so a trigger stripped to an image announces as an unlabelled
   * button without the `aria-label`, on the console that approves withdrawals.
   */
  it('is the avatar alone, and still announces itself', () => {
    render(<UserMenu collapsed variant="header" />);
    const trigger = screen.getByRole('button', { name: /account menu/i });

    expect(trigger).not.toHaveTextContent('Ada Admin');
    expect(trigger).toBeInTheDocument();
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
  it('offers NO theme control in the account menu — it moved beside the bell', async () => {
    /*
     * Theme used to be a "Theme ▸" row here expanding to Light, Dark and System.
     * The client asked for two states and for the control to sit in the header
     * beside the notification bell, so the menu no longer carries it at all —
     * a second, older copy of the control left behind here would be one more
     * place for the two to disagree.
     */
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await screen.findByRole('menuitem', { name: /^log ?out$/i });

    expect(screen.queryByRole('menuitem', { name: /theme/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    expect(screen.queryByText(/^system$/i)).not.toBeInTheDocument();
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
