import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RoleFormModal, type RoleFormValues } from './role-form-modal';

/**
 * RBAC-03's masking matrix, where it belongs — on the ROLE.
 *
 * Masking answers the same question the permission matrix answers, about the
 * same job: "what may somebody doing this work see". So it is configured beside
 * the permissions, and the per-admin control is an override for one person
 * rather than the only place to set it.
 *
 * Three properties are worth pinning, and each has a failure mode that is quiet
 * rather than loud — which is the worst kind on a control over who sees client
 * PII:
 *
 *  1. An existing mask must PRE-FILL. A form that can set a value it cannot read
 *     back silently clears it on the next save of an unrelated field.
 *  2. A field the API says is not maskable must be VISIBLE and disabled, with
 *     its reason. Omitting it leaves an operator hunting for a checkbox that
 *     does not exist.
 *  3. The vocabulary is served, never invented here (R-4.5) — so an empty
 *     catalog must render an empty matrix rather than a guess.
 */

const CATALOG = {
  identity: {
    label: 'Identity',
    fields: [
      { key: 'client.email', label: 'Email address', maskable: true, reason: null },
      { key: 'client.phone', label: 'Phone number', maskable: true, reason: null },
      {
        key: 'client.status',
        label: 'Account status',
        maskable: false,
        // The screens key their whole layout off it — hiding it would blank the
        // list rather than mask a column.
        reason: 'The client list cannot render without it.',
      },
    ],
  },
};

const PERMISSIONS = {
  users: {
    label: 'Clients',
    permissions: [{ key: 'users.view', label: 'View clients', description: 'Read the list' }],
  },
};

function renderModal(overrides: Partial<Parameters<typeof RoleFormModal>[0]> = {}): {
  onSubmit: ReturnType<typeof vi.fn>;
} {
  const onSubmit = vi.fn();
  renderWithProviders(
    <RoleFormModal
      title="Edit role"
      catalog={PERMISSIONS as never}
      fieldCatalog={CATALOG as never}
      busy={false}
      error=""
      submitLabel="Save"
      onSubmit={onSubmit as (values: RoleFormValues) => void}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('the role editor — field masking (RBAC-03)', () => {
  it('pre-fills the mask a role already has', async () => {
    /*
     * The quiet failure this prevents: rename a role, save, and every field it
     * used to hide becomes visible — because the form submitted the empty mask
     * it started with rather than the one the role carries.
     */
    const { onSubmit } = renderModal({
      initial: {
        name: 'Support',
        description: '',
        permissions: ['users.view'],
        maskedFields: ['client.phone'],
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ maskedFields: ['client.phone'] }),
    );
  });

  it('sends the fields an operator ticks', async () => {
    const { onSubmit } = renderModal({
      initial: { name: 'Support', description: '', permissions: [], maskedFields: [] },
    });

    await userEvent.click(screen.getByRole('button', { name: /email address/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ maskedFields: ['client.email'] }),
    );
  });

  it('unticks a field back off again', async () => {
    const { onSubmit } = renderModal({
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

  it('shows an unmaskable field as disabled, WITH the reason', () => {
    /*
     * Shown and disabled rather than omitted. An operator asking "why can I not
     * hide the status column" needs the answer where they are already looking —
     * an absent row reads as a bug in the screen.
     */
    renderModal();

    const control = screen.getByRole('button', { name: /account status/i });
    expect(control).toBeDisabled();
    expect(screen.getByText(/cannot render without it/i)).toBeInTheDocument();
  });

  it('renders no mask options at all when the API served none', () => {
    // R-4.5: the vocabulary comes from the server. If it is empty — the endpoint
    // is not built, or the catalog is genuinely empty — the right answer is an
    // empty matrix, never a hardcoded guess at what a client record contains.
    renderModal({ fieldCatalog: {} });

    expect(screen.queryByRole('button', { name: /email address/i })).not.toBeInTheDocument();
  });
});
