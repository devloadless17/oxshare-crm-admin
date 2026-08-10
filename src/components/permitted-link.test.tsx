import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PermittedLink } from './permitted-link';
import type { AdminProfile } from '@/context/AdminAuthContext';

/**
 * A link the viewer cannot follow is a dead end with an affordance on it.
 *
 * The sidebar has always filtered itself, which made the console LOOK
 * permission-aware while every table went on linking to pages the viewer could
 * not open — the client list to `/clients/{id}` from every row, the KYC queue to
 * `/kyc/{id}`, the partner list back to `/clients/{id}`. A reviewer holding
 * `kyc.view` and not `clients.view` was offered a client link on every row of a
 * screen they were entitled to, and every one landed on the denied panel.
 *
 * What is pinned here is that the LABEL survives and the LINK does not. The name
 * in the cell is data the operator is entitled to read; being unable to open the
 * profile does not make the name secret.
 */

const { useAdmin } = vi.hoisted(() => ({ useAdmin: vi.fn() }));
vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));

const admin = (permissions: string[]): { admin: AdminProfile } => ({
  admin: {
    id: 'a-1',
    email: 'sub@oxshare.com',
    name: 'Sub Admin',
    role: 'sub_admin',
    status: 'active',
    permissions,
    maskedFields: [],
    scopedTags: [],
    createdAt: '2026-08-01T00:00:00.000Z',
  },
});

describe('PermittedLink', () => {
  it('links when the viewer can reach the destination', () => {
    useAdmin.mockReturnValue(admin(['clients.view']));
    renderWithProviders(<PermittedLink href="/clients/c-1">Ada Lovelace</PermittedLink>);

    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/clients/c-1',
    );
  });

  it('renders the label as plain text when they cannot', () => {
    // A KYC reviewer without `clients.view`: the queue is theirs, the profile
    // behind each row is not.
    useAdmin.mockReturnValue(admin(['kyc.view']));
    renderWithProviders(<PermittedLink href="/clients/c-1">Ada Lovelace</PermittedLink>);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('gates on the DESTINATION, not on holding any permission at all', () => {
    /*
     * The failure this rules out: a check like "is this admin privileged" rather
     * than "may they open THIS path". Holding one key must not open links to
     * everything.
     */
    useAdmin.mockReturnValue(admin(['kyc.view']));
    renderWithProviders(
      <>
        <PermittedLink href="/kyc/u-1">Submission</PermittedLink>
        <PermittedLink href="/clients/c-1">Client</PermittedLink>
      </>,
    );

    expect(screen.getByRole('link', { name: 'Submission' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Client' })).toBeNull();
  });

  it('denies when there is no session at all', () => {
    useAdmin.mockReturnValue({ admin: null });
    renderWithProviders(<PermittedLink href="/clients/c-1">Ada Lovelace</PermittedLink>);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
