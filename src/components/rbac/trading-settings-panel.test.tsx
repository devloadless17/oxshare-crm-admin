import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { TradingSettingsPanel } from './trading-settings-panel';

/**
 * The Trading tab — the terms a CLIENT may open an account on, and nothing else.
 *
 * ## What this file used to be about, and why almost all of it went
 *
 * Four IB controls lived on this form and every one of them changed what
 * partners are paid: "Maximum paid to partners (%)", the settlement window,
 * "Commission is paid from" / "Paying from", and "Partners are paid on". Most of
 * the cases here covered them, and they were the interesting ones — a window
 * that must never parse a typo into zero, a backlog decision gated behind a
 * confirmation because it marks trades decided for ever.
 *
 * They went in 0104. Commission is configured on the Commission Programmes page
 * and nowhere else: a second screen that also decides partner pay is a second
 * place for two answers to disagree, with nothing telling an operator which one
 * the money used — the same fault removed from the catalogue itself when
 * `ib_levels` sat beside `ib_programs`.
 *
 * The settlement window and the backlog decision are `IB_COMMISSION_HOLD_HOURS`
 * and `IB_ACCRUAL_START` again. The aged-backlog guard is unchanged and is
 * covered where it now lives, against a real database.
 *
 * ## What is left is still worth pinning
 *
 * Three numbers that decide what a client is offered, and one of them —
 * `maxLiveAccounts` — has a zero that MEANS something ("stop opening new live
 * accounts"). That is why the form parses rather than coercing: `Number(x) || 5`
 * would turn a deliberate 0 into five, and the save would report success.
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
  /*
   * The commission cadence (0113), REQUIRED here rather than optional: the
   * panel seeds a number box from it, and an absent value renders the string
   * 'undefined', leaves the form permanently dirty, and blocks every save with
   * native validation. That failure surfaces three tests away as "the request
   * was never made".
   *
   * 3600 so it reads back as "1 hour" — `splitInterval` picks the largest unit
   * that divides exactly.
   */
  ibCommissionIntervalSeconds: 3600,
  /*
   * The total payout ceiling (0106), and REQUIRED here for a sharper version of
   * the reason above: the panel seeds this box through `trimAmount`, which
   * calls `.includes` on it. An absent value is not a blank field, it is a
   * TypeError during render — the whole form disappears and every assertion in
   * this file fails as "unable to find a label", naming nothing that is wrong.
   */
  ibMaxTotalPayoutPct: '100.0000',
  updatedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getTradingSettings.mockResolvedValue({ ...SAVED });
  updateTradingSettings.mockImplementation((body: Record<string, unknown>) =>
    Promise.resolve({ ...SAVED, ...body, updatedAt: '2026-08-24T00:00:00.000Z' }),
  );
});

describe('the account terms on the trading form', () => {
  it('shows the terms the platform is actually offering', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    expect(await screen.findByLabelText(/live accounts per client/i)).toHaveValue(5);
    // Trailing zeros trimmed: the column is numeric(28,8) and
    // '1000000.00000000' in a text box is a number nobody typed.
    expect(screen.getByLabelText(/largest demo starting balance/i)).toHaveValue('1000000');
  });

  it('saves a changed cap', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await screen.findByLabelText(/live accounts per client/i);
    await user.clear(box);
    await user.type(box, '3');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ maxLiveAccounts: 3 }),
      ),
    );
  });

  /*
   * ⚠️ ZERO IS A DECISION HERE — "stop opening new live accounts" — so it must
   * survive the trip. `Number(x) || 5` is the idiom that would quietly turn it
   * back into five while the save reported success.
   */
  it('sends zero when an operator genuinely chooses it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await screen.findByLabelText(/live accounts per client/i);
    await user.clear(box);
    await user.type(box, '0');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ maxLiveAccounts: 0 }),
      ),
    );
  });

  /*
   * The demo ceiling is MONEY and stays a string end to end (§6.1). A number
   * round trip is what turns a large deposit ceiling into a value that is wrong
   * before formatting has even started.
   */
  it('sends the demo ceiling as a string, never a number', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await screen.findByLabelText(/largest demo starting balance/i);
    await user.clear(box);
    await user.type(box, '250000.50');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(updateTradingSettings).toHaveBeenCalled());
    const [body] = updateTradingSettings.mock.calls[0] as [{ maxDemoDeposit: unknown }];
    expect(body.maxDemoDeposit).toBe('250000.50');
    expect(typeof body.maxDemoDeposit).toBe('string');
  });

  /*
   * The cadence is the one IB number left on this form, and it passes the test
   * the level ceiling it replaced did not: it decides WHEN partners are paid,
   * never HOW MUCH. Amounts belong to the IB Levels page alone.
   */
  it('shows the interval the platform is actually running', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    /* 3600 seconds read back as 1 HOUR, not 60 minutes — an operator should
       see the value they typed rather than a unit the form chose. */
    expect(await screen.findByLabelText(/pay commission every/i)).toHaveValue(1);
  });

  it('converts the chosen unit to seconds on save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await screen.findByLabelText(/pay commission every/i);
    await user.clear(box);
    await user.type(box, '5');
    await user.selectOptions(screen.getByLabelText(/unit/i), 'minutes');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateTradingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ ibCommissionIntervalSeconds: 300 }),
      ),
    );
  });

  /*
   * ⚠️ A TYPO MUST NOT SHORTEN THIS, and the direction is the whole point.
   * Falling back to the 60-second floor would make a mistyped value remove the
   * review window — the change nobody would choose deliberately. The SAVED
   * value is the only answer that changes nothing.
   */
  it('falls back to the saved interval rather than coercing a bad one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TradingSettingsPanel canManage />);

    const box = await screen.findByLabelText(/pay commission every/i);
    await user.clear(box);
    await user.click(screen.getByRole('button', { name: /save/i }));

    /* Empty is not zero and not the floor: the form refuses to submit at all. */
    expect(updateTradingSettings).not.toHaveBeenCalled();
  });

  /*
   * Client-side gating is UX rather than security — the API enforces the same
   * permission — but a form that LOOKS editable to somebody who cannot save is
   * a refusal discovered after the typing.
   */
  it('offers no editing to an operator who may only read the tab', async () => {
    renderWithProviders(<TradingSettingsPanel canManage={false} />);

    expect(await screen.findByLabelText(/live accounts per client/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  /*
   * The IB block is GONE from this screen, and this is the assertion that keeps
   * it gone. Re-adding any of these controls puts a second place to configure
   * partner pay back on a page about client account terms.
   */
  it('offers no commission controls at all', async () => {
    renderWithProviders(<TradingSettingsPanel canManage />);

    await screen.findByLabelText(/live accounts per client/i);

    expect(screen.queryByLabelText(/maximum paid to partners/i)).toBeNull();
    expect(screen.queryByLabelText(/settlement window/i)).toBeNull();
    expect(screen.queryByLabelText(/partners are paid on/i)).toBeNull();
    expect(screen.queryByLabelText(/commission is paid from/i)).toBeNull();
    expect(screen.queryByLabelText(/paying from/i)).toBeNull();
  });
});
