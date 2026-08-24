import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
