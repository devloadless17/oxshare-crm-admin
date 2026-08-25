import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { TradingSettingsPanel, parseHours } from './trading-settings-panel';

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
