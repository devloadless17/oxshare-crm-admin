import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm } from '@/test/confirm';
import { ALL_PERMISSIONS } from '@/test/permissions';
import type { IbProgram } from '@/lib/api/admin';
import IbProgramsPage from './page';

/**
 * Commission programmes — ADM-10, and the screen where a typo changes what
 * every partner on it is paid.
 *
 * ## Why it shipped without these and should not have
 *
 * Its sibling, the rate ladder, has nine tests, and writing them found a live
 * defect: a three-rung ladder totalling 100 in decimal totalled
 * 100.00000000000001 as floats and was flagged red as over-allocated. This
 * screen carries the same class of value — five decimal strings a row — with
 * more of them, and a mode that decides which of them mean anything.
 *
 * So the cases below are about the two ways a correct configuration can be
 * displayed wrongly:
 *
 *  1. a rate that loses its scale on the way to the DOM, and
 *  2. a leg that does not pay being shown as a rate of zero, which is a rate
 *     somebody chose rather than a leg this mode ignores.
 *
 * Both render perfectly. Neither is visible without an assertion.
 */
const { getIbPrograms, createIbProgram, updateIbProgram, deleteIbProgram } = vi.hoisted(() => ({
  getIbPrograms: vi.fn(),
  createIbProgram: vi.fn(),
  updateIbProgram: vi.fn(),
  deleteIbProgram: vi.fn(),
}));

/*
 * BOTH the named export and the default, per this repo's mocking note: the page
 * reaches for the default, and mocking one leaves the other undefined — a
 * failure that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = { admin: { getIbPrograms, createIbProgram, updateIbProgram, deleteIbProgram } };
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
    partnerCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getIbPrograms.mockResolvedValue([program()]);
  deleteIbProgram.mockResolvedValue(undefined);
});

/**
 * Open one row's actions menu.
 *
 * The edit and delete controls moved off the row and into `RowActions` when
 * this page adopted the shared `DataTable` — the same menu every other
 * catalogue screen uses. A wide table scrolls inline buttons off the trailing
 * edge; a pinned menu does not.
 */
async function openRowActions(user: typeof userEvent, name = 'Gold') {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }),
  );
}

describe('the commission programme catalogue', () => {
  it('lists the programmes a partner can be paid on', async () => {
    getIbPrograms.mockResolvedValue([program(), program({ id: 'p-silver', name: 'Silver' })]);
    renderWithProviders(<IbProgramsPage />);

    expect(await screen.findByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
  });

  /*
   * ⚠️ Every rate is a DECIMAL STRING (§6.1) and must reach the DOM with its
   * scale intact. The assertion is on a value a `Number()` would silently
   * shorten: `60.0000` becomes `60`, which reads as the same rate and is a
   * different contract — and the shortened form is the tidier-looking one, so
   * nobody reports it.
   */
  it('renders rates without coercing away their decimal places', async () => {
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    expect(screen.getByText('60.0000%')).toBeInTheDocument();
    expect(screen.getByText('40.0000%')).toBeInTheDocument();
    // The float form of the same rates. A LOST digit is what betrays a coercion.
    expect(screen.queryByText('60%')).toBeNull();
    expect(screen.queryByText('40%')).toBeNull();
  });

  /*
   * ── A LEG THAT DOES NOT PAY IS NOT A RATE OF ZERO ─────────────────────────
   *
   * A `commission_only` programme still carries a rebate rate — the form keeps
   * whatever was typed, so a later mode change finds it — and that stored
   * number pays nobody. Shown as `0.0000%` it reads as "this programme returns
   * nothing to clients, by decision"; shown as an em dash it reads as "this
   * mode has no client leg". The second is true, and an operator prices on the
   * difference.
   */
  it('shows an em dash for a leg the mode does not pay, never a rate', async () => {
    getIbPrograms.mockResolvedValue([program({ mode: 'commission_only', rebateRate: '5.0000' })]);
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    expect(screen.getByText('—')).toBeInTheDocument();
    // The carried-but-unpaid rate must not be presented as one that pays.
    expect(screen.queryByText('5.0000%')).toBeNull();
  });

  it('hides the whole ladder on a rebate-only programme', async () => {
    getIbPrograms.mockResolvedValue([
      program({
        mode: 'rebate_only',
        tiers: [{ depth: 1, rate: '60.0000' }],
        rebateRate: '10.0000',
      }),
    ]);
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    // One dash where the ladder would be. The rebate is the one leg that pays,
    // and it keeps its scale. A carried-but-unpaid tier must not be presented
    // as a rate that pays somebody.
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.getByText('10.0000%')).toBeInTheDocument();
    expect(screen.queryByText('60.0000%')).toBeNull();
  });

  /*
   * Disabled is a STATE, not a styling. A programme that pays nothing and takes
   * no new partners looks otherwise identical to one that does, and a greyed
   * row is something an operator can look straight past.
   */
  it('says outright that a programme is disabled', async () => {
    getIbPrograms.mockResolvedValue([program({ enabled: false })]);
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
  });

  it('says the catalogue is empty rather than showing a bare table', async () => {
    getIbPrograms.mockResolvedValue([]);
    renderWithProviders(<IbProgramsPage />);

    expect(await screen.findByText(/no commission programmes yet/i)).toBeInTheDocument();
  });

  /*
   * A failed load must not render as an empty catalogue. "No programmes exist"
   * and "we could not ask" are opposite facts, and the first invites an
   * operator to create a duplicate of terms partners are already standing on.
   */
  it('offers a retry when the catalogue cannot be loaded, never an empty one', async () => {
    getIbPrograms.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<IbProgramsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no commission programmes yet/i)).toBeNull();
  });
});

describe('the commission programme catalogue — who may change what partners are paid', () => {
  it('offers no write control to an operator who may only read', async () => {
    permissions.current = ['ib.view'];
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    expect(screen.queryByRole('button', { name: /add programme/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
  });

  /*
   * Each control is gated on its OWN key rather than on a shared "can manage".
   * Holding edit is not holding delete: one changes a rate going forward, the
   * other removes the terms a partner is standing on.
   */
  it('offers edit to the edit key alone, without delete', async () => {
    permissions.current = ['ib.view', 'ib.programs.edit'];
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    await openRowActions(userEvent);

    expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add programme/i })).toBeNull();
  });

  it('offers the add control to the create key alone', async () => {
    permissions.current = ['ib.view', 'ib.programs.create'];
    renderWithProviders(<IbProgramsPage />);

    await screen.findByText('Gold');
    expect(screen.getByRole('button', { name: /add programme/i })).toBeInTheDocument();

    /*
     * NO ROW MENU AT ALL, not an empty one. `ib.programs.create` grants adding
     * a programme and nothing else, so every per-row action is withheld — and
     * `RowActions` renders no trigger when it would open onto nothing, which is
     * the right answer: a menu button that opens an empty list reads as broken
     * rather than as forbidden.
     */
    expect(screen.queryByRole('button', { name: /actions for gold/i })).toBeNull();
  });
});

describe('deleting a programme', () => {
  /*
   * The partner count belongs IN the question. "Delete Gold?" and "Delete Gold,
   * which 14 partners are paid by?" are different decisions — and the API
   * refuses the second, so asking with the number saves the operator finding
   * out by being refused.
   */
  it('names how many partners are paid by it before asking', async () => {
    getIbPrograms.mockResolvedValue([program({ partnerCount: 14 })]);
    renderWithProviders(<IbProgramsPage />);
    await screen.findByText('Gold');

    await openRowActions(userEvent);
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    const message = await answerConfirm(userEvent, 'cancel');

    expect(message).toContain('14');
    expect(message).toMatch(/moved to another programme first/i);
    expect(deleteIbProgram).not.toHaveBeenCalled();
  });

  it('deletes an unused programme once confirmed', async () => {
    renderWithProviders(<IbProgramsPage />);
    await screen.findByText('Gold');

    await openRowActions(userEvent);
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    await answerConfirm(userEvent, 'confirm');

    await waitFor(() => expect(deleteIbProgram).toHaveBeenCalledWith('p-gold'));
  });
});
