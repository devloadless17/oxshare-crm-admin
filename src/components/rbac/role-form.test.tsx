import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RoleForm, type RoleFormValues } from './role-form';

/**
 * A role is permissions AND the mask — what somebody doing this job may do,
 * and what they may see, on one screen.
 *
 * The masking section was removed on 9 Aug ("a second access model") and
 * RESTORED on 13 Aug: with the per-admin editor already gone, removal left
 * masking enforced by the API and configurable nowhere. This file previously
 * pinned the removal ("offers no field-visibility section, and never sends
 * one"); that pin is deliberately replaced by the PRE-FILL test below, which
 * guards the same quiet failure from the other side — the form now always
 * round-trips `maskedFields`, so "rename and save" preserves a legacy mask by
 * sending it back rather than by omitting it.
 *
 * Three masking properties worth pinning, each with a QUIET failure mode:
 *
 *  1. An existing mask must PRE-FILL — a form that can set a value it cannot
 *     read back silently clears it on the next save of an unrelated field.
 *  2. A field the API says is not maskable must be VISIBLE and disabled, with
 *     its reason — omitting it leaves an operator hunting for a checkbox that
 *     does not exist.
 *  3. The submitter's OWN masked fields are locked in (the superset rule,
 *     `assertMaskAllowed`) — otherwise saving a role is the way around your
 *     own mask, and the server refusal reads as a broken save button.
 */

const useAdmin = vi.hoisted(() => vi.fn());
vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));

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

const FIELD_CATALOG = {
  identity: {
    label: 'Identity',
    fields: [
      { key: 'client.email', label: 'Email address', maskable: true, reason: null },
      { key: 'client.phone', label: 'Phone number', maskable: true, reason: null },
      {
        key: 'client.status',
        label: 'Account status',
        maskable: false,
        // The screens key their whole layout off it — hiding it would blank
        // the list rather than mask a column.
        reason: 'The client list cannot render without it.',
      },
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
      fieldCatalog={FIELD_CATALOG as never}
      busy={false}
      error=""
      submitLabel="Save"
      onSubmit={onSubmit as (values: RoleFormValues) => void}
      {...overrides}
    />,
  );
  return { onSubmit };
}

beforeEach(() => {
  // An unmasked submitter by default; the superset test overrides this.
  useAdmin.mockReturnValue({ admin: { maskedFields: [] }, isLoading: false });
});

describe('the role editor', () => {
  it('pre-fills the permissions a role already has', async () => {
    // Rename a role, save, and everything it used to grant would vanish if the
    // form submitted the empty set it started with rather than the role's own.
    const { onSubmit } = renderForm({
      initial: {
        name: 'Support',
        description: '',
        permissions: ['clients.view'],
        maskedFields: [],
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Support', permissions: ['clients.view'] }),
    );
  });

  it('sends the permissions an operator ticks', async () => {
    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: [], maskedFields: [] },
    });

    await userEvent.click(screen.getByRole('checkbox', { name: /suspend clients/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ['clients.suspend'] }),
    );
  });

  it('unticks a permission back off again', async () => {
    const { onSubmit } = renderForm({
      initial: {
        name: 'Support',
        description: '',
        permissions: ['clients.view'],
        maskedFields: [],
      },
    });

    await userEvent.click(screen.getByRole('checkbox', { name: /view clients/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }));
  });
});

describe('the role editor — field masking (RBAC-03)', () => {
  it('pre-fills the mask a role already has', async () => {
    /*
     * The quiet failure this prevents: rename a role, save, and every field it
     * used to hide becomes visible — because the form submitted the empty mask
     * it started with rather than the one the role carries.
     */
    const { onSubmit } = renderForm({
      initial: {
        name: 'Support',
        description: '',
        permissions: ['clients.view'],
        maskedFields: ['client.phone'],
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ maskedFields: ['client.phone'] }),
    );
  });

  it('sends the fields an operator ticks', async () => {
    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: [], maskedFields: [] },
    });

    await userEvent.click(screen.getByRole('button', { name: /email address/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ maskedFields: ['client.email'] }),
    );
  });

  it('unticks a field back off again', async () => {
    const { onSubmit } = renderForm({
      initial: {
        name: 'Support',
        description: '',
        permissions: [],
        maskedFields: ['client.email'],
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /email address/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ maskedFields: [] }));
  });

  it('shows an unmaskable field disabled, with its reason', () => {
    renderForm();

    const status = screen.getByRole('button', { name: /account status/i });
    expect(status).toBeDisabled();
    expect(screen.getByText(/cannot render without it/i)).toBeInTheDocument();
  });

  it('locks the submitter’s own masked fields in, and includes them in the save', async () => {
    /*
     * The superset rule, surfaced. An admin whose own mask hides the phone
     * number cannot save a role that reveals it — the server would refuse the
     * whole save. So the field arrives pre-ticked and disabled with the
     * reason, and the payload carries it even though this role never did.
     */
    useAdmin.mockReturnValue({ admin: { maskedFields: ['client.phone'] }, isLoading: false });

    const { onSubmit } = renderForm({
      initial: { name: 'Support', description: '', permissions: [], maskedFields: [] },
    });

    expect(screen.getByRole('button', { name: /phone number/i })).toBeDisabled();
    expect(screen.getByText(/cannot grant visibility/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ maskedFields: ['client.phone'] }),
    );
  });

  it('renders no options from an empty catalog rather than inventing keys', () => {
    // R-4.5 — the vocabulary is served. An empty catalog is an empty section.
    renderForm({ fieldCatalog: {} });

    expect(screen.queryByRole('button', { name: /email address/i })).toBeNull();
  });
});
