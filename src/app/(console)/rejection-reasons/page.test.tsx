import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import { ALL_PERMISSIONS } from '@/test/permissions';
import RejectionReasonsPage from './page';

/**
 * The rejection-reason catalogue, in English and Arabic (0179). Pinned: the
 * groups by queue, the Arabic sent on create, an edit that CLEARS the Arabic
 * sends `null` (omitted would keep it), and each control behind its own key.
 */

const {
  getAllRejectionReasons,
  createRejectionReason,
  updateRejectionReason,
  deleteRejectionReason,
} = vi.hoisted(() => ({
  getAllRejectionReasons: vi.fn(),
  createRejectionReason: vi.fn(),
  updateRejectionReason: vi.fn(),
  deleteRejectionReason: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getAllRejectionReasons,
      createRejectionReason,
      updateRejectionReason,
      deleteRejectionReason,
    },
  };
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

const reason = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  context: 'kyc',
  label: 'Document expired',
  labelAr: 'الوثيقة منتهية الصلاحية',
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getAllRejectionReasons.mockResolvedValue([
    reason(),
    reason({ id: 'r-2', context: 'withdrawal', label: 'Name mismatch', labelAr: null }),
    reason({ id: 'r-3', context: 'partner', label: 'Insufficient experience', labelAr: null }),
  ]);
  createRejectionReason.mockResolvedValue(reason());
  updateRejectionReason.mockResolvedValue(reason());
  deleteRejectionReason.mockResolvedValue({ message: 'Rejection reason deleted.' });
});

const section = (name: RegExp) => screen.getByRole('region', { name });

describe('the catalogue', () => {
  it('groups the reasons by queue, with the Arabic beneath and a marker where there is none', async () => {
    renderWithProviders(<RejectionReasonsPage />);
    expect(await screen.findByText('Document expired')).toBeInTheDocument();

    const kyc = section(/kyc verification/i);
    expect(within(kyc).getByText('الوثيقة منتهية الصلاحية')).toHaveAttribute('dir', 'rtl');
    const withdrawals = section(/withdrawals/i);
    expect(within(withdrawals).getByText('Name mismatch')).toBeInTheDocument();
    expect(within(withdrawals).getByText('No Arabic')).toBeInTheDocument();
    expect(within(section(/deposits/i)).getByText(/no reasons yet/i)).toBeInTheDocument();
  });

  it('offers Add on every queue, partner applications included (0179)', async () => {
    renderWithProviders(<RejectionReasonsPage />);
    await screen.findByText('Insufficient experience');
    const partner = section(/partner applications/i);
    expect(within(partner).getByRole('button', { name: /add a reason/i })).toBeInTheDocument();
    // The old "cannot be added" note is gone with the restriction.
    expect(screen.queryByText(/not add new ones/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a reason to Deposits' })).toBeInTheDocument();
  });
});

describe('writing', () => {
  it('adds a reason with its Arabic, under the queue it was added from', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RejectionReasonsPage />);
    await screen.findByText('Document expired');

    await user.click(screen.getByRole('button', { name: 'Add a reason to Deposits' }));
    await user.type(screen.getByLabelText('Reason (English)'), '  Proof unreadable ');
    const arabic = screen.getByLabelText('Reason (Arabic)');
    expect(arabic).toHaveAttribute('dir', 'rtl');
    await user.type(arabic, 'الإثبات غير مقروء');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(createRejectionReason).toHaveBeenCalledWith({
      context: 'deposit',
      label: 'Proof unreadable',
      labelAr: 'الإثبات غير مقروء',
    });
    expect(getAllRejectionReasons).toHaveBeenCalledTimes(2);
  });

  it('adds a PARTNER reason — the API takes `context: partner` now', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RejectionReasonsPage />);
    await screen.findByText('Insufficient experience');

    const partner = section(/partner applications/i);
    await user.click(within(partner).getByRole('button', { name: /add a reason/i }));
    await user.type(screen.getByLabelText('Reason (English)'), 'Incomplete application');
    await user.type(screen.getByLabelText('Reason (Arabic)'), 'الطلب غير مكتمل');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(createRejectionReason).toHaveBeenCalledWith({
      context: 'partner',
      label: 'Incomplete application',
      labelAr: 'الطلب غير مكتمل',
    });
  });

  it('edits the English and the Arabic of a reason', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RejectionReasonsPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit Name mismatch' }));

    expect(screen.getByLabelText('Reason (English)')).toHaveValue('Name mismatch');
    await user.type(screen.getByLabelText('Reason (Arabic)'), 'الاسم غير مطابق');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateRejectionReason).toHaveBeenCalledWith('r-2', {
      label: 'Name mismatch',
      labelAr: 'الاسم غير مطابق',
    });
  });

  it('clears the Arabic by sending null — an omitted one would be kept', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RejectionReasonsPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit Document expired' }));

    const arabic = screen.getByLabelText('Reason (Arabic)');
    expect(arabic).toHaveValue('الوثيقة منتهية الصلاحية');
    await user.clear(arabic);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateRejectionReason).toHaveBeenCalledWith('r-1', {
      label: 'Document expired',
      labelAr: null,
    });
  });

  it('keeps the modal open with the server’s refusal', async () => {
    updateRejectionReason.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderWithProviders(<RejectionReasonsPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit Document expired' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason (English)')).toBeInTheDocument();
  });

  it('deletes after a confirmation that names the reason', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RejectionReasonsPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete Document expired' }));
    const message = await answerConfirm(user, 'confirm');
    expect(message).toMatch(/Document expired/);
    expect(deleteRejectionReason).toHaveBeenCalledWith('r-1');
  });
});

describe('permissions', () => {
  it('shows each control only to the key the API checks for it', async () => {
    permissions.current = ['kyc.edit'];
    renderWithProviders(<RejectionReasonsPage />);
    await screen.findByText('Document expired');
    expect(screen.queryByRole('button', { name: /add a reason/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete /i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Document expired' })).toBeInTheDocument();
  });
});
