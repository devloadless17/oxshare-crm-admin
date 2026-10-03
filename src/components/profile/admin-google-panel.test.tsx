import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { AdminGooglePanel } from './admin-google-panel';

const { refetchAdmin, unlinkGoogle } = vi.hoisted(() => ({
  refetchAdmin: vi.fn(),
  unlinkGoogle: vi.fn(),
}));

vi.mock('@/context/AdminAuthContext', () => ({ useAdmin: () => ({ refetchAdmin }) }));
vi.mock('@/lib/api/auth', () => ({ authApi: { unlinkGoogle } }));

const admin = (over: Partial<AdminProfile> = {}): AdminProfile => ({
  id: 'a-1',
  email: 'ada@oxshare.com',
  name: 'Ada',
  role: 'sub_admin',
  status: 'active',
  permissions: [],
  maskedFields: [],
  scopedTags: [],
  seesUntriaged: false,
  seesAllClients: true,
  googleEmail: null,
  googleLinkedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  unlinkGoogle.mockResolvedValue({ message: 'ok' });
  refetchAdmin.mockResolvedValue(true);
});

describe('the profile Google panel', () => {
  it('says how to link when nothing is linked, and offers no unlink', () => {
    renderWithProviders(<AdminGooglePanel admin={admin()} />);
    expect(
      screen.getByText(/not linked — sign in with google once to link it/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlink/i })).not.toBeInTheDocument();
  });

  it('shows the linked address and unlinks after confirming', async () => {
    renderWithProviders(
      <AdminGooglePanel
        admin={admin({ googleEmail: 'ada@bbcorp.trade', googleLinkedAt: '2026-10-01T00:00:00Z' })}
      />,
    );
    expect(screen.getByText('Linked as ada@bbcorp.trade')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /unlink/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(unlinkGoogle).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: /unlink/i }));
    await waitFor(() => expect(unlinkGoogle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refetchAdmin).toHaveBeenCalled());
  });
});
