import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { IbPartnerDetail, IbProgram } from '@/lib/api/admin';
import { ChangeProgramDialog } from './client-partner-dialogs';

/**
 * The control that puts a partner on a programme — IB-06's missing half.
 *
 * Until it existed, a partner's terms were written once at approval, always to
 * whichever programme sorted first, and never again: an operator could build
 * Gold, Silver and Platinum and assign nobody, while two of the API's own
 * refusals told them to "move them to another programme first".
 *
 * The three properties below are each a rule the server enforces independently.
 * The dialog is not the enforcement — it is what stops an operator learning the
 * rule by being refused, and what stops them changing pay by accident.
 */
const { getIbPrograms, changeIbPartnerProgram } = vi.hoisted(() => ({
  getIbPrograms: vi.fn(),
  changeIbPartnerProgram: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getIbPrograms, changeIbPartnerProgram } };
  return { api, default: api };
});

function program(over: Partial<IbProgram> = {}): IbProgram {
  return {
    id: 'p-gold',
    name: 'Gold',
    sortOrder: 0,
    mode: 'commission_only',
    /* What the platform actually computes on, and the shipped default. */
    revenueBasis: 'commission_swap',
    tiers: [
      { depth: 1, rate: '60.0000' },
      { depth: 2, rate: '40.0000' },
    ],
    rebateRate: '0.0000',
    enabled: true,
    partnerCount: 3,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const PARTNER = {
  userId: 'u-1',
  level: 1,
  levelName: 'Master Partner',
  rateValue: '70.0000',
  programId: 'p-gold',
  programName: 'Gold',
  referralCode: 'OX-1234',
  active: true,
} as unknown as IbPartnerDetail;

function renderDialog() {
  return renderWithProviders(
    <ChangeProgramDialog open onClose={vi.fn()} partner={PARTNER} name="Layla Hadad" />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getIbPrograms.mockResolvedValue([
    program(),
    program({
      id: 'p-silver',
      name: 'Silver',
      tiers: [
        { depth: 1, rate: '30.0000' },
        { depth: 2, rate: '10.0000' },
      ],
    }),
  ]);
  changeIbPartnerProgram.mockResolvedValue({});
});

describe('moving a partner onto another programme', () => {
  /*
   * A disabled programme pays nothing, and the API refuses a move onto one —
   * which is the other half of its refusal to DISABLE a programme partners are
   * standing on. Offering it here produces a choice whose only outcome is a
   * refusal, and an operator reads that refusal as "this partner cannot be
   * moved" rather than "that programme is switched off".
   */
  it('offers enabled programmes only', async () => {
    getIbPrograms.mockResolvedValue([
      program(),
      program({ id: 'p-retired', name: 'Legacy Platinum', enabled: false }),
    ]);
    renderDialog();

    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Platinum')).toBeNull();
  });

  /*
   * "Gold" alone does not say what an operator is about to change somebody's
   * pay TO. The LADDER is the decision — every level, and how many of them,
   * because the count is how far this partner's earnings will reach. The rates
   * keep their scale on the way to the DOM for the same reason every other rate
   * on this product does.
   */
  it('shows the whole ladder beside each name, not just the name', async () => {
    renderDialog();

    expect(await screen.findByText(/L1 60% · L2 40% — reaches 2 level\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/L1 30% · L2 10% — reaches 2 level\(s\)/i)).toBeInTheDocument();
  });

  /*
   * A programme reaching further is a materially different offer, and the count
   * is the only part of it that is not a percentage. Pinned separately because
   * a renderer that dropped the deepest tier would still pass the assertion
   * above on its first two levels.
   */
  it('says how far a deeper programme reaches', async () => {
    getIbPrograms.mockResolvedValue([
      program(),
      program({
        id: 'p-deep',
        name: 'Platinum',
        tiers: [
          { depth: 1, rate: '40.0000' },
          { depth: 2, rate: '20.0000' },
          { depth: 3, rate: '5.0000' },
        ],
      }),
    ]);
    renderDialog();

    expect(
      await screen.findByText(/L1 40% · L2 20% · L3 5% — reaches 3 level\(s\)/i),
    ).toBeInTheDocument();
  });

  it('starts on the programme the partner is already paid by', async () => {
    renderDialog();

    const gold = await screen.findByRole('radio', { checked: true });
    expect(gold).toBeInTheDocument();
    // Exactly one, so nothing else is silently pre-armed.
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  /*
   * Confirming the programme somebody is already on would post a change that
   * changes nothing, land in the audit trail as a rate change, and read to the
   * next person as terms having been touched on a day they were not.
   */
  it('will not submit a move to the programme they are already on', async () => {
    renderDialog();

    await screen.findByText('Gold');
    expect(screen.getByRole('button', { name: /move to this programme/i })).toBeDisabled();
  });

  it('moves the partner once another programme is chosen', async () => {
    renderDialog();

    await screen.findByText('Silver');
    await userEvent.click(screen.getByRole('radio', { name: /silver/i }));

    const save = screen.getByRole('button', { name: /move to this programme/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(changeIbPartnerProgram).toHaveBeenCalledWith('u-1', 'p-silver'));
  });
});
