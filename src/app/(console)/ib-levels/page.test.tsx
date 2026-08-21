import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import IbLevelsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbLevel } from '@/lib/api/admin';

/**
 * The IB rate ladder — ADM-11's screen, and the configuration the commission
 * engine reads on every accrual.
 *
 * ## Why this one matters more than an ordinary catalogue screen
 *
 * These rungs decide what a partner is PAID. `rateValue` is a decimal string
 * (§6.1) precisely because a percentage that survives a round trip through a
 * float is wrong in a digit nobody checks — and the wrongness is invisible: a
 * rate rendering as `70` instead of `70.0000` looks like a tidier version of
 * the same number.
 *
 * The other rule pinned here: a DISABLED rung takes no share and accepts no new
 * partners, while the partners already on it keep theirs. That is not the same
 * as deleting it, and the screen has to keep the two distinguishable.
 */
const { getIbLevels, createIbLevel, updateIbLevel, deleteIbLevel, reorderIbLevels } = vi.hoisted(
  () => ({
    getIbLevels: vi.fn(),
    createIbLevel: vi.fn(),
    updateIbLevel: vi.fn(),
    deleteIbLevel: vi.fn(),
    reorderIbLevels: vi.fn(),
  }),
);

/*
 * BOTH the named export and the default — this page reaches for the default.
 * Mocking one leaves the other undefined and the failure reads as a broken
 * query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = {
    admin: { getIbLevels, createIbLevel, updateIbLevel, deleteIbLevel, reorderIbLevels },
  };
  return { api, default: api };
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

function level(over: Partial<IbLevel> = {}): IbLevel {
  return {
    level: 1,
    name: 'Master Partner',
    rateValue: '70.0000',
    enabled: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIbLevels.mockResolvedValue([
    level(),
    level({ level: 2, name: 'Sub Partner', rateValue: '30.0000' }),
  ]);
});

describe('the IB rate ladder', () => {
  it('lists the rungs a partner can sit on', async () => {
    renderWithProviders(<IbLevelsPage />);

    expect(await screen.findByText('Master Partner')).toBeInTheDocument();
    expect(screen.getByText('Sub Partner')).toBeInTheDocument();
  });

  /*
   * ⚠️ The rate is a DECIMAL STRING and must reach the DOM with its scale
   * intact. The assertion is deliberately on a value whose trailing digits a
   * `Number()` would silently drop: `70.0000` becomes `70`, which reads as the
   * same rate and is a different contract.
   */
  it('renders a rate without coercing away its decimal places', async () => {
    getIbLevels.mockResolvedValue([level({ rateValue: '12.3456' })]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Master Partner');
    // `getAllByText`, because the rung and the allocated-share header both show
    // it — which is itself the point: the scale survives on both paths.
    expect(screen.getAllByText(/12\.3456/).length).toBeGreaterThan(0);
    // The float form of the same rate. `Number('12.3456')` renders identically,
    // so the value that would betray a coercion is a LOST digit, not a gained one.
    expect(screen.queryByText(/12\.345\b/)).toBeNull();
  });

  /*
   * An empty ladder is not a cosmetic state: no partner can be approved without
   * a rung to place them on, so the screen says that rather than showing a
   * blank table an operator reads as "loading".
   */
  it('explains that an empty ladder blocks partner approval', async () => {
    // Read-only, because a manager is shown the tree with its add control
    // instead — a dead-end message would be the wrong answer for the one person
    // who can fix it.
    permissions.current = ['ib.view'];
    getIbLevels.mockResolvedValue([]);
    renderWithProviders(<IbLevelsPage />);

    expect(await screen.findByText(/no levels configured yet/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be approved/i)).toBeInTheDocument();
  });

  /*
   * ── The allocated-share total, and why it is not a float ──
   *
   * This ladder sums to exactly 100 in decimal and to 100.00000000000001 in
   * floating point. The float version rendered that number verbatim in the
   * header AND painted it red as over-allocated — telling an operator their
   * correctly configured ladder had given away more than the broker earned.
   *
   * The rates are the point of the fixture: any tidier set (70 / 30) passes
   * either way, which is how the bug survived.
   */
  it('totals the allocated share in decimal, not floating point', async () => {
    getIbLevels.mockResolvedValue([
      level({ level: 1, name: 'Master Partner', rateValue: '27.6000' }),
      level({ level: 2, name: 'Sub Partner', rateValue: '39.4286' }),
      level({ level: 3, name: 'Third Partner', rateValue: '32.9714' }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Master Partner');
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText(/100\.00000000000001/)).toBeNull();
  });

  it('does not count a disabled rung toward the allocated share', async () => {
    getIbLevels.mockResolvedValue([
      level({ level: 1, rateValue: '60.0000' }),
      level({ level: 2, name: 'Sub Partner', rateValue: '40.0000', enabled: false }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Master Partner');
    /*
     * The property is the ABSENCE of 100%: if a disabled rung counted, the
     * header would read 100% and claim the broker's whole revenue is allocated.
     * Asserting 60% directly is ambiguous — the enabled rung renders 60% too.
     */
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('offers a retry when the ladder cannot be loaded, never an empty ladder', async () => {
    getIbLevels.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<IbLevelsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no levels configured yet/i)).toBeNull();
  });

  it('reads the ladder from the server', async () => {
    renderWithProviders(<IbLevelsPage />);
    await waitFor(() => expect(getIbLevels).toHaveBeenCalled());
  });
});

describe('the IB rate ladder — who may change what a partner earns', () => {
  it('offers no way to add a rung to an operator who may only read', async () => {
    permissions.current = ['ib.view'];
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Master Partner');
    expect(screen.queryByRole('button', { name: /add level/i })).toBeNull();
  });

  it('offers the add control once the operator holds the create key', async () => {
    permissions.current = ['ib.view', 'ib.levels.create'];
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Master Partner');
    expect(screen.getByRole('button', { name: /add level/i })).toBeInTheDocument();
  });
});
