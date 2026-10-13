import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { AdminFormModal } from './admin-form-modal';
import type { AdminUser } from '@/lib/api/admin';

/**
 * RBAC-08 per administrator (0224) on the edit form: where this administrator
 * may sign in from. Sent only when it changed, refused when it could never let
 * them in, and never offered on your own account.
 */

const { useAdmin } = vi.hoisted(() => ({ useAdmin: vi.fn() }));
vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));

const ROLES = [
  {
    id: 'r1',
    name: 'Support',
    description: '',
    permissions: ['clients.view'],
    maskedFields: [],
    isSystem: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const ADMIN = {
  id: 'a-2',
  email: 'staff@oxshare.com',
  name: 'Staff',
  role: 'sub_admin',
  roleId: 'r1',
  status: 'active',
  permissions: ['clients.view'],
  maskedFields: [],
  maskedFieldsOverride: null,
  scopedTags: [],
  seesAllClients: true,
  accessAnywhere: false,
  allowedIps: ['203.0.113.7/32'],
  totpEnabledAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
} as unknown as AdminUser;

function renderForm(admin: Partial<AdminUser> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <AdminFormModal
      admin={{ ...ADMIN, ...admin }}
      roles={ROLES}
      tags={[]}
      fieldCatalog={{}}
      currentScope={[]}
      canScope={false}
      busy={false}
      error=""
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );
  return { onSubmit, onClose };
}

const save = () => userEvent.click(screen.getByRole('button', { name: /save/i }));
const ipBox = () => screen.getByLabelText(/allowed ip addresses/i);

beforeEach(() => {
  useAdmin.mockReturnValue({ admin: { id: 'a-1', seesAllClients: true } });
});

describe('the edit form — network access', () => {
  it('shows the stored addresses and sends nothing when they did not change', async () => {
    const { onSubmit, onClose } = renderForm();
    expect(ipBox()).toHaveValue('203.0.113.7/32');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends the new list when an address is added', async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(ipBox(), '{enter}198.51.100.9');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      accessAnywhere: false,
      allowedIps: ['203.0.113.7/32', '198.51.100.9'],
    });
  });

  it('sends access from anywhere', async () => {
    const { onSubmit } = renderForm();
    await userEvent.click(screen.getByRole('radio', { name: /access from anywhere/i }));
    await save();

    expect(onSubmit).toHaveBeenCalledWith({ accessAnywhere: true, allowedIps: [] });
  });

  it('refuses to save a restricted administrator with no address', async () => {
    const { onSubmit } = renderForm();
    await userEvent.clear(ipBox());
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one ip address/i);
  });

  it('is read-only on your own account', async () => {
    useAdmin.mockReturnValue({ admin: { id: 'a-2', seesAllClients: true } });
    const { onSubmit } = renderForm();

    expect(screen.getByText(/cannot change your own network access/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /access from anywhere/i })).toBeDisabled();
    expect(ipBox()).toBeDisabled();
    await save();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reads an API without the fields as access from anywhere', () => {
    renderForm({ accessAnywhere: undefined, allowedIps: undefined });

    expect(screen.getByRole('radio', { name: /access from anywhere/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
