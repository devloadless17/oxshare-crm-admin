import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbCommissionType, IbLevel } from '@/lib/api/admin';
import IbLevelsPage from './page';

/**
 * The commission ladder — the screen where a typo changes what every partner on
 * a rung is paid.
 *
 * ## What a rung is since 0140
 *
 * A PERCENTAGE of the traded product's commission type, not an amount. So the
 * ways a correct configuration can be DISPLAYED wrongly are: a share shown
 * without saying what it is a share of; a share shown without what it comes to
 * in money on any real type; and a save that round-trips the percentage
 * through a number. Each renders perfectly without an assertion.
 */
const {
  getIbLevels,
  getIbLevelLimits,
  getIbCommissionTypes,
  createIbLevel,
  updateIbLevel,
  deleteIbLevel,
} = vi.hoisted(() => ({
  getIbLevels: vi.fn(),
  getIbLevelLimits: vi.fn(),
  getIbCommissionTypes: vi.fn(),
  createIbLevel: vi.fn(),
  updateIbLevel: vi.fn(),
  deleteIbLevel: vi.fn(),
}));

/*
 * BOTH the named export and the default, per this repo's mocking note: the page
 * reaches for the default, and mocking one leaves the other undefined — a
 * failure that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = {
    admin: {
      getIbLevels,
      getIbLevelLimits,
      getIbCommissionTypes,
      createIbLevel,
      updateIbLevel,
      deleteIbLevel,
    },
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

/** Level 1: 70% of the product's commission, 50% of its rebate. */
function mainPartner(over: Partial<IbLevel> = {}): IbLevel {
  return {
    id: 'l-1',
    level: 1,
    name: 'Main Partner',
    description: null,
    enabled: true,
    commissionShare: '70.0000',
    rebateShare: '50.0000',
    partnerCount: 0,
    partnersOutsideScope: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

/** Level 2: 30% of the product's commission, nothing back to the client. */
function subPartner(over: Partial<IbLevel> = {}): IbLevel {
  return mainPartner({
    id: 'l-2',
    level: 2,
    name: 'Sub Partner',
    commissionShare: '30.0000',
    rebateShare: '0.0000',
    ...over,
  });
}

/** The one rate card on the platform: $10 a lot commission, $3 rebate. */
function standardType(over: Partial<IbCommissionType> = {}): IbCommissionType {
  return {
    id: 'ct-1',
    name: 'Standard',
    description: null,
    enabled: true,
    commissionPerLot: '10.00000000',
    rebatePerLot: '3.00000000',
    sortOrder: 0,
    productNames: ['Standard'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIbLevels.mockResolvedValue([mainPartner(), subPartner()]);
  getIbLevelLimits.mockResolvedValue({ maxLevels: 2, absoluteMaxLevels: 10 });
  getIbCommissionTypes.mockResolvedValue([standardType()]);
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
   * The card says what the share is a share OF. "70" alone on a money screen
   * is unreadable; "70% of the product's commission" is the whole claim.
   */
  it('shows each share as a percentage of the product’s figure', async () => {
    renderWithProviders(<IbLevelsPage />);

    expect(await screen.findByText('70% of the product’s commission')).toBeInTheDocument();
    expect(screen.getByText('50% of the product’s rebate')).toBeInTheDocument();
    expect(screen.getByText('30% of the product’s commission')).toBeInTheDocument();
  });

  /*
   * ── THE SHARE RESOLVES ON THE CARD, PER TYPE, AND THAT IS THE POINT ──────
   *
   * A percentage of a number on another screen is not a figure anybody can
   * hold in their head. 70% of a $10 type is $7.00 to the partner and 50% of
   * its $3 rebate is $1.50 to the client — said on the card.
   */
  it('says what each share comes to in money on every active type', async () => {
    renderWithProviders(<IbLevelsPage />);

    expect(await screen.findByText('Standard: partner $7.00 · client $1.50')).toBeInTheDocument();
    expect(screen.getByText('Standard: partner $3.00 · client $0.00')).toBeInTheDocument();
  });

  it('leaves a disabled type out of the preview, because it pays nobody', async () => {
    getIbCommissionTypes.mockResolvedValue([
      standardType(),
      standardType({ id: 'ct-2', name: 'Retired', enabled: false }),
    ]);
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Standard: partner $7.00 · client $1.50');
    expect(screen.queryByText(/Retired: partner/)).toBeNull();
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
   * rung currently holds — an empty dialog would silently blank the shares it
   * saved.
   */
  it('opens the edit dialog seeded with the rung’s current shares', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    expect(await screen.findByLabelText(/^level name$/i)).toHaveValue('Main Partner');
    expect(screen.getByRole('textbox', { name: /the partner earns/i })).toHaveValue('70');
    expect(screen.getByRole('textbox', { name: /their client gets back/i })).toHaveValue('50');
  });

  /*
   * A STRING on the wire, and BOTH shares — a PATCH that sent only the one the
   * operator touched would be fine, but one that sent a number would let a
   * 33.3333 become 33.333299999999994 before any arithmetic happened.
   */
  it('sends both shares as strings when saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const commission = await screen.findByRole('textbox', { name: /the partner earns/i });
    await user.clear(commission);
    await user.type(commission, '33.3333');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateIbLevel).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ commissionShare: '33.3333', rebateShare: '50' }),
      ),
    );
    const sent = updateIbLevel.mock.calls[0]?.[1] as { commissionShare: unknown } | undefined;
    expect(typeof sent?.commissionShare).toBe('string');
  });

  /*
   * A share is a fraction of ONE figure, so it cannot exceed the whole of it.
   * Refused beside the field, before the API has to.
   */
  it('refuses a share over 100% before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IbLevelsPage />);

    await screen.findByText('Main Partner');
    await user.click(screen.getByRole('button', { name: /actions for level 1/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const commission = await screen.findByRole('textbox', { name: /the partner earns/i });
    await user.clear(commission);
    await user.type(commission, '150');

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot exceed 100%/i);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(updateIbLevel).not.toHaveBeenCalled();
  });

  /*
   * The bound is READ, not hardcoded — since 0113 it is the depth the
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
    const commission = screen.getByRole('textbox', { name: /the partner earns/i });
    await user.clear(commission);
    await user.type(commission, '10');
    await user.click(screen.getByRole('button', { name: /^add level$/i }));

    await waitFor(() =>
      expect(createIbLevel).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 3,
          name: 'Deep Tier',
          commissionShare: '10',
          rebateShare: '0',
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
