import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbLevel } from '@/lib/api/admin';
import IbLevelsPage from './page';

/**
 * The commission ladder — the screen where a typo changes what every partner on
 * a rung is paid.
 *
 * ## What these carry over from the programme catalogue they replaced
 *
 * That screen's tests found a live defect: three rates totalling 100 in decimal
 * totalled 100.00000000000001 as floats and were flagged red as
 * over-allocated. This screen carries the same class of value — decimal strings
 * that must never round-trip through a number — so the running-total case comes
 * with it.
 *
 * The rest are about the ways a correct configuration can be DISPLAYED wrongly,
 * and every one of them renders perfectly without an assertion:
 *
 *  1. a rate that loses its scale on the way to the DOM;
 *  2. a per-lot amount shown with a `%` beside it, which is a different payout
 *     at the same digits; and
 *  3. a PATCH that sends only the active shape, which the database refuses.
 */
const { getIbLevels, getIbLevelLimits, createIbLevel, updateIbLevel, deleteIbLevel } = vi.hoisted(
  () => ({
    getIbLevels: vi.fn(),
    getIbLevelLimits: vi.fn(),
    createIbLevel: vi.fn(),
    updateIbLevel: vi.fn(),
    deleteIbLevel: vi.fn(),
  }),
);

/*
 * BOTH the named export and the default, per this repo's mocking note: the page
 * reaches for the default, and mocking one leaves the other undefined — a
 * failure that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = {
    admin: { getIbLevels, getIbLevelLimits, createIbLevel, updateIbLevel, deleteIbLevel },
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

/** Level 1 as the business asked for it: a flat amount per lot, both legs. */
function mainPartner(over: Partial<IbLevel> = {}): IbLevel {
  return {
    id: 'l-1',
    level: 1,
    name: 'Main Partner',
    enabled: true,
    commissionMode: 'per_lot',
    commissionRate: '0.0000',
    commissionAmountPerLot: '10.00000000',
    rebateMode: 'per_lot',
    rebateRate: '0.0000',
    rebateAmountPerLot: '2.00000000',
    /* What the platform actually computes on, and the shipped default. */
    revenueBasis: 'commission_swap',
    partnerCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

/** Level 2 as the business asked for it: a percentage. */
function subPartner(over: Partial<IbLevel> = {}): IbLevel {
  return mainPartner({
    id: 'l-2',
    level: 2,
    name: 'Sub Partner',
    commissionMode: 'percent',
    commissionRate: '30.0000',
    commissionAmountPerLot: null,
    rebateMode: 'percent',
    rebateRate: '5.0000',
    rebateAmountPerLot: null,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIbLevels.mockResolvedValue([mainPartner(), subPartner()]);
  getIbLevelLimits.mockResolvedValue({ maxLevels: 2, absoluteMaxLevels: 10 });
  updateIbLevel.mockResolvedValue(mainPartner());
  createIbLevel.mockResolvedValue(mainPartner({ id: 'l-3', level: 3 }));
  deleteIbLevel.mockResolvedValue(undefined);
});

describe('the commission ladder', () => {
  it('shows every rung, disabled ones included', async () => {
    getIbLevels.mockResolvedValue([
      mainPartner(),
      subPartner({ name: 'Retired Tier', enabled: false }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    /*
     * A disabled rung is SHOWN, not filtered — managing it is the point of the
     * screen, and terms you cannot see are terms you cannot re-enable.
     */
    expect(await screen.findByDisplayValue('Main Partner')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Retired Tier')).toBeInTheDocument();
  });

  /*
   * The UNIT is the whole point. "10" is ten dollars a lot or ten percent of
   * the broker's revenue, and those are not close to the same amount of money.
   * A screen that dropped the glyph would misstate every per-lot rung while
   * looking entirely correct.
   */
  it('shows a per-lot rung in money and a percentage rung in percent', async () => {
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Main Partner');

    /* Level 1's two terms are per-lot; level 2's are percentages. */
    expect(screen.getAllByText('/lot')).toHaveLength(2);
    expect(screen.getAllByText('%')).toHaveLength(2);
  });

  /*
   * The FLOAT trap, carried over from the catalogue this replaced — where three
   * rates totalling 100 summed to 100.00000000000001 and were flagged red.
   * decimal.js is what keeps the total exact, and the assertion is on the
   * SAVE BUTTON rather than on the text, because being disabled is the
   * consequence an operator actually hits.
   */
  it('does not flag an exactly-100 rung as over-allocated', async () => {
    getIbLevels.mockResolvedValue([
      subPartner({ commissionRate: '33.3333', rebateRate: '66.6667' }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Sub Partner');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('refuses to save a rung whose two percentages exceed the revenue', async () => {
    getIbLevels.mockResolvedValue([
      subPartner({ commissionRate: '80.0000', rebateRate: '30.0000' }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Sub Partner');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  /*
   * A per-lot amount is NOT a share of anything, so it must not be summed with
   * a percentage. Without the split, "$80 a lot plus 30%" reads as 110% and an
   * honest mixed rung becomes unsaveable.
   */
  it('does not add a per-lot amount into the percentage total', async () => {
    getIbLevels.mockResolvedValue([
      subPartner({
        commissionMode: 'per_lot',
        commissionRate: '0.0000',
        commissionAmountPerLot: '80.00000000',
        rebateMode: 'percent',
        rebateRate: '30.0000',
        rebateAmountPerLot: null,
      }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Sub Partner');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  /*
   * ── THE PATCH SENDS BOTH SHAPES, AND THAT IS LOAD-BEARING ────────────────
   *
   * `ib_levels_commission_shape` requires exactly the column the mode reads and
   * FORBIDS the other. A PATCH that sent only the mode and the newly-relevant
   * field would switch a rung to per-lot with no amount — which the database
   * refuses, correctly, as a term that pays on nothing.
   */
  it('sends both the rate and the per-lot amount when saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Main Partner');
    /*
     * Scoped to the CARD, not indexed out of a list. Every rung renders the same
     * button, so `[0]` would silently follow whatever order the ladder came back
     * in — and this assertion is specifically about level 1's per-lot shape.
     */
    const card = within(screen.getByRole('form', { name: /level 1/i }));
    await user.click(card.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateIbLevel).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          commissionMode: 'per_lot',
          commissionRate: '0.0000',
          commissionAmountPerLot: '10.00000000',
          rebateMode: 'per_lot',
          rebateAmountPerLot: '2.00000000',
        }),
      ),
    );
  });

  /*
   * The RATE keeps its stored scale on the way to the DOM and back. A value
   * that went through a number would come back as '30' where '30.0000' was
   * stored — which reads as correct and is a different string in the audit row.
   */
  it('round-trips a rate without losing its scale', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Sub Partner');
    const card = within(screen.getByRole('form', { name: /level 2/i }));
    await user.click(card.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateIbLevel).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commissionRate: '30.0000', rebateRate: '5.0000' }),
      ),
    );
  });

  /*
   * The ceiling is READ, not hardcoded. With `maxLevels: 2` and two rungs
   * configured there is nothing to add — and the screen says why, because an
   * operator who cannot find the button needs to know it is a limit they
   * control rather than one the product imposes.
   */
  it('offers no deeper rung at the configured ceiling, and says why', async () => {
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Main Partner');
    expect(screen.queryByRole('button', { name: /add level/i })).toBeNull();
    expect(screen.getByText(/configured depth of 2/i)).toBeInTheDocument();
  });

  it('offers a deeper rung once the ceiling allows one', async () => {
    getIbLevelLimits.mockResolvedValue({ maxLevels: 3, absoluteMaxLevels: 10 });
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    const add = await screen.findByRole('button', { name: /add level 3/i });
    await user.click(add);

    /*
     * Created at ZERO, which pays nobody and says so on the card. A new rung
     * must not start paying on a number nobody chose.
     */
    await waitFor(() =>
      expect(createIbLevel).toHaveBeenCalledWith(
        expect.objectContaining({ level: 3, commissionRate: '0', rebateRate: '0' }),
      ),
    );
  });

  /*
   * Level 1 is never removable: every partner chain starts there, so deleting
   * it would stop the ladder paying rather than shortening it. The API refuses
   * it too — this stops an operator learning that by being refused.
   */
  it('offers no delete on level 1', async () => {
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Main Partner');
    expect(screen.queryByRole('button', { name: /remove level 1/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remove level 2/i })).toBeInTheDocument();
  });

  /*
   * Read-only means READ-ONLY. `ib.view` without `ib.levels.edit` is a real
   * role — an operator trusted to see the ladder is not automatically trusted
   * to change what every partner on it earns.
   */
  it('offers no editing to an operator who may only read', async () => {
    permissions.current = ['ib.view'];
    renderWithProviders(<IbLevelsPage />);

    await screen.findByDisplayValue('Main Partner');
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /disable/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove level/i })).toBeNull();
  });
});
