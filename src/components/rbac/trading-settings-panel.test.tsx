import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import {
  TradingSettingsPanel,
  accrualDateOf,
  accrualModeOf,
  accrualStartValue,
  parseHours,
} from './trading-settings-panel';

/**
 * The Trading tab, and in particular the SETTLEMENT WINDOW that just arrived on
 * it.
 *
 * That number is the one rule between a commission being earned and being
 * spendable. It used to live only in `IB_COMMISSION_HOLD_HOURS`, which meant
 * changing it took a deploy and nobody running the platform could see what it
 * was — while every other control on this form had been operator-visible for
 * months.
 *
 * The case that matters is the last one. Zero is a legal, deliberate value
 * ("pay as soon as it is calculated"), so the form cannot treat an unparseable
 * box as zero the way it does for an account cap — there, 0 means "no new ones"
 * and is a state somebody may want. Here it would switch the window OFF, and the
 * save would report success.
 */
const { getTradingSettings, updateTradingSettings } = vi.hoisted(() => ({
  getTradingSettings: vi.fn(),
  updateTradingSettings: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: { ...actual.adminApi, getTradingSettings, updateTradingSettings },
  };
});

const SAVED = {
  maxLiveAccounts: 5,
  maxDemoAccounts: 5,
  maxDemoDeposit: '1000000.00000000',
  ibMaxRevenueSharePct: '50.00',
  ibCommissionHoldHours: 24,
  /*
   * The basis the platform actually ships on. Present in the fixture rather
   * than omitted, because the select is CONTROLLED — an absent value would
   * make it uncontrolled and every assertion below would be reading a widget
   * React is not managing.
   */
  ibRevenueBasis: 'commission_swap' as const,
  /* Undecided, which is the state a platform that has not chosen is in. */
  ibAccrualStart: null,
  updatedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getTradingSettings.mockResolvedValue({ ...SAVED });
  updateTradingSettings.mockImplementation((body: Record<string, unknown>) =>
    Promise.resolve({ ...SAVED, ...body, updatedAt: '2026-08-24T00:00:00.000Z' }),
  );
});

async function windowBox() {
  return await screen.findByLabelText(/settlement window/i);
}

describe('the settlement window on the trading form', () => {
  it('shows the window the platform is actually holding to', async () => {
    getTradingSettings.mockResolvedValue({ ...SAVED, ibCommissionHoldHours: 72 });
    renderWithProviders(<TradingSettingsPanel canManage />);

    expect(await windowBox()).toHaveValue(72);
  });

  it('says what zero means, so it is chosen rather than stumbled into', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    await windowBox();
    expect(screen.getByText(/0 pays as soon as it is calculated/i)).toBeInTheDocument();
  });

  it('saves a changed window', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await windowBox();
    await userEvent.clear(box);
    await userEvent.type(box, '48');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibCommissionHoldHours: 48 }),
      ),
    );
  });

  it('sends zero when an operator genuinely chooses it', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await windowBox();
    await userEvent.clear(box);
    await userEvent.type(box, '0');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibCommissionHoldHours: 0 }),
      ),
    );
  });

  it('offers no editing to an operator who may only read the tab', async () => {
    renderWithProviders(<TradingSettingsPanel canManage={false} />);

    expect(await windowBox()).toBeDisabled();
  });
});

/**
 * ⚠️ THE ONE THAT MATTERS, and it is unit-level for a reason.
 *
 * `required` on the input stops an EMPTIED box reaching submit, which is the
 * common case and is handled. This function is what stands behind it: anything
 * the browser lets through that is not a whole number in range must fall back
 * to the value already stored, never to zero.
 *
 * The sibling `parseCount` used by the account caps answers 0 for anything
 * unparseable, and that is right there — 0 means “no new ones of this kind” and
 * is a state somebody may want. Reusing it here would turn the settlement
 * window OFF, making every pending commission payable on the next run, with a
 * success toast and no other trace. Falling back to the saved value makes the
 * worst case “nothing changed”.
 *
 * Exported and tested directly the same way `parsePort` is on the Email tab.
 */
describe('parseHours', () => {
  it('takes a whole number of hours', () => {
    expect(parseHours('48', 24)).toBe(48);
    expect(parseHours('  72 ', 24)).toBe(72);
  });

  it('takes zero, which is a deliberate choice', () => {
    expect(parseHours('0', 24)).toBe(0);
  });

  it('falls back to the SAVED value rather than to zero', () => {
    for (const bad of ['', '   ', 'abc', '12.5h', '-1', 'NaN']) {
      expect(parseHours(bad, 24)).toBe(24);
    }
  });

  it('refuses a value past the typo guard rather than storing it', () => {
    // A mistyped 24000 would hold every partner's commission for three years
    // while every component reported success — which looks exactly like the
    // engine having stopped.
    expect(parseHours('24000', 24)).toBe(24);
    expect(parseHours('8760', 24)).toBe(8760);
  });
});

/**
 * WHAT a partner is paid on — FR-IB-16.
 *
 * The FSD calls commission spread-based and the engine computes on charges,
 * because MT5 reports no per-deal spread revenue to compute from. That argument
 * holds; what did not hold was that the one number deciding what every partner
 * earns lived as a constant in the API's source, reachable only by deploy and
 * recorded nowhere.
 *
 * So these cases are about a decision having an owner. The first two are the
 * compatibility guarantee — nothing re-prices itself — and the last is the
 * warning that stops an operator doing it in the wrong order.
 */
describe('what partners are paid on', () => {
  async function basisBox() {
    return await screen.findByLabelText(/partners are paid on/i);
  }

  it('opens on what the platform is actually paying', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    expect(await basisBox()).toHaveValue('commission_swap');
  });

  it('offers the default FIRST, so the safe option is the one met first', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    const options = within(await basisBox()).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'commission_swap',
      'spread',
      'commission_swap_spread',
    ]);
  });

  it('leaves the basis alone when an unrelated field is saved', async () => {
    /*
     * The guarantee that matters most on this form. Every other control here is
     * a term an operator adjusts casually; this one re-prices the book. Adjusting
     * the demo cap and saving must not carry a repricing along with it.
     */
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await windowBox();
    await user.clear(box);
    await user.type(box, '48');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibCommissionHoldHours: 48, ibRevenueBasis: 'commission_swap' }),
      ),
    );
  });

  it('sends the chosen basis', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    await user.selectOptions(await basisBox(), 'commission_swap_spread');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibRevenueBasis: 'commission_swap_spread' }),
      ),
    );
  });

  it('warns about the ORDER only when the choice would read the markups', async () => {
    /*
     * The irreversible half, and the reason the warning is conditional rather
     * than permanent: under the default the markups are never read, so the
     * warning would be noise — and a warning that is always on screen is one
     * nobody reads on the day it matters.
     */
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await basisBox();
    expect(screen.queryByText(/set the spread markup on every product/i)).not.toBeInTheDocument();

    await user.selectOptions(box, 'spread');
    expect(screen.getByText(/set the spread markup on every product/i)).toBeInTheDocument();
    expect(screen.getByText(/changing this back will not recover it/i)).toBeInTheDocument();

    await user.selectOptions(box, 'commission_swap');
    expect(screen.queryByText(/set the spread markup on every product/i)).not.toBeInTheDocument();
  });

  it('cannot be changed without the permission', async () => {
    renderWithProviders(<TradingSettingsPanel canManage={false} />);

    expect(await basisBox()).toBeDisabled();
  });
});

/**
 * The BACKLOG DECISION — which trades the engine pays for at all.
 *
 * It had an API, a column and an audit trail, and no control anywhere, so the
 * only way to make the platform's most irreversible decision was to write to
 * the database by hand. These cases cover the three things that can go wrong
 * now that a person can make it from a form: reading a stored value back
 * wrongly, turning a picked date into the wrong instant, and letting an
 * irreversible change through without anybody confirming it.
 */
describe('accrualModeOf / accrualDateOf', () => {
  it('reads an absent value as undecided', () => {
    expect(accrualModeOf(null)).toBe('unset');
    expect(accrualModeOf(undefined)).toBe('unset');
    expect(accrualModeOf('')).toBe('unset');
  });

  it('reads the two decided shapes', () => {
    expect(accrualModeOf('all')).toBe('all');
    expect(accrualModeOf('2026-08-01T00:00:00.000Z')).toBe('from');
  });

  it('takes the date part WITHOUT going through UTC', () => {
    /*
     * The bug this exists to prevent: `new Date(stored).toISOString().slice(0, 10)`
     * converts to UTC first, so a value saved as local midnight in an eastern
     * zone reads back as the previous day — the operator opens the form and
     * finds a decision one day earlier than the one they made.
     */
    expect(accrualDateOf('2026-08-01T00:00:00.000Z')).toBe('2026-08-01');
    expect(accrualDateOf('2026-08-01T23:30:00.000Z')).toBe('2026-08-01');
  });

  it('has no date to show for the other two shapes', () => {
    expect(accrualDateOf('all')).toBe('');
    expect(accrualDateOf(null)).toBe('');
  });
});

describe('accrualStartValue', () => {
  it('sends null for undecided, whatever is in the date box', () => {
    expect(accrualStartValue('unset', '2026-08-01')).toBeNull();
  });

  it('sends the literal for the whole backlog', () => {
    expect(accrualStartValue('all', '')).toBe('all');
  });

  it('turns a picked date into LOCAL midnight, not UTC midnight', () => {
    /*
     * An operator choosing 1 August means their own 1 August. UTC midnight is
     * the evening of 31 July in the Americas, so trades either side of the
     * boundary would be decided against a day nobody picked.
     */
    expect(accrualStartValue('from', '2026-08-01')).toBe(
      new Date('2026-08-01T00:00:00').toISOString(),
    );
  });

  it('is refused rather than sent malformed when no date was picked', () => {
    // The caller turns this into "choose the date", which beats the API's
    // pattern message naming a regex.
    expect(accrualStartValue('from', '')).toBeNull();
    expect(accrualStartValue('from', '2026-08')).toBeNull();
    expect(accrualStartValue('from', 'tomorrow')).toBeNull();
  });

  it('produces a value the API DTO would accept', () => {
    // The backend validates this exact pattern. Pinned here so a change to
    // either side fails in this repo rather than at runtime.
    const pattern = /^(all|\d{4}-\d{2}-\d{2}T[\d:.]+Z?)$/;
    expect(pattern.test(String(accrualStartValue('all', '')))).toBe(true);
    expect(pattern.test(String(accrualStartValue('from', '2026-08-01')))).toBe(true);
  });
});

describe('the backlog decision on the trading form', () => {
  async function modeBox() {
    return await screen.findByLabelText(/commission is paid from/i);
  }

  it('opens on undecided, and says what that state costs', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    expect(await modeBox()).toHaveValue('unset');
    expect(screen.getByText(/the engine stops rather than paying a backlog/i)).toBeInTheDocument();
  });

  it('shows a date box only when a date is what is being chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await modeBox();
    expect(screen.queryByLabelText(/paying from/i)).not.toBeInTheDocument();

    await user.selectOptions(box, 'from');
    expect(screen.getByLabelText(/paying from/i)).toBeInTheDocument();

    await user.selectOptions(box, 'all');
    expect(screen.queryByLabelText(/paying from/i)).not.toBeInTheDocument();
  });

  it('refuses "from a date" with no date, naming the field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    await user.selectOptions(await modeBox(), 'from');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose the date/i);
    expect(updateTradingSettings).not.toHaveBeenCalled();
  });

  it('will not pay the whole backlog without a confirmation', async () => {
    /*
     * The one that matters. "Pay everything" can credit months of commission in
     * a single run, and it does not come back by changing the field.
     */
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    await user.selectOptions(await modeBox(), 'all');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/pay commission on every trade on record/i)).toBeInTheDocument();
    expect(updateTradingSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /set the start date/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibAccrualStart: 'all' }),
      ),
    );
  });

  it('sends nothing when the confirmation is declined', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    await user.selectOptions(await modeBox(), 'all');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText(/pay commission on every trade on record/i);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(updateTradingSettings).not.toHaveBeenCalled());
  });

  it('does NOT confirm when an unrelated field is saved', async () => {
    /*
     * A confirmation on every save is one people learn to click through. It
     * fires when the decision changes, and not otherwise.
     */
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await windowBox();
    await user.clear(box);
    await user.type(box, '48');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibCommissionHoldHours: 48, ibAccrualStart: null }),
      ),
    );
    expect(screen.queryByText(/pay commission on every trade on record/i)).not.toBeInTheDocument();
  });

  it('shows a decision already made, and clears back to undecided freely', async () => {
    const user = userEvent.setup();
    getTradingSettings.mockResolvedValue({ ...SAVED, ibAccrualStart: 'all' });
    renderWithProviders(<TradingSettingsPanel canManage />);

    expect(await modeBox()).toHaveValue('all');

    /*
     * Back to undecided needs NO confirmation: it stops the engine rather than
     * paying anything, which is the safe direction. Gating the safe direction
     * as heavily as the dangerous one is how a gate stops being read.
     */
    await user.selectOptions(await modeBox(), 'unset');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibAccrualStart: null }),
      ),
    );
  });

  it('cannot be changed without the permission', async () => {
    renderWithProviders(<TradingSettingsPanel canManage={false} />);

    expect(await modeBox()).toBeDisabled();
  });
});
