import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import LeveragesPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The leverage ladder screen.
 *
 * ## What this file exists to pin
 *
 * The ladder was a comma-separated text box on Settings → Trading. The whole
 * point of moving it to a table is a distinction that string could not make:
 * a rung can be WITHDRAWN — off the client's menu — while the accounts opened
 * on it keep trading. Every case here is about keeping that visible.
 *
 * The four permission keys are the other half. `leverages.*` is new, so no
 * existing role holds any of it: a screen that rendered its controls anyway
 * would offer actions the API refuses.
 */
const { getLeverages, createLeverage, updateLeverage, deleteLeverage } = vi.hoisted(() => ({
  getLeverages: vi.fn(),
  createLeverage: vi.fn(),
  updateLeverage: vi.fn(),
  deleteLeverage: vi.fn(),
}));

/*
 * BOTH the named export and the default — `src/lib/api/index.ts` exports `api`
 * as each, and pages use whichever the author reached for. Mocking only
 * `default` leaves the named one undefined, the page throws on first use, its
 * own catch swallows the TypeError, and the screen renders a generic "failed to
 * load" that reads as a broken query rather than a broken mock.
 */
vi.mock('@/lib/api', () => {
  const api = { admin: { getLeverages, createLeverage, updateLeverage, deleteLeverage } };
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

const rung = (over: Record<string, unknown> = {}) => ({
  ratio: 500,
  label: null,
  enabled: true,
  sortOrder: 30,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  getLeverages.mockResolvedValue([
    rung({ ratio: 50, sortOrder: 0 }),
    rung({ ratio: 100, sortOrder: 10, label: 'Standard' }),
    rung({ ratio: 500, sortOrder: 30, enabled: false }),
  ]);
});

describe('the ladder', () => {
  it('writes each rung the way a trading platform does', async () => {
    renderWithProviders(<LeveragesPage />);

    // `1:500`, not `500`. The stored value is the 500; the ratio is what a
    // client reads on the account-opening form.
    expect(await screen.findByText('1:500')).toBeInTheDocument();
    expect(screen.getByText('1:50')).toBeInTheDocument();
  });

  it('says WITHDRAWN rather than disabled', async () => {
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    /*
     * The distinction the CSV could not make, and the reason for the table.
     * "Disabled" reads as though something stopped working; the accounts opened
     * at 1:500 are still trading on it.
     */
    expect(screen.getByText(/withdrawn/i)).toBeInTheDocument();
    expect(screen.getAllByText(/offered/i).length).toBeGreaterThan(0);
  });

  it('shows the fallback label rather than an empty cell', async () => {
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    // No label is not a gap: the client is shown `1:<ratio>`, which is what
    // every screen did before labels existed.
    expect(screen.getAllByText(/shown as 1:/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });
});

describe('the four permission keys', () => {
  it('offers nothing to a viewer', async () => {
    permissions.current = ['leverages.view'];
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    // No Add button, and no row menu — every control here is a write.
    expect(screen.queryByRole('button', { name: /add leverage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });

  it('offers Add only with leverages.create', async () => {
    permissions.current = ['leverages.view', 'leverages.create'];
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    expect(screen.getByRole('button', { name: /add leverage/i })).toBeInTheDocument();
  });

  it('lets an editor withdraw a rung but not delete one', async () => {
    /*
     * The split that matters. Withdrawing is an EDIT — it takes the rung off
     * the menu and leaves accounts trading — so a role trusted to do that is
     * not thereby trusted to remove the row.
     */
    permissions.current = ['leverages.view', 'leverages.edit'];
    const user = userEvent.setup();
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    await user.click(screen.getAllByRole('button', { name: /actions for/i })[0]!);

    /*
     * Scoped to the MENU. A bare `findByText(/withdraw/i)` also matches the
     * "Withdrawn" status badge in the table, so it passes whether or not the
     * menu item exists — which is the opposite of what this asserts.
     */
    const menu = within(await screen.findByRole('menu'));
    expect(menu.getByRole('menuitem', { name: /withdraw/i })).toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument();
  });
});

describe('withdrawing', () => {
  it('toggles enabled rather than deleting', async () => {
    updateLeverage.mockResolvedValue(rung({ ratio: 50, enabled: false }));
    const user = userEvent.setup();
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:50');

    await user.click(screen.getAllByRole('button', { name: /actions for 1:50/i })[0]!);
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: /withdraw/i }),
    );

    // A PATCH, never a DELETE — the accounts on this rung are untouched.
    expect(updateLeverage).toHaveBeenCalledWith(50, { enabled: false });
    expect(deleteLeverage).not.toHaveBeenCalled();
  });

  it('offers a withdrawn rung again', async () => {
    updateLeverage.mockResolvedValue(rung({ ratio: 500, enabled: true }));
    const user = userEvent.setup();
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    await user.click(screen.getAllByRole('button', { name: /actions for 1:500/i })[0]!);
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: /offer again/i }),
    );

    expect(updateLeverage).toHaveBeenCalledWith(500, { enabled: true });
  });
});

describe('the form', () => {
  it('fixes the ratio when editing an existing rung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:100');

    await user.click(screen.getAllByRole('button', { name: /actions for 1:100/i })[0]!);
    await user.click(await screen.findByText(/^edit$/i));

    /*
     * DISABLED, not absent. The ratio is the identity — renumbering it would
     * leave accounts opened at the old value pointing at a leverage the ladder
     * no longer explains — but an operator still needs to see WHICH rung they
     * are editing.
     */
    const ratio = await screen.findByLabelText(/^leverage$/i);
    expect(ratio).toBeDisabled();
    expect(ratio).toHaveValue(100);
  });

  it('keeps the API’s own refusal on screen', async () => {
    createLeverage.mockRejectedValue({
      response: { status: 409, data: { message: '500:1 is already on the ladder.' } },
    });
    const user = userEvent.setup();
    renderWithProviders(<LeveragesPage />);
    await screen.findByText('1:500');

    await user.click(screen.getByRole('button', { name: /add leverage/i }));
    await user.type(await screen.findByLabelText(/^leverage$/i), '500');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    /*
     * The refusals ARE the screen's value — "already on the ladder", "this is
     * the only leverage on offer" — and a generic message would throw away the
     * only explanation the operator gets. The modal stays open with what they
     * typed still in it.
     */
    expect(await screen.findByText(/already on the ladder/i)).toBeInTheDocument();
  });
});
