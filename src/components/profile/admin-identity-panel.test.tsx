import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShieldCheck } from 'lucide-react';
import { renderWithProviders } from '@/test/render';
import { AdminIdentityPanel } from './admin-identity-panel';
import type { AdminProfile } from '@/context/AdminAuthContext';

/**
 * The panel's two jobs, and the bug that made one of them look broken.
 *
 * Every write here changes a field of `/admin/auth/me`, which is the object the
 * SIDEBAR renders — so each one has to re-ask who this is. The first cut called
 * `invalidateQueries({ queryKey: ['admin-session'] })`, and that key does not
 * exist: `AdminAuthContext` uses `['admin', 'me']`. The call matched nothing,
 * resolved happily, and refetched nothing, so an uploaded photo did not appear
 * until a manual reload — a failure with no error anywhere to explain it.
 *
 * These tests assert on `refetchAdmin` being CALLED rather than on a cache key,
 * which is the point of taking it from the context: the key is named in one
 * place and this panel can no longer get it wrong.
 */

const { refetchAdmin, uploadAvatar, removeAvatar, updateProfile } = vi.hoisted(() => ({
  refetchAdmin: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('@/context/AdminAuthContext', () => ({ useAdmin: () => ({ refetchAdmin }) }));
vi.mock('@/lib/api/auth', () => ({
  authApi: { uploadAvatar, removeAvatar, updateProfile },
}));

const admin = (over: Partial<AdminProfile> = {}): AdminProfile => ({
  id: 'a-1',
  email: 'ada@oxshare.com',
  name: 'Ada Lovelace',
  role: 'sub_admin',
  status: 'active',
  permissions: ['clients.view'],
  maskedFields: [],
  scopedTags: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  avatarUrl: null,
  ...over,
});

beforeEach(() => {
  refetchAdmin.mockReset().mockResolvedValue(true);
  updateProfile.mockReset().mockResolvedValue({ name: 'Ada Byron' });
  uploadAvatar.mockReset().mockResolvedValue({ avatarUrl: '/uploads/admin-avatars/a.png' });
  removeAvatar.mockReset().mockResolvedValue({ avatarUrl: null });
});

describe('the name form', () => {
  it('starts disabled, because nothing has changed yet', () => {
    renderWithProviders(<AdminIdentityPanel admin={admin()} icon={ShieldCheck} />);
    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();
  });

  it('saves an edited name and re-asks who this is', async () => {
    // The refetch is what updates the sidebar. Without it the operator renames
    // themselves and the corner of the screen keeps the old name until reload.
    const user = userEvent.setup();
    renderWithProviders(<AdminIdentityPanel admin={admin()} icon={ShieldCheck} />);

    const field = screen.getByLabelText('Name');
    await user.clear(field);
    await user.type(field, 'Ada Byron');
    await user.click(screen.getByRole('button', { name: /save name/i }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: 'Ada Byron' }));
    await waitFor(() => expect(refetchAdmin).toHaveBeenCalled());
  });

  it('shows the value the SERVER stored, not the one that was typed', async () => {
    /*
     * The API trims before saving. A form echoing its own input would show
     * " Ada Byron " as saved while every other screen shows "Ada Byron" — and
     * the field would then read as dirty for ever.
     */
    const user = userEvent.setup();
    updateProfile.mockResolvedValue({ name: 'Ada Byron' });
    renderWithProviders(<AdminIdentityPanel admin={admin()} icon={ShieldCheck} />);

    const field = screen.getByLabelText('Name');
    await user.clear(field);
    await user.type(field, '  Ada Byron  ');
    await user.click(screen.getByRole('button', { name: /save name/i }));

    await waitFor(() => expect(field).toHaveValue('Ada Byron'));
  });

  it('refuses to submit a blank name', async () => {
    // `@IsNotEmpty` on the server does not catch a string of spaces, so a blank
    // one is possible to send. An admin with no name shows 'U' in every avatar
    // and an anonymous row in the audit log.
    const user = userEvent.setup();
    renderWithProviders(<AdminIdentityPanel admin={admin()} icon={ShieldCheck} />);

    const field = screen.getByLabelText('Name');
    await user.clear(field);
    await user.type(field, '   ');

    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

describe('the identity fields', () => {
  it('does not offer to edit the e-mail address', () => {
    /*
     * Deliberately absent, and it must stay absent. The address is the login
     * credential AND where every reset link is sent, so a self-service change is
     * one request that moves the account to an inbox its owner may no longer
     * control. Only the name is a text box.
     */
    renderWithProviders(<AdminIdentityPanel admin={admin()} icon={ShieldCheck} />);

    expect(screen.getByText('ada@oxshare.com')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('says "no role" rather than falling back to the e-mail', () => {
    // An administrator on no role is a real state and usually a mistake worth
    // seeing. Showing the address there would quietly hide it.
    renderWithProviders(
      <AdminIdentityPanel admin={admin({ roleName: undefined })} icon={ShieldCheck} />,
    );
    expect(screen.getByText('No role assigned')).toBeInTheDocument();
  });

  it('offers no Remove button when there is no photo to remove', () => {
    renderWithProviders(<AdminIdentityPanel admin={admin()} icon={ShieldCheck} />);
    expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
  });

  it('offers Replace and Remove once there is one', () => {
    renderWithProviders(
      <AdminIdentityPanel
        admin={admin({ avatarUrl: '/uploads/admin-avatars/a.png' })}
        icon={ShieldCheck}
      />,
    );
    expect(screen.getByRole('button', { name: /replace photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
  });
});
