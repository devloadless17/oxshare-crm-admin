import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RoleForm, type RoleFormValues } from './role-form';

/**
 * A role is a set of PERMISSIONS, and nothing else.
 *
 * This file used to pin the field-masking matrix that sat beside the permission
 * matrix — which client fields holders of the role may not see. That surface is
 * gone from the console, here and in the per-administrator editor: it was a
 * second access model running alongside the first, with its own vocabulary, its
 * own catalog fetch and its own override semantics, and every screen showing
 * client data had to reason about both.
 *
 * What is pinned now is that it stays gone, and that the half which remains
 * still round-trips. The quiet failure worth guarding is the same one masking
 * had: a form that can set a value it cannot READ BACK silently clears it on
 * the next save of an unrelated field, so renaming a role would strip its
 * permissions.
 */

const PERMISSIONS = {
  clients: {
    moduleName: 'Clients',
    description: 'Client records',
    permissions: [
      { key: 'clients.view', label: 'View clients' },
      { key: 'clients.suspend', label: 'Suspend clients' },
    ],
  },
};

function renderForm(overrides: Partial<Parameters<typeof RoleForm>[0]> = {}): {
  onSubmit: ReturnType<typeof vi.fn>;
} {
  const onSubmit = vi.fn();
  renderWithProviders(
    <RoleForm
      catalog={PERMISSIONS}
      busy={false}
      error=""
      submitLabel="Save"
      onSubmit={onSubmit as (values: RoleFormValues) => void}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('the role editor', () => {
  it('pre-fills the permissions a role already has', async () => {
    // Rename a role, save, and everything it used to grant would vanish if the
    // form submitted the empty set it started with rather than the role's own.
    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: ['clients.view'] },
    });

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Support', permissions: ['clients.view'] }),
    );
  });

  it('sends the permissions an operator ticks', async () => {
    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: [] },
    });

    await userEvent.click(screen.getByRole('checkbox', { name: /suspend clients/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ['clients.suspend'] }),
    );
  });

  it('unticks a permission back off again', async () => {
    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: ['clients.view'] },
    });

    await userEvent.click(screen.getByRole('checkbox', { name: /view clients/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }));
  });

  it('offers no field-visibility section, and never sends one', async () => {
    /*
     * The removal, pinned. `PUT /admin/roles/:id` still ACCEPTS `maskedFields`
     * and the API still enforces whatever is stored, so a request that started
     * sending `[]` again would not fail — it would quietly unmask every field a
     * legacy role hides. Absence from the payload is the assertion that
     * matters, not absence from the screen.
     */
    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: ['clients.view'] },
    });

    expect(screen.queryByText(/field visibility/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /email address/i })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('maskedFields');
  });
});
