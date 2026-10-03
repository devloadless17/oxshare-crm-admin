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
 * **There is no position to choose (owner, 26 Sep 2026).** No order column and
 * no order field: a new link goes to the end of the sidebar and an edited one
 * stays where it is — the API decides both, so neither request carries one.
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

  it('shows no order column', async () => {
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    expect(screen.queryByRole('columnheader', { name: /order/i })).toBeNull();
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
describe('no position field', () => {
  it('adds a link without asking for a position, and sends none', async () => {
    createExternalLink.mockResolvedValue(link({ id: 'l-4' }));
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));
    await user.type(await screen.findByLabelText(/^title$/i), 'Analysis');
    expect(screen.queryByRole('combobox', { name: /position/i })).toBeNull();
    await user.type(screen.getByLabelText(/^link$/i), 'https://example.com/analysis');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // The API puts it last; nothing here decides otherwise.
    expect(createExternalLink).toHaveBeenCalledWith({
      title: 'Analysis',
      description: undefined,
      url: 'https://example.com/analysis',
      enabled: true,
    });
  });

  it('edits a link without sending a position, so it stays where it is', async () => {
    updateExternalLink.mockResolvedValue(link({ id: 'l-2', title: 'Help desk' }));
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Help centre');

    await user.click(screen.getAllByRole('button', { name: /actions for Help centre/i })[0]!);
    await user.click(await screen.findByText(/^edit$/i));
    const title = await screen.findByLabelText(/^title$/i);
    await user.clear(title);
    await user.type(title, 'Help desk');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(updateExternalLink).toHaveBeenCalledWith(
      'l-2',
      expect.not.objectContaining({ sortOrder: expect.anything() }),
    );
    expect(updateExternalLink.mock.calls[0]?.[1]).toMatchObject({ title: 'Help desk' });
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

describe('the Arabic title and description', () => {
  it('sends the Arabic typed, trimmed, beside the English', async () => {
    createExternalLink.mockResolvedValue(link({ id: 'l-4' }));
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');

    await user.click(screen.getByRole('button', { name: /add link/i }));
    await user.type(await screen.findByLabelText(/^title$/i), 'Analysis');
    const titleAr = screen.getByLabelText('Title (Arabic)');
    expect(titleAr).toHaveAttribute('dir', 'rtl');
    expect(titleAr).toHaveAttribute('lang', 'ar');
    expect(titleAr).toHaveAttribute('maxLength', '80');
    expect(screen.getByLabelText('Description (Arabic)')).toHaveAttribute('maxLength', '300');
    await user.type(titleAr, ' تحليل ');
    await user.type(screen.getByLabelText('Description (Arabic)'), 'تحليلات السوق');
    await user.type(screen.getByLabelText(/^link$/i), 'https://example.com/analysis');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(createExternalLink.mock.calls[0]?.[0]).toMatchObject({
      title: 'Analysis',
      titleAr: 'تحليل',
      descriptionAr: 'تحليلات السوق',
    });
  });

  it('prefills the stored Arabic on edit, and sends null once it is cleared', async () => {
    getExternalLinks.mockResolvedValue([
      link({ id: 'l-2', title: 'Help centre', titleAr: 'مركز المساعدة', descriptionAr: 'أسئلة' }),
    ]);
    updateExternalLink.mockResolvedValue(link({ id: 'l-2' }));
    const user = userEvent.setup();
    renderWithProviders(<ExternalLinksPage />);
    // The list shows the Arabic under the English.
    expect(await screen.findByText('مركز المساعدة')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /actions for Help centre/i })[0]!);
    await user.click(await screen.findByText(/^edit$/i));
    const titleAr = await screen.findByLabelText('Title (Arabic)');
    expect(titleAr).toHaveValue('مركز المساعدة');
    await user.clear(titleAr);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(updateExternalLink.mock.calls[0]?.[1]).toMatchObject({
      titleAr: null,
      descriptionAr: 'أسئلة',
    });
  });

  it('marks a link that has no Arabic yet', async () => {
    renderWithProviders(<ExternalLinksPage />);
    await screen.findByText('Calendar');
    expect(screen.getAllByText('No Arabic').length).toBeGreaterThan(0);
  });
});
