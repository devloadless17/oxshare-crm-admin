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

const { getClients, setClientStatus, getTags, downloadExport } = vi.hoisted(() => ({
  getClients: vi.fn(),
  setClientStatus: vi.fn(),
  getTags: vi.fn(),
  downloadExport: vi.fn(),
}));

vi.mock('@/lib/api/export', () => ({ downloadExport }));

// Both exports — see admin/CLAUDE.md.
vi.mock('@/lib/api', () => {
  const api = { admin: { getClients, setClientStatus, getTags } };
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

  it('draws no Introduced by column without ib.view', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'ib.view');
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
