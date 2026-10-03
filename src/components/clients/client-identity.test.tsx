import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ClientIdentity, PortalIdTag } from './client-identity';
import type { AdminProfile } from '@/context/AdminAuthContext';

/**
 * A client's name opens their profile on every screen (owner, 29 Sep 2026).
 *
 * `ClientIdentity` is what the withdrawal desk, deposits, wallets, trading
 * accounts, the ledger, reconciliation, commissions and partners all render, so
 * linking here is what makes the rule hold everywhere at once. Pinned: the name
 * links by Portal ID; with no name the email leads and links; a fully masked row
 * links its Portal ID; an operator who may not open profiles gets text; and
 * `link={false}` (inside another link) renders no anchor at all.
 */

const { useAdmin } = vi.hoisted(() => ({ useAdmin: vi.fn() }));
vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));

const as = (permissions: string[]) =>
  useAdmin.mockReturnValue({
    admin: {
      id: 'a-1',
      email: 'ops@oxshare.com',
      name: 'Ops',
      role: 'sub_admin',
      status: 'active',
      seesUntriaged: false,
      seesAllClients: true,
      permissions,
      maskedFields: [],
      scopedTags: [],
      googleEmail: null,
      googleLinkedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    } satisfies AdminProfile,
  });

beforeEach(() => as(['clients.view']));

describe('ClientIdentity', () => {
  it("links the name to the client's profile, by Portal ID", () => {
    renderWithProviders(
      <ClientIdentity name="Ada Lovelace" email="ada@example.test" portalId={1000245} />,
    );
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/clients/1000245',
    );
    // One way in per row — the email beneath is not a second link.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('links the email when no name is readable', () => {
    renderWithProviders(<ClientIdentity email="ada@example.test" portalId={1000245} />);
    expect(screen.getByRole('link', { name: 'ada@example.test' })).toHaveAttribute(
      'href',
      '/clients/1000245',
    );
  });

  it('links the Portal ID when everything else is masked', () => {
    renderWithProviders(<ClientIdentity portalId={1000245} />);
    expect(screen.getByRole('link', { name: /1000245/ })).toHaveAttribute(
      'href',
      '/clients/1000245',
    );
  });

  it('is plain text for an operator who may not open client profiles', () => {
    as(['withdrawals.view']);
    renderWithProviders(<ClientIdentity name="Ada Lovelace" portalId={1000245} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders no link inside another link (link={false})', () => {
    renderWithProviders(<ClientIdentity name="Ada Lovelace" portalId={1000245} link={false} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not link a client row that no longer exists', () => {
    renderWithProviders(<ClientIdentity removedId="u-gone" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('PortalIdTag', () => {
  it('links when asked, and stays text by default', () => {
    const { unmount } = renderWithProviders(<PortalIdTag id={1000245} linked />);
    expect(screen.getByRole('link', { name: /1000245/ })).toHaveAttribute(
      'href',
      '/clients/1000245',
    );
    unmount();
    renderWithProviders(<PortalIdTag id={1000245} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
