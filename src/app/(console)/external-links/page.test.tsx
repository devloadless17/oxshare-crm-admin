import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ExternalLinksPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The portal sidebar's links.
 *
 * ## What this file exists to pin
 *
 * Two things, and the second is most of the file.
 *
 * **Hiding is not deleting.** A link taken off the client menu keeps its title,
 * its description and its position, so the fix for a supplier's five-minute
 * outage is a toggle rather than retyping the row. The row menu has to offer
 * both and they must not be the same action.
 *
 * **The position is a choice from the list, never a number to type.** The order
 * field started as a free number input, blank on add, and every part of that was
 * wrong somewhere the operator could not see it: blank silently meant "append",
 * a typed number past the end was clamped with nothing saying so, and the value
 * shown was the ZERO-BASED storage — "0" being the top of the sidebar, which
 * nobody guesses. The cases below pin the replacement: always populated, always
 * a real slot, labelled from 1, and sent to the API as the zero-based value it
 * has always been.
 */
const { getExternalLinks, createExternalLink, updateExternalLink, deleteExternalLink } = vi.hoisted(
  () => ({
    getExternalLinks: vi.fn(),
    createExternalLink: vi.fn(),
    updateExternalLink: vi.fn(),
    deleteExternalLink: vi.fn(),
  }),
);

/*
 * BOTH the named export and the default — `src/lib/api/index.ts` exports `api`
 * as each, and pages use whichever the author reached for. Mocking only
 * `default` leaves the named one undefined, the page throws on first use, its
 * own catch swallows the TypeError, and the screen renders a generic "failed to
 * load" that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = {
    admin: { getExternalLinks, createExternalLink, updateExternalLink, deleteExternalLink },
  };
  return { api, default: api };
});

const permissions = { current: ALL_PERMISSIONS };

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

const link = (over: Record<string, unknown> = {}) => ({
  id: 'l-1',
  title: 'Calendar',
  description: null,
  url: 'https://example.com/cal',
  enabled: true,
  sortOrder: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getExternalLinks.mockResolvedValue([
    link({ id: 'l-1', title: 'Calendar', sortOrder: 0, description: 'Every release, live' }),
    link({ id: 'l-2', title: 'Help centre', sortOrder: 1 }),
    link({ id: 'l-3', title: 'Telegram', sortOrder: 2, enabled: false }),
  ]);
});

describe('the list', () => {
  it('renders the destination as a link that opens off-site', async () => {
    renderWithProviders(<ExternalLinksPage />);

    /*
     * "Does this go where I think it does" is the question an operator has
     * about a row here, and a truncated string they have to copy out answers it
     * badly. `noopener` because the destination is operator-supplied: without
     * it the opened page gets a handle on this window.
     */
    const anchor = await screen.findByRole('link', { name: /open calendar in a new tab/i });
    expect(anchor).toHaveAttribute('href', 'https://example.com/cal');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('says HIDDEN rather than disabled', async () => {
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Telegram');

    // The link works; it is simply not on the client's menu, and the row keeps
    // everything about it. "Disabled" reads as though something stopped.
    expect(screen.getByText(/^hidden$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^shown$/i).length).toBe(2);
  });

  it('counts the order from 1, not from the stored zero', async () => {
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    /*
     * `sort_order` is zero-based on the wire and no operator reads "0" as the
     * top of a menu. The form's position select counts the same way, so the two
     * agree and the raw value stays where it belongs.
     */
    const orders = screen.getAllByText(/^[123]$/).map((el) => el.textContent);
    expect(orders).toEqual(['1', '2', '3']);
  });
});

describe('the permission keys', () => {
  it('offers nothing to a viewer', async () => {
    permissions.current = ['externallinks.view'];
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    // No Add button, and no row menu — every control here is a write.
    expect(screen.queryByRole('button', { name: /add link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });

  it('lets an editor hide a link but not delete one', async () => {
    /*
     * The split that matters. Hiding is an EDIT — it takes the link off the
     * client menu and keeps the row — so a role trusted to do that is not
     * thereby trusted to remove it.
     */
    permissions.current = ['externallinks.view', 'externallinks.edit'];
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getAllByRole('button', { name: /actions for/i })[0]!);

    const menu = within(await screen.findByRole('menu'));
    expect(menu.getByRole('menuitem', { name: /hide from clients/i })).toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument();
  });
});

describe('hiding', () => {
  it('toggles enabled rather than deleting', async () => {
    updateExternalLink.mockResolvedValue(link({ enabled: false }));
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getAllByRole('button', { name: /actions for Calendar/i })[0]!);
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: /hide from clients/i }),
    );

    // A PATCH, never a DELETE — the title, description and position survive.
    expect(updateExternalLink).toHaveBeenCalledWith('l-1', { enabled: false });
    expect(deleteExternalLink).not.toHaveBeenCalled();
  });
});

/*
 * The position control is Radix, not a native `<select>`, so it is driven the
 * way `clients/page.test.tsx` drives the rows-per-page one: click the trigger,
 * then click an option out of the portalled listbox. There is no `value`
 * attribute to assert against — what the operator sees is the TRIGGER's text,
 * which is what these check.
 */
async function openPositionOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: /position in the sidebar/i }));
  return screen.getAllByRole('option');
}

describe('the position field', () => {
  it('offers one slot more than there are links when adding, and defaults to last', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));

    /*
     * Three links, four slots — the new one. Defaulting to the last is the
     * append that used to be a BLANK FIELD, said out loud: the operator sees
     * where the link is going before they save it.
     *
     * This is also the mount-timing regression. The modal used to be rendered
     * unconditionally, so it seeded on the page's FIRST render — before the
     * query answered, when `linkCount` was 0 — and every new link defaulted to
     * the top of the sidebar with nothing correcting it.
     */
    const trigger = await screen.findByRole('combobox', { name: /position in the sidebar/i });
    expect(trigger).toHaveTextContent('4 — last');
    expect(await openPositionOptions(user)).toHaveLength(4);
  });

  it('names the first and last slots rather than only numbering them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));

    // "4" alone says nothing about a list the operator cannot see from the modal.
    const labels = (await openPositionOptions(user)).map((option) => option.textContent);
    expect(labels).toEqual(['1 — first', '2', '3', '4 — last']);
  });

  it('sends the ZERO-BASED value, so choosing "first" is not silently an append', async () => {
    createExternalLink.mockResolvedValue(link({ id: 'l-4' }));
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));
    await user.type(await screen.findByLabelText(/^title$/i), 'Analysis');
    await user.type(screen.getByLabelText(/^link$/i), 'https://example.com/analysis');
    // Open the listbox first — Radix portals the options, so there is nothing
    // to click until the trigger has been.
    await openPositionOptions(user);
    await user.click(screen.getByRole('option', { name: '1 — first' }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    /*
     * The regression this pins. The create call used to spread the field
     * conditionally — `values.sortOrder ? { sortOrder } : {}` — so position 0,
     * the TOP of the sidebar, was falsy and got dropped, and the API appended
     * instead. Choosing "first" put the link last, silently.
     */
    expect(createExternalLink).toHaveBeenCalledWith({
      title: 'Analysis',
      description: undefined,
      url: 'https://example.com/analysis',
      enabled: true,
      sortOrder: 0,
    });
  });

  it('opens on the link’s current position when editing, with no extra slot', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Help centre');

    await user.click(screen.getAllByRole('button', { name: /actions for Help centre/i })[0]!);
    await user.click(await screen.findByText(/^edit$/i));

    /*
     * Editing moves WITHIN the slots that exist — three links, three options —
     * where adding creates one. Pre-selected where the link already sits, so
     * saving an unrelated change does not move it.
     */
    const trigger = await screen.findByRole('combobox', { name: /position in the sidebar/i });
    expect(trigger).toHaveTextContent('2');
    expect(await openPositionOptions(user)).toHaveLength(3);
  });
});

describe('the form', () => {
  it('refuses to submit a URL a browser would not navigate to', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));
    await user.type(await screen.findByLabelText(/^title$/i), 'Bad');
    await user.type(screen.getByLabelText(/^link$/i), 'javascript:alert(1)');

    /*
     * A courtesy, not the enforcement — the API refuses independently, and it is
     * the authority. What this buys is that the operator is told before the
     * round trip rather than after it.
     */
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    expect(screen.getByText(/not a complete URL/i)).toBeInTheDocument();
  });

  it('keeps the API’s own refusal on screen', async () => {
    createExternalLink.mockRejectedValue({
      response: { status: 400, data: { message: 'A link must be http or https.' } },
    });
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));
    await user.type(await screen.findByLabelText(/^title$/i), 'Analysis');
    await user.type(screen.getByLabelText(/^link$/i), 'https://example.com/analysis');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    /*
     * The refusal IS the explanation the operator gets, and a generic message
     * would throw it away. The modal stays open with what they typed still in
     * it.
     */
    expect(await screen.findByText(/must be http or https/i)).toBeInTheDocument();
  });
});
