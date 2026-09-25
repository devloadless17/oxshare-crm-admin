import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { IbLevel, IbPartnerDetail } from '@/lib/api/admin';
import { ChangeLevelDialog } from './client-partner-dialogs';

/**
 * The control that moves a partner between RUNGS — what decides their terms.
 *
 * It replaced `ChangeProgramDialog` with the catalogue (0112), and the tests
 * carried over rather than being rewritten from nothing: the three properties
 * below are each a rule the server enforces independently, and each survived
 * the change of what a partner's terms come FROM.
 *
 * The dialog is not the enforcement — it is what stops an operator learning a
 * rule by being refused, and what stops them changing pay by accident.
 */
const { getIbLevels, changeIbPartnerLevel } = vi.hoisted(() => ({
  getIbLevels: vi.fn(),
  changeIbPartnerLevel: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getIbLevels, changeIbPartnerLevel } };
  return { api, default: api };
});

function level(over: Partial<IbLevel> = {}): IbLevel {
  return {
    id: 'l-1',
    level: 1,
    name: 'Main Partner',
    description: null,
    enabled: true,
    /* Shares of the traded product's commission type (0139). */
    commissionShare: '70.0000',
    rebateShare: '50.0000',
    partnerCount: 3,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const SUB_PARTNER = level({
  id: 'l-2',
  level: 2,
  name: 'Sub Partner',
  commissionShare: '30.0000',
  rebateShare: '5.0000',
});

const PARTNER = {
  userId: 'u-1',
  level: 1,
  levelName: 'Main Partner',
  referralCode: 'OX-1234',
  active: true,
} as unknown as IbPartnerDetail;

function renderDialog() {
  return renderWithProviders(
    <ChangeLevelDialog open onClose={vi.fn()} partner={PARTNER} name="Layla Hadad" />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getIbLevels.mockResolvedValue([level(), SUB_PARTNER]);
  changeIbPartnerLevel.mockResolvedValue({});
});

describe('moving a partner to another level', () => {
  /*
   * A disabled level pays nothing, and the API refuses a move onto one — which
   * is the other half of its refusal to DISABLE a level partners are standing
   * on. Offering it here produces a choice whose only outcome is a refusal, and
   * an operator reads that refusal as "this partner cannot be moved" rather
   * than "that level is switched off".
   */
  it('offers enabled levels only', async () => {
    getIbLevels.mockResolvedValue([
      level(),
      level({ id: 'l-3', level: 3, name: 'Retired Tier', enabled: false }),
    ]);
    renderDialog();

    expect(await screen.findByText(/Main Partner/)).toBeInTheDocument();
    expect(screen.queryByText(/Retired Tier/)).toBeNull();
  });

  /*
   * "Level 2" alone does not say what an operator is about to change somebody's
   * pay TO. The TERMS are the decision, and the UNIT is half of them: "10" means
   * two entirely different payouts under the two modes, so a renderer that
   * dropped the glyph would show a plausible wrong number.
   */
  it('shows the terms beside each level, as shares of the product’s type', async () => {
    renderDialog();

    expect(
      await screen.findByText(/70% of the product’s commission · client rebate 50% of its rebate/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/30% of the product’s commission · client rebate 5% of its rebate/i),
    ).toBeInTheDocument();
  });

  /*
   * The two shares are INDEPENDENT — "70% of the commission, nothing back to
   * the client" is an ordinary arrangement — so a renderer that read one
   * figure for both legs would be wrong on exactly this row.
   */
  it('reads each leg’s own share rather than assuming one for the row', async () => {
    getIbLevels.mockResolvedValue([
      level(),
      level({
        id: 'l-mixed',
        level: 2,
        name: 'No Rebate',
        commissionShare: '7.5000',
        rebateShare: '0.0000',
      }),
    ]);
    renderDialog();

    expect(
      await screen.findByText(
        /7\.5% of the product’s commission · client rebate 0% of its rebate/i,
      ),
    ).toBeInTheDocument();
  });

  it('starts on the level the partner already stands on', async () => {
    renderDialog();

    const current = await screen.findByRole('radio', { checked: true });
    expect(current).toBeInTheDocument();
    // Exactly one, so nothing else is silently pre-armed.
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  /*
   * Confirming the level somebody is already on would post a change that
   * changes nothing, land in the audit trail as a level change, and read to the
   * next person as terms having been touched on a day they were not.
   */
  it('will not submit a move to the level they are already on', async () => {
    renderDialog();

    await screen.findByText(/Main Partner/);
    expect(screen.getByRole('button', { name: /move to this level/i })).toBeDisabled();
  });

  it('moves the partner once another level is chosen', async () => {
    renderDialog();

    await screen.findByText(/Sub Partner/);
    await userEvent.click(screen.getByRole('radio', { name: /sub partner/i }));

    const save = screen.getByRole('button', { name: /move to this level/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    /* The NUMBER, not an id — a level is its number, and that is the API's key. */
    await waitFor(() => expect(changeIbPartnerLevel).toHaveBeenCalledWith('u-1', 2));
  });
});
