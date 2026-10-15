import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ReferralsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The Referrals page (owner, 28 Sep 2026): every client a partner introduced,
 * and who introduced them.
 *
 * Pinned here:
 *  - it asks for `referred=true` on EVERY request, whatever else narrows it —
 *    a request without it is the whole client base under a referrals heading;
 *  - "Introduced by" names the partner and links to their profile, and says
 *    "outside your territory" rather than a dash when the API withholds who;
 *  - the column needs `ib.view`, as the API's `referrer` does;
 *  - the type filter offers only what a referred client can be;
 *  - the export is this page's file: `referred=true` travels with it.
 */

const { getClients, setClientStatus, getTags, downloadExport, getIbPartners, moveReferral } =
  vi.hoisted(() => ({
    getClients: vi.fn(),
    setClientStatus: vi.fn(),
    getTags: vi.fn(),
    downloadExport: vi.fn(),
    getIbPartners: vi.fn(),
    moveReferral: vi.fn(),
  }));

vi.mock('@/lib/api/export', () => ({ downloadExport }));

// Both exports — see admin/CLAUDE.md.
vi.mock('@/lib/api', () => {
  const api = { admin: { getClients, setClientStatus, getTags, getIbPartners, moveReferral } };
  return { api, default: api };
});

/* A URL store the router mock writes back into — same shape as clients/page.test.tsx. */
const searchParams = { current: new URLSearchParams() };
const listeners = new Set<() => void>();
let snapshot = 0;
const replace = vi.fn((url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
  snapshot += 1;
  for (const notify of listeners) notify();
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () => {
      useSyncExternalStore(
        (onChange: () => void) => {
          listeners.add(onChange);
          return () => listeners.delete(onChange);
        },
        () => snapshot,
        () => snapshot,
      );
      return searchParams.current;
    },
    usePathname: () => '/referrals',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
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

function client(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    portalId: 1000245,
    email: 'alpha@oxshare.com',
    firstName: 'Alpha',
    lastName: 'Client',
    type: 'referral',
    status: 'active',
    emailVerified: true,
    kycStatus: 'approved',
    verificationLevel: 1,
    createdAt: '2026-09-20T10:00:00.000Z',
    referrer: {
      ibUserId: 'p-1',
      portalId: 1000100,
      firstName: 'Paula',
      lastName: 'Partner',
      outsideTerritory: false,
    },
    ...over,
  };
}

function page(rows: Record<string, unknown>[]) {
  return {
    items: rows,
    total: rows.length,
    page: 1,
    limit: 25,
    nextCursor: null,
    maskedFields: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  searchParams.current = new URLSearchParams();
  snapshot += 1;
  getTags.mockResolvedValue([]);
  getClients.mockResolvedValue(
    page([
      client(),
      client({
        id: 'c-2',
        portalId: 1000246,
        email: 'bravo@oxshare.com',
        firstName: 'Bravo',
        referrer: { ibUserId: 'p-2', outsideTerritory: true },
      }),
    ]),
  );
});

describe('the Referrals page', () => {
  it('asks only for referred clients, with a count for the pager', async () => {
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');

    const [params] = getClients.mock.calls[0] as [Record<string, unknown>];
    expect(params.referred).toBe('true');
    expect(params.withTotal).toBe(true);
    expect(screen.getByRole('heading', { name: 'Referrals' })).toBeInTheDocument();
  });

  it('keeps asking for referred clients when the list is narrowed', async () => {
    searchParams.current = new URLSearchParams('status=suspended&type=partner&sort=createdAt');
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');

    const [params] = getClients.mock.calls.at(-1) as [Record<string, unknown>];
    expect(params).toMatchObject({ referred: 'true', status: 'suspended', type: 'partner' });
  });

  it('names the introducer and links to their profile by Portal ID', async () => {
    renderWithProviders(<ReferralsPage />);
    const row = (await screen.findByText('alpha@oxshare.com')).closest('tr') as HTMLElement;

    expect(screen.getByRole('columnheader', { name: /introduced by/i })).toBeInTheDocument();
    const link = within(row).getByRole('link', { name: 'Paula Partner' });
    expect(link).toHaveAttribute('href', '/clients/1000100');
    expect(within(row).getByText('#1000100')).toBeInTheDocument();
  });

  it('says a partner outside the territory introduced them — never a dash', async () => {
    renderWithProviders(<ReferralsPage />);
    const row = (await screen.findByText('bravo@oxshare.com')).closest('tr') as HTMLElement;

    expect(within(row).getByText(/a partner outside your territory/i)).toBeInTheDocument();
  });

  it('draws no Introduced by column without ib.referrals.view', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'ib.referrals.view');
    getClients.mockResolvedValue(page([client({ referrer: undefined })]));
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');

    expect(screen.queryByRole('columnheader', { name: /introduced by/i })).not.toBeInTheDocument();
  });

  it('offers only the types a referred client can be', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');

    // A Radix Select: the options exist only once the trigger is opened.
    await user.click(screen.getByLabelText('All Types'));
    expect(await screen.findByRole('option', { name: 'Referral' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Partner / IB' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Individual' })).not.toBeInTheDocument();
  });

  it('exports this page — referred=true travels with the filters', async () => {
    searchParams.current = new URLSearchParams('status=active&page=2');
    downloadExport.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');

    await user.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(downloadExport).toHaveBeenCalledTimes(1));
    const [resource, , filters] = downloadExport.mock.calls[0] as [string, string, URLSearchParams];
    expect(resource).toBe('clients');
    expect(filters.get('referred')).toBe('true');
    expect(filters.get('status')).toBe('active');
    // The file is the whole filtered set, not the page on screen.
    expect(filters.has('page')).toBe(false);
  });

  it('says nobody has joined through a partner when nothing narrows an empty list', async () => {
    getClients.mockResolvedValue(page([]));
    renderWithProviders(<ReferralsPage />);

    expect(
      await screen.findByText(/no client has joined through a partner yet/i),
    ).toBeInTheDocument();
  });
});

/** A partner-directory row, as the picker reads it. */
function partnerRow(userId: string, level: number, firstName: string, portalId: number) {
  return {
    account: { userId, level, active: true },
    user: { firstName, lastName: 'Partner', email: `${firstName.toLowerCase()}@x.test`, portalId },
    agencyName: 'Gold',
  };
}

describe('moving a referral to another partner (owner, 15 Oct 2026)', () => {
  beforeEach(() => {
    getIbPartners.mockResolvedValue({
      rows: [
        partnerRow('p-1', 1, 'Paula', 1000100), // the current introducer
        partnerRow('p-3', 1, 'Omar', 1000101),
        partnerRow('p-4', 2, 'Sami', 1000102),
      ],
      total: 3,
    });
    moveReferral.mockResolvedValue({ referredByIbUserId: 'p-4' });
  });

  async function openMove() {
    const user = userEvent.setup();
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha Client' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to another partner' }));
    return user;
  }

  it('offers main partners AND sub-partners, never the current one, and saves the choice', async () => {
    const user = await openMove();

    const dialog = await screen.findByRole('dialog', {
      name: /move alpha client to another partner/i,
    });
    expect(await within(dialog).findByText('Omar Partner')).toBeInTheDocument();
    // Level 2 is offered too, and marked as such.
    expect(within(dialog).getByText('Sami Partner')).toBeInTheDocument();
    expect(within(dialog).getByText('Level 2')).toBeInTheDocument();
    expect(within(dialog).queryByText('Paula Partner')).toBeNull();
    // Only active partners are asked for.
    expect(getIbPartners).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.anything(),
    );

    const save = within(dialog).getByRole('button', { name: 'Move client' });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: /sami partner/i }));
    await user.click(save);

    await waitFor(() => expect(moveReferral).toHaveBeenCalledWith('c-1', 'p-4'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the dialog open and says so when the move is refused', async () => {
    moveReferral.mockRejectedValue(new Error('That partner is suspended.'));
    const user = await openMove();

    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('radio', { name: /omar partner/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Move client' }));

    await waitFor(() => expect(moveReferral).toHaveBeenCalledWith('c-1', 'p-3'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('is not offered without ib.partners.edit', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'ib.partners.edit');
    const user = userEvent.setup();
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha Client' }));
    await screen.findByRole('menuitem', { name: /view profile/i });
    expect(screen.queryByRole('menuitem', { name: 'Move to another partner' })).toBeNull();
  });

  it('is not offered on a referred client who has since become a partner', async () => {
    getClients.mockResolvedValue(page([client({ type: 'partner' })]));
    const user = userEvent.setup();
    renderWithProviders(<ReferralsPage />);
    await screen.findByText('alpha@oxshare.com');
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha Client' }));
    expect(
      await screen.findByRole('menuitem', { name: /move under another partner/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Move to another partner' })).toBeNull();
  });
});
