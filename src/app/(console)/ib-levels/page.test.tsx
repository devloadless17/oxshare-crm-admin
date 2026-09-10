import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
    description: null,
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

/**
 * Level 2 as the business asked for it: "the sub-partner takes thirty percent
 * of the ten dollars the main partner gets, and he gets three dollars".
 *
 * That is `share_of_parent` — a percentage of the RUNG ABOVE's per-lot rate,
 * not of broker revenue. The two are both "30%" and are wildly different
 * amounts, which is why the fixture uses the real one.
 */
function subPartner(over: Partial<IbLevel> = {}): IbLevel {
  return mainPartner({
    id: 'l-2',
    level: 2,
    name: 'Sub Partner',
    commissionMode: 'share_of_parent',
    commissionRate: '30.0000',
    commissionAmountPerLot: null,
    rebateMode: 'per_lot',
    rebateRate: '0.0000',
    rebateAmountPerLot: '3.00000000',
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
    expect(await screen.findByText('Main Partner')).toBeInTheDocument();
    expect(screen.getByText('Retired Tier')).toBeInTheDocument();
  });

  /*
   * The UNIT is the whole point. "10" is ten dollars a lot or ten percent of
   * the broker's revenue, and those are not close to the same amount of money.
   * A card that dropped the glyph would misstate every per-lot rung while
   * looking entirely correct.
   */
  it('shows a per-lot rung in money and a percentage rung in percent', async () => {
    getIbLevels.mockResolvedValue([
      mainPartner(),
      subPartner({ commissionMode: 'percent', commissionRate: '30.0000' }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    /* Level 1's commission is $10 a lot; level 2's is 30% of revenue. */
    expect(await screen.findByText('$10 / lot')).toBeInTheDocument();
    expect(screen.getByText('30% of revenue')).toBeInTheDocument();
  });

  /*
   * ── THE SHARE RESOLVES ON THE CARD, AND THAT IS THE POINT OF IT ──────────
   *
   * "30%" on a card is unreadable — 30% of what? The business asked for "thirty
   * percent of the ten dollars the main partner gets, and he gets three
   * dollars", so the card has to show the three dollars.
   */
  it('resolves a share of the rung above into money', async () => {
    renderWithProviders(<IbLevelsPage />);

    /* Level 2 is 30% of level 1's $10 a lot. */
    expect(await screen.findByText('30% above = $3.00 / lot')).toBeInTheDocument();
  });

  /*
   * A share of a rung that pays a PERCENTAGE has nothing per-lot to take a
   * share of, and the engine skips it. Said on the card rather than left to be
   * discovered from a trade that paid nobody.
   */
  it('says so when a share cannot resolve', async () => {
    getIbLevels.mockResolvedValue([
      mainPartner({
        commissionMode: 'percent',
        commissionRate: '25.0000',
        commissionAmountPerLot: null,
      }),
      subPartner(),
    ]);
    renderWithProviders(<IbLevelsPage />);

    expect(await screen.findByText(/unresolved/i)).toBeInTheDocument();
  });

  /*
   * Level 1 is never removable: every partner chain starts there, so deleting
   * it would stop the ladder paying rather than shortening it. The API refuses
   * it too — this stops an operator learning that by being refused.
   */
  it('offers no delete on level 1', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');

    /*
     * Checked INSIDE the open menu. Asserting on the closed page would pass
     * whether or not the item exists.
     */
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    expect(screen.queryByRole('menuitem', { name: /remove level 1/i })).toBeNull();
  });

  it('offers delete on a deeper rung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Sub Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 2/i }));
    expect(await screen.findByRole('menuitem', { name: /remove level 2/i })).toBeInTheDocument();
  });

  /*
   * ── EDITING IS A DIALOG, NOT AN INLINE FORM ─────────────────────────────
   *
   * The card is a read-only summary so the whole ladder fits on a screen. That
   * only works if the edit path actually opens the form, seeded with what the
   * rung currently holds — an empty dialog would silently blank the terms it
   * saved.
   */
  it('opens the edit dialog seeded with the rung’s current terms', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByLabelText(/^level name$/i)).toHaveValue('Main Partner');
    /*
     * $10 a lot, as stored — the form must not round-trip it into something
     * else. Matched by ROLE because the term's label names both the number and
     * its mode selector, and `getByLabelText` cannot tell them apart.
     */
    expect(screen.getByRole('textbox', { name: /the partner earns/i })).toHaveValue('10.00000000');
  });

  /*
   * ── THE PATCH SENDS BOTH SHAPES, AND THAT IS LOAD-BEARING ────────────────
   *
   * `ib_levels_commission_shape` requires exactly the column the mode reads and
   * FORBIDS the other. A save that sent only the mode and the newly-relevant
   * field would switch a rung to per-lot with no amount — which the database
   * refuses, correctly, as a term that pays on nothing.
   */
  it('sends both the rate and the per-lot amount when saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    await screen.findByLabelText(/^level name$/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateIbLevel).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          commissionMode: 'per_lot',
          commissionAmountPerLot: '10.00000000',
          commissionRate: expect.any(String),
        }),
      ),
    );
  });

  /*
   * The FLOAT trap, carried over from the catalogue this screen replaced —
   * where three rates totalling 100 summed to 100.00000000000001 and were
   * flagged red. decimal.js is what keeps the total exact.
   */
  it('does not flag an exactly-100 rung as over-allocated', async () => {
    getIbLevels.mockResolvedValue([
      mainPartner({
        commissionMode: 'percent',
        commissionRate: '33.3333',
        commissionAmountPerLot: null,
        rebateMode: 'percent',
        rebateRate: '66.6667',
        rebateAmountPerLot: null,
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  /*
   * ── THE 100% GUARD IS GONE (0117), and this replaces the case that pinned it.
   *
   * That test opened a rung paying 80% commission and a 30% rebate and asserted
   * the save button was disabled. Neither leg can be a percentage any more, so
   * the state it described is unreachable — the ceiling that still applies is
   * `ib_max_payout_per_lot`, enforced when a trade is priced, because it has to
   * compare against the trade's VOLUME.
   *
   * What matters on this form now is the rung the migration could NOT convert:
   * one priced as a percentage of broker revenue, which has no per-lot
   * equivalent. The form must say so rather than invent a figure.
   */
  it('warns when editing a rung priced on a retired model', async () => {
    getIbLevels.mockResolvedValue([
      mainPartner({
        commissionMode: 'percent',
        commissionRate: '80.0000',
        commissionAmountPerLot: null,
        rebateMode: 'percent',
        rebateRate: '30.0000',
        rebateAmountPerLot: null,
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/retired/i);
  });

  /*
   * A per-lot amount is NOT a share of anything, so it must not be summed with
   * a percentage. Without the split, "$80 a lot plus 30%" reads as 110% and an
   * honest mixed rung becomes unsaveable.
   */
  it('does not add a per-lot amount into the percentage total', async () => {
    getIbLevels.mockResolvedValue([
      mainPartner({
        commissionMode: 'per_lot',
        commissionAmountPerLot: '80.00000000',
        rebateMode: 'percent',
        rebateRate: '30.0000',
        rebateAmountPerLot: null,
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  /*
   * The bound is READ, not hardcoded — and since 0113 it is the depth the
   * commission ENGINE walks rather than a ceiling an operator could raise on
   * another screen. With the stub reporting 2 and two rungs configured there is
   * nothing to add, and the page explains that rather than pointing somewhere.
   */
  it('offers no deeper rung past what the engine pays, and says why', async () => {
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    expect(screen.queryByRole('button', { name: /add level/i })).toBeNull();
    expect(screen.getByText(/as far as the commission engine pays/i)).toBeInTheDocument();
  });

  it('collects the new rung’s details before creating it', async () => {
    getIbLevelLimits.mockResolvedValue({ maxLevels: 3, absoluteMaxLevels: 10 });
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    /*
     * The rounded PLUS opens a dialog rather than creating a blank rung. A
     * half-configured level pays nobody, and on this screen "pays nobody" and
     * "not configured yet" look identical — so the terms are collected first.
     */
    await user.click(await screen.findByRole('button', { name: /add level 3/i }));

    const name = await screen.findByLabelText(/^level name$/i);
    await user.clear(name);
    await user.type(name, 'Deep Tier');
    await user.click(screen.getByRole('button', { name: /^add level$/i }));

    /*
     * EVERY rung is per lot since 0117 — including a deep one, which used to
     * default to `share_of_parent` at 30%. That mode was removed because with
     * several sub-partner rungs a rate nobody can read off the card without
     * resolving a chain upward is a rate somebody eventually gets wrong.
     *
     * The rate is asserted as a literal amount rather than a percentage, which
     * is the whole point: the card now says what it pays.
     */
    await waitFor(() =>
      expect(createIbLevel).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 3,
          name: 'Deep Tier',
          commissionMode: 'per_lot',
          commissionAmountPerLot: '10',
        }),
      ),
    );
  });

  /*
   * Read-only means READ-ONLY. `ib.view` without `ib.levels.edit` is a real
   * role — an operator trusted to see the ladder is not automatically trusted
   * to change what every partner on it earns.
   */
  it('offers no editing to an operator who may only read', async () => {
    permissions.current = ['ib.view'];
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    expect(screen.queryByRole('button', { name: /actions for level/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add level/i })).toBeNull();
  });
});
