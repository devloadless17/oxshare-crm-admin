import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import CommissionsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbAccrual, IbAccrualPage } from '@/lib/api/admin';

const { getIbAccruals } = vi.hoisted(() => ({ getIbAccruals: vi.fn() }));

// BOTH the named export and the default — see admin/CLAUDE.md.
vi.mock('@/lib/api', () => {
  const api = { admin: { getIbAccruals } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/commissions',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      role: 'sub_admin',
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
  }),
}));

const person = (id: number, first: string) => ({
  id: String(id),
  portalId: id,
  email: `${first.toLowerCase()}@example.com`,
  firstName: first,
  lastName: 'Test',
});

function row(over: Partial<IbAccrual> = {}): IbAccrual {
  return {
    accrual: {
      id: 'acc-1',
      status: 'confirmed',
      kind: 'commission',
      amount: '31.50000000',
      baseAmount: '45.00000000',
      rateValue: '70.0000',
      currency: 'USD',
      depth: 2,
      termsName: 'Level 1',
      sourceType: 'deal',
      sourceId: 'deal-1',
      createdAt: '2026-10-09T10:00:00.000Z',
      confirmedAt: '2026-10-09T10:00:05.000Z',
    },
    partner: person(1000004, 'Pat'),
    client: person(1000123, 'Cleo'),
    trade: { login: '8804532', symbol: 'EURUSD', lots: '3.00000000' },
    clientMasked: false,
    partnerMasked: false,
    ...over,
  };
}

function page(rows: IbAccrual[]): IbAccrualPage {
  return { rows, total: rows.length, totals: [], maskedFields: [] } as IbAccrualPage;
}

describe('the commissions payout list (owner, 9 Oct 2026)', () => {
  it('names the trading account each payout came from', async () => {
    getIbAccruals.mockResolvedValue(page([row()]));
    renderWithProviders(<CommissionsPage />);
    expect(await screen.findByText('Login 8804532 · EURUSD · Lots 3')).toBeInTheDocument();
  });

  it('uses the plain column titles', async () => {
    getIbAccruals.mockResolvedValue(page([row()]));
    renderWithProviders(<CommissionsPage />);
    await screen.findByText('Login 8804532 · EURUSD · Lots 3');
    for (const title of ['Client & trading account', 'Partner (paid to)', 'Trade pool × share']) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Client (generated)')).not.toBeInTheDocument();
  });

  it('shows no account line for a masked client', async () => {
    getIbAccruals.mockResolvedValue(
      page([
        row({
          trade: null,
          clientMasked: true,
          client: {
            ...person(0, 'X'),
            id: null,
            portalId: null,
            email: null,
            firstName: null,
            lastName: null,
          },
        }),
      ]),
    );
    renderWithProviders(<CommissionsPage />);
    expect(await screen.findByText('Outside your territory')).toBeInTheDocument();
    expect(screen.queryByText(/^Login /)).not.toBeInTheDocument();
  });
});
