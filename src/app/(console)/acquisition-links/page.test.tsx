import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import AcquisitionLinksPage from './page';

/**
 * Sign-up links (backend 0195). Pinned: the link to hand out is on the row,
 * a link whose owner will not see its sign-ups says so, and an administrator
 * holding only `links.create` is offered no edit on somebody else's link.
 */

const { getAcquisitionLinks, getTags, getAdminUsers } = vi.hoisted(() => ({
  getAcquisitionLinks: vi.fn(),
  getTags: vi.fn(),
  getAdminUsers: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getAcquisitionLinks, getTags, getAdminUsers } };
  return { api, default: api };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'desk@oxshare.com',
      name: 'Desk',
      permissions: ['links.view', 'links.create'],
      scopedTags: [{ tagId: 't-of', slug: 'o-f', label: 'O_F' }],
      seesAllClients: false,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const link = (over: Record<string, unknown> = {}) => ({
  id: 'l-1',
  code: 'K7M2Q9XA',
  name: 'O_F — Facebook',
  url: 'https://portal.oxshare.com/join/K7M2Q9XA',
  ownerAdminId: 'a-1',
  ownerName: 'Desk',
  ownerActive: true,
  ownerSeesSignups: true,
  tags: [{ id: 't-of', slug: 'o-f', label: 'O_F' }],
  disabledAt: null,
  createdAt: '2026-10-06T00:00:00.000Z',
  signups: 12,
  verified: 5,
  funded: 2,
  ...over,
});

beforeEach(() => {
  getTags.mockResolvedValue([]);
  getAdminUsers.mockResolvedValue([]);
});

describe('the sign-up links page', () => {
  it('shows the link to hand out, its counts, and a warning when its owner is blind to it', async () => {
    getAcquisitionLinks.mockResolvedValue([
      link(),
      link({
        id: 'l-2',
        name: 'Elsewhere',
        ownerSeesSignups: false,
        ownerAdminId: 'a-2',
        ownerName: 'Other',
        url: 'https://portal.oxshare.com/join/OTHER234',
        signups: 3,
        verified: 1,
        funded: 0,
      }),
    ]);
    renderWithProviders(<AcquisitionLinksPage />);

    expect(await screen.findByText('https://portal.oxshare.com/join/K7M2Q9XA')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/will not see the clients it brings/i)).toBeInTheDocument();
  });

  it('offers no actions on another administrator’s link without links.manage', async () => {
    getAcquisitionLinks.mockResolvedValue([link({ ownerAdminId: 'a-2', ownerName: 'Other' })]);
    renderWithProviders(<AcquisitionLinksPage />);
    await screen.findByText('O_F — Facebook');
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
    expect(getAdminUsers).not.toHaveBeenCalled();
  });
});
