import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { IbProgram } from '@/lib/api/admin';
import { IbProgramFormModal } from './ib-program-form-modal';

/**
 * The form that sets what partners are paid.
 *
 * ## The three properties, and why each has a wrong version that looks right
 *
 *  1. **The running total counts every rate, not the visible ones.** The API's
 *     `assertShareFits` and the database CHECK both add all three
 *     unconditionally, and a hidden field's value is still sent and still
 *     stored. A form that summed only the paying legs showed "85% kept" and was
 *     then refused for paying out 105% — the form disagreeing with the server
 *     about the only number on the screen.
 *
 *  2. **The arithmetic is decimal.** The sibling ladder screen shipped a float
 *     total that rendered a correct configuration as 100.00000000000001 and
 *     painted it red. The rates below are chosen to reproduce exactly that:
 *     any tidier set passes either way, which is how the bug survived.
 *
 *  3. **Rates leave as STRINGS.** They multiply money (§6.1), and a round trip
 *     through a number is the one mistake that produces a wrong figure
 *     convincingly.
 */
const onSubmit = vi.fn();
const onClose = vi.fn();

function program(over: Partial<IbProgram> = {}): IbProgram {
  return {
    id: 'p-gold',
    name: 'Gold',
    sortOrder: 0,
    mode: 'commission_only',
    level1Rate: '60.0000',
    level2Rate: '40.0000',
    rebateRate: '0.0000',
    enabled: true,
    partnerCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function renderForm(over: Partial<IbProgram> = {}) {
  return renderWithProviders(
    <IbProgramFormModal
      open
      program={program(over)}
      saving={false}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the running total on a commission programme', () => {
  it('says what the broker keeps, which is the number being decided', async () => {
    renderForm({ level1Rate: '60.0000', level2Rate: '10.0000', rebateRate: '0.0000' });

    expect(await screen.findByText(/pay out 70% .* leaving 30%/i)).toBeInTheDocument();
  });

  /*
   * ⚠️ THE REGRESSION THIS FILE EXISTS FOR.
   *
   * `commission_only` hides the rebate field, and the rebate rate it carries is
   * still sent, still stored, and one mode change from being paid. Counting
   * only the visible legs reports 60% allocated on a programme the server will
   * refuse at 110%.
   */
  it('counts a rate this mode does not pay, because the server does', async () => {
    renderForm({
      mode: 'commission_only',
      level1Rate: '60.0000',
      level2Rate: '0.0000',
      rebateRate: '50.0000',
    });

    // The field is not on screen…
    expect(screen.queryByLabelText(/back to the client/i)).toBeNull();
    // …and its 50% is in the total anyway, which is what the API will see.
    expect(await screen.findByText(/pay out 110%/i)).toBeInTheDocument();
    expect(screen.getByText(/more than the broker earns/i)).toBeInTheDocument();
  });

  /*
   * These three rates sum to exactly 100 in decimal and to 100.00000000000001
   * as floats — the float form was rendered verbatim on the ladder screen AND
   * flagged red, telling an operator their correct configuration had given away
   * more than the broker earned.
   */
  it('totals in decimal, not floating point', async () => {
    renderForm({
      mode: 'hybrid',
      level1Rate: '27.6000',
      level2Rate: '39.4286',
      rebateRate: '32.9714',
    });

    expect(await screen.findByText(/pay out 100% .* leaving 0%/i)).toBeInTheDocument();
    expect(screen.queryByText(/100\.00000000000001/)).toBeNull();
    // And it is not the refusal banner: 100% is allocated, not over-allocated.
    expect(screen.queryByText(/more than the broker earns/i)).toBeNull();
  });

  it('follows the rate as it is typed', async () => {
    renderForm({ level1Rate: '10.0000', level2Rate: '0.0000', rebateRate: '0.0000' });

    const level1 = await screen.findByLabelText(/from their own clients/i);
    await userEvent.clear(level1);
    await userEvent.type(level1, '25.5');

    expect(await screen.findByText(/pay out 25\.5% .* leaving 74\.5%/i)).toBeInTheDocument();
  });
});

describe('what the form sends', () => {
  it('sends rates as decimal strings, with their scale intact', async () => {
    renderForm({ level1Rate: '60.0000', level2Rate: '40.0000' });

    await userEvent.click(await screen.findByRole('button', { name: /save programme/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        // `60`, not `60.0000`, is what a number round trip leaves behind.
        level1Rate: '60.0000',
        level2Rate: '40.0000',
      }),
    );
  });

  it('sends the rate of a leg this mode hides, rather than zeroing it', async () => {
    /*
     * The operator typed it under another mode and will find it again when they
     * switch back. Zeroing a hidden field on save would silently discard terms
     * somebody configured, and the discard is invisible until a rebate they set
     * pays nothing.
     */
    renderForm({ mode: 'commission_only', rebateRate: '15.0000' });

    await userEvent.click(await screen.findByRole('button', { name: /save programme/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rebateRate: '15.0000' }));
  });

  /*
   * NOT disabled while over-allocated, deliberately: the API is the authority
   * and its refusal names the numbers, where a button that will not press
   * explains nothing. The banner above it already says what is wrong.
   */
  it('still lets an over-allocated programme be submitted, so the API can refuse it', async () => {
    renderForm({ mode: 'hybrid', level1Rate: '80.0000', level2Rate: '40.0000' });

    const save = await screen.findByRole('button', { name: /save programme/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('the mode', () => {
  it('hides both partner legs on a rebate-only programme', async () => {
    renderForm({ mode: 'rebate_only' });

    expect(await screen.findByLabelText(/back to the client/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/from their own clients/i)).toBeNull();
    expect(screen.queryByLabelText(/sub-partners/i)).toBeNull();
  });

  it('reveals the client leg when the mode starts paying it', async () => {
    renderForm({ mode: 'commission_only' });

    expect(screen.queryByLabelText(/back to the client/i)).toBeNull();
    await userEvent.selectOptions(
      await screen.findByRole('combobox'),
      screen.getByRole('option', { name: /partner and client/i }),
    );

    expect(await screen.findByLabelText(/back to the client/i)).toBeInTheDocument();
  });
});

/**
 * ── WHICH PROGRAMME A NEWLY APPROVED PARTNER LANDS ON ─────────────────────
 *
 * `IbStore.defaultProgramId()` takes the ENABLED programme with the lowest
 * order, ties broken by name. The API has always supported setting that order;
 * this form had no control for it, so it was assigned as max+1 at creation and
 * could never be changed. An operator could build Gold, Silver and Platinum and
 * have no way to say which one new partners start on — it was whichever they
 * created first.
 *
 * That is a live commercial control, so the cases below are about the two ways
 * it can go wrong quietly: a value that does not reach the API, and a typo that
 * reaches it as 0 — which is the LOWEST order, and would silently make this
 * programme the one every new partner is paid on.
 */
describe('the order that decides the default programme', () => {
  it('sends the order the operator set', async () => {
    const user = userEvent.setup();
    renderForm({ sortOrder: 5 });

    const field = screen.getByLabelText(/order/i);
    await user.clear(field);
    await user.type(field, '1');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 1 }));
  });

  it('seeds from the stored order, so editing a name cannot move the programme', async () => {
    const user = userEvent.setup();
    renderForm({ sortOrder: 7 });

    expect(screen.getByLabelText(/order/i)).toHaveValue(7);

    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 7 }));
  });

  it('treats a blank box as APPEND rather than as zero', async () => {
    /*
     * The distinction is the whole risk. Zero is the lowest order, so "blank
     * means 0" would make every programme saved with an empty box the one new
     * partners are paid on. Undefined lets the API append, which is what it
     * already does for a create.
     */
    const user = userEvent.setup();
    renderForm({ sortOrder: 3 });

    await user.clear(screen.getByLabelText(/order/i));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: undefined }));
  });

  it('refuses to submit an out-of-range order rather than coercing it', async () => {
    /*
     * THE ONE THAT MATTERS, and the reason `Number(x) || 0` is banned here.
     *
     * Zero is the LOWEST order, so a coerced typo would quietly make this
     * programme the terms every newly approved partner is paid on — a
     * commercial change nobody asked for, from a fat finger, with the form
     * reporting success.
     *
     * The input's own `max` catches it first: the form does not submit at all,
     * so nothing is sent and nothing is silently zeroed. `parseSortOrder` is
     * the backstop for the day somebody removes that attribute, which is why it
     * returns undefined rather than 0 and why it is unreachable from here.
     */
    const user = userEvent.setup();
    renderForm({ sortOrder: 4 });

    const field = screen.getByLabelText(/order/i);
    await user.clear(field);
    await user.type(field, '9999');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains that the lowest order is what new partners are put on', () => {
    /*
     * Without this sentence the field reads as cosmetic list-sorting. An
     * operator reordering "for tidiness" would be changing what every partner
     * approved tomorrow gets paid, and nothing else on the screen says so.
     */
    renderForm();

    expect(screen.getByText(/newly approved partner/i)).toBeInTheDocument();
    expect(screen.getByText(/lowest-ordered programme that is enabled/i)).toBeInTheDocument();
  });
});
