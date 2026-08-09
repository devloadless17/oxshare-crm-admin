import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import TagsPage from './page';

/**
 * ADM-14's vocabulary screen.
 *
 * What is pinned here is not the table — it is the two places this screen can
 * mislead an operator into a change they cannot undo:
 *
 *  1. The client count has to be a LINK. A count nobody can act on is a number
 *     on a screen, and it is the requirement that made URL-state on the client
 *     list non-optional.
 *  2. Deleting a tag has to name its CONSEQUENCES before it happens — it
 *     un-tags every client carrying it, and any administrator restricted to it
 *     would lose that restriction. An empty scope means UNRESTRICTED, so that
 *     second one is a privilege change performed by a delete on a label.
 */

const { getTags, createTag, updateTag, deleteTag } = vi.hoisted(() => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getTags, createTag, updateTag, deleteTag } };
  return { api, default: api };
});

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

const tag = (over: Record<string, unknown> = {}) => ({
  id: 'tag-1',
  slug: 'high-risk',
  label: 'High risk',
  color: '#b91c1c',
  description: 'Enhanced due diligence',
  clientCount: 4,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ['*'];
  getTags.mockResolvedValue([tag()]);
  createTag.mockResolvedValue(tag());
  updateTag.mockResolvedValue(tag());
  deleteTag.mockResolvedValue({ message: 'Tag deleted.' });
});

describe('listing', () => {
  it('shows each tag with its link name', async () => {
    renderWithProviders(<TagsPage />);

    expect(await screen.findByText('High risk')).toBeInTheDocument();
    // The slug is shown because it is what appears in shared links, and an
    // operator renaming a tag needs to see that the link still works.
    expect(screen.getByText('high-risk')).toBeInTheDocument();
  });

  it('makes the client count a link INTO the filtered client list', async () => {
    renderWithProviders(<TagsPage />);

    const link = await screen.findByRole('link', { name: /4 clients/i });
    expect(link).toHaveAttribute('href', '/clients?tag=high-risk');
  });

  it('does not link a tag nobody carries', async () => {
    // A link to an empty segment is a promise of rows that are not there.
    getTags.mockResolvedValue([tag({ clientCount: 0 })]);
    renderWithProviders(<TagsPage />);

    await screen.findByText('High risk');
    expect(screen.queryByRole('link', { name: /clients/i })).not.toBeInTheDocument();
  });
});

describe('permission gating', () => {
  it('hides create, edit and delete without tags.manage', async () => {
    // Client-side gating is UX, not security — the API enforces `tags.manage`
    // independently — but offering a control that always 403s is worse than
    // not offering it.
    permissions.current = ['tags.view'];
    renderWithProviders(<TagsPage />);

    await screen.findByText('High risk');
    expect(screen.queryByRole('button', { name: /new tag/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  it('still lists the tags read-only', async () => {
    permissions.current = ['tags.view'];
    renderWithProviders(<TagsPage />);
    expect(await screen.findByText('High risk')).toBeInTheDocument();
  });
});

describe('creating', () => {
  it('sends the label and lets the API derive the link name', async () => {
    /*
     * No slug input, deliberately. Asking a person for two names for one thing
     * produces `High Risk`, `high_risk` and `highrisk` in the same table inside
     * a week — and the slug is what saved links depend on.
     */
    renderWithProviders(<TagsPage />);
    await screen.findByText('High risk');

    await userEvent.click(screen.getByRole('button', { name: /new tag/i }));
    await userEvent.type(screen.getByLabelText(/label/i), 'VIP');
    // Scoped to the dialog: the page header's "New tag" button is still in the
    // document behind the modal, and both match a loose name query.
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^new tag$/i }));

    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(createTag.mock.calls[0]?.[0]).toMatchObject({ label: 'VIP' });
  });
});

/**
 * Open a row's three-dot menu and choose an item from it.
 *
 * Delete used to be a button sitting in the row, reachable in one click. It is
 * now behind the shared `RowActions` trigger, so every test that acts on a row
 * needs the two steps the operator now takes — which is the point of the menu:
 * destroying a tag is no longer one stray click away from editing it.
 *
 * The trigger is named for its ROW (`table.rowActions` → "Actions for X"), so
 * this finds the right one on a table with several.
 */
async function chooseRowAction(rowName: RegExp, itemName: RegExp) {
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(`actions for ${rowName.source}`, 'i') }),
  );
  // Scoped to the menu: Radix renders it in a portal, and an unscoped query
  // would also match same-named controls elsewhere on the page.
  await userEvent.click(
    within(await screen.findByRole('menu')).getByRole('menuitem', { name: itemName }),
  );
}

describe('deleting', () => {
  it('names the CONSEQUENCES before doing it', async () => {
    renderWithProviders(<TagsPage />);
    await screen.findByText('High risk');

    await chooseRowAction(/high risk/, /delete/i);
    const message = await answerConfirm(userEvent, 'cancel');

    // How many clients lose the label…
    expect(message).toContain('4');
    // …and that an administrator restricted to it is affected. That is a
    // privilege change performed by a delete on a label, and it is the half
    // nobody expects.
    expect(message).toMatch(/administrator/i);

    expect(deleteTag).not.toHaveBeenCalled();
  });

  it('deletes once confirmed', async () => {
    renderWithProviders(<TagsPage />);
    await screen.findByText('High risk');

    await chooseRowAction(/high risk/, /delete/i);
    await answerConfirm(userEvent, 'confirm');

    await waitFor(() => expect(deleteTag).toHaveBeenCalledWith('tag-1'));
  });

  it("surfaces the API's refusal verbatim", async () => {
    /*
     * The server refuses while any administrator is scoped to the tag, and its
     * message explains the escalation a cascade would have caused. A generic
     * "failed to delete" would throw away the only explanation that exists.
     */
    deleteTag.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message:
            '2 administrator(s) are restricted to this tag. Deleting it would give them access to every client instead of none.',
        },
      },
    });

    renderWithProviders(<TagsPage />);
    await screen.findByText('High risk');
    await chooseRowAction(/high risk/, /delete/i);
    await answerConfirm(userEvent, 'confirm');

    expect(await screen.findByRole('alert')).toHaveTextContent(/every client instead of none/i);
  });
});
