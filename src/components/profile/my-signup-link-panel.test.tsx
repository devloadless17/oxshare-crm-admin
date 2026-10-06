import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link2 } from 'lucide-react';
import { renderWithProviders } from '@/test/render';
import { MySignupLinkPanel } from './my-signup-link-panel';

/**
 * "My sign-up link" (backend 0198). Pinned: the link to hand out and the tags
 * the next sign-up gets are on screen; a link that gives no tag SAYS so; and a
 * taken word is refused under the field it was typed in.
 */

const { getMySignupLink, renameSignupLink, randomizeSignupLink } = vi.hoisted(() => ({
  getMySignupLink: vi.fn(),
  renameSignupLink: vi.fn(),
  randomizeSignupLink: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getMySignupLink, renameSignupLink, randomizeSignupLink } };
  return { api, default: api };
});

const link = (over: Record<string, unknown> = {}) => ({
  slug: 'omar-farah',
  url: 'https://portal.oxshare.com/join/omar-farah',
  tags: [{ id: 't-of', slug: 'o-f', label: 'O_F' }],
  addsNoTag: false,
  signups: 12,
  verified: 5,
  funded: 2,
  ...over,
});

beforeEach(() => {
  getMySignupLink.mockReset();
  renameSignupLink.mockReset();
  randomizeSignupLink.mockReset();
});

describe('my sign-up link', () => {
  it('shows the link, the book it puts clients in, and what it has brought', async () => {
    getMySignupLink.mockResolvedValue(link());
    renderWithProviders(<MySignupLinkPanel adminId="a-1" icon={Link2} />);
    expect(
      await screen.findByText('https://portal.oxshare.com/join/omar-farah'),
    ).toBeInTheDocument();
    expect(screen.getByText('O_F')).toBeInTheDocument();
    expect(screen.getByText(/12 signed up · 5 verified · 2 funded/)).toBeInTheDocument();
  });

  it('says plainly when the link puts clients in no book', async () => {
    getMySignupLink.mockResolvedValue(link({ tags: [], addsNoTag: true }));
    renderWithProviders(<MySignupLinkPanel adminId="a-1" icon={Link2} />);
    expect(await screen.findByText(/your link adds no tag/i)).toBeInTheDocument();
  });

  it('shows a taken word under the field, and keeps the dialog open', async () => {
    getMySignupLink.mockResolvedValue(link());
    renameSignupLink.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          code: 'SIGNUP_LINK_TAKEN',
          message: 'Another administrator already uses this link. Choose another word.',
          fields: { slug: 'Another administrator already uses this link. Choose another word.' },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<MySignupLinkPanel adminId="a-1" icon={Link2} />);
    await user.click(await screen.findByRole('button', { name: /change link word/i }));
    const field = screen.getByLabelText(/link word/i);
    await user.clear(field);
    await user.type(field, 'o_f');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/already uses this link/i)).toBeInTheDocument();
    expect(renameSignupLink).toHaveBeenCalledWith('a-1', 'o_f');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks the SERVER for a random word, and closes once it is saved', async () => {
    getMySignupLink.mockResolvedValue(link());
    randomizeSignupLink.mockResolvedValue({
      slug: 'k7xm9q2e',
      url: 'https://portal.oxshare.com/join/k7xm9q2e',
    });
    const user = userEvent.setup();
    renderWithProviders(<MySignupLinkPanel adminId="a-1" icon={Link2} />);
    await user.click(await screen.findByRole('button', { name: /change link word/i }));
    await user.click(screen.getByRole('button', { name: /use a random word/i }));
    expect(randomizeSignupLink).toHaveBeenCalledWith('a-1');
    expect(renameSignupLink).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
