import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { CommandPalette } from './command-palette';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The palette replaced a search box that could not search.
 *
 * The header carried an `input type="search"` with no state, no handler and no
 * results — typing in it did nothing at all. What matters about the replacement
 * is not that it looks better: it is that the two properties below hold, and
 * both are the kind that rot silently.
 *
 *  1. It lists what the SIDEBAR lists, filtered by the same `canAccess`. Two
 *     copies of "where can you go" is how `/commissions` ended up reachable
 *     only by typing its URL once already.
 *  2. It never offers a page the reader cannot open. The route guard denies it
 *     anyway, so listing it would navigate them into a refusal — and a palette
 *     that lists denied screens is enumerating what somebody was refused.
 */

const { useAdmin } = vi.hoisted(() => ({ useAdmin: vi.fn() }));
vi.mock('@/context/AdminAuthContext', () => ({ useAdmin }));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const MASTER = {
  id: 'a1',
  name: 'Master',
  email: 'master@test.local',
  role: 'master_admin',
  permissions: ALL_PERMISSIONS,
};

/** Holds `kyc.review` and nothing else — so Wallets and Tags are denied. */
const KYC_ONLY = {
  id: 'a2',
  name: 'Reviewer',
  email: 'reviewer@test.local',
  role: 'sub_admin',
  permissions: ['kyc.review'],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAdmin.mockReturnValue({ admin: MASTER, isLoading: false });
});

function open() {
  return renderWithProviders(<CommandPalette open onClose={vi.fn()} />);
}

describe('finding a page', () => {
  it('lists the console pages before anything is typed', async () => {
    open();

    // Not an empty panel waiting for input: the list IS the answer to "where
    // can I go", and an operator who does not know what to type still needs it.
    expect(await screen.findByRole('option', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('narrows on the label', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('textbox'), 'wallet');

    expect(screen.getByRole('option', { name: /wallets/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('narrows on the PATH, which is what somebody in a hurry types', async () => {
    const user = userEvent.setup();
    open();

    // `/approvals/deposits` — the label is "Deposits" and does not contain it.
    await user.type(screen.getByRole('textbox'), 'approvals/');

    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('treats a second word as NARROWING, not widening', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('textbox'), 'dep');
    const afterOne = screen.getAllByRole('option').length;

    /*
     * Every term must match something, so adding a word can only shrink the
     * list. An OR would grow it, which is the behaviour that makes a palette
     * feel broken after the second keystroke.
     */
    await user.type(screen.getByRole('textbox'), ' approvals');
    expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(afterOne);
  });

  it('says so when nothing matches, naming what was typed', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('textbox'), 'zzzznotapage');

    // An answer about THIS query, not a console that can find nothing.
    expect(screen.getByText(/zzzznotapage/)).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('permission scope', () => {
  it('never offers a page the reader cannot open', async () => {
    useAdmin.mockReturnValue({ admin: KYC_ONLY, isLoading: false });
    const user = userEvent.setup();
    open();

    /*
     * `/wallets` needs `wallets.view`, which this reviewer does not hold. The
     * route guard would refuse them, so listing it would send them into the
     * access-denied panel — and the list itself would be telling them a screen
     * exists that they were specifically denied.
     */
    await user.type(screen.getByRole('textbox'), 'wallet');
    expect(screen.queryByRole('option', { name: /wallets/i })).not.toBeInTheDocument();
  });

  it('still offers what that reader CAN open', async () => {
    useAdmin.mockReturnValue({ admin: KYC_ONLY, isLoading: false });
    open();

    // The filter is scope, not a blanket denial — a palette that showed a
    // sub-admin nothing would be as useless as one showing them everything.
    expect(await screen.findByRole('option', { name: /kyc/i })).toBeInTheDocument();
  });
});

describe('driving it from the keyboard', () => {
  it('opens the highlighted row on Enter', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('textbox'), 'wallet');
    await user.keyboard('{Enter}');

    expect(push).toHaveBeenCalledWith('/wallets');
  });

  it('carries the entry default filter into the route', async () => {
    const user = userEvent.setup();
    open();

    /*
     * `/kyc` opens on `submitted` while its badge counts more, so the nav entry
     * carries `status=needs_review`. The palette navigates to the same place
     * the sidebar does — otherwise one link lands on a list of 12 and the other
     * on a list of 17.
     *
     * "kyc" alone matches the review queue AND the builder, so this narrows by
     * the MAIN ITEM the queue lives under — the disambiguation an operator
     * would reach for too, and the reason the group is part of the haystack at
     * all. (The builder is under System.)
     */
    await user.type(screen.getByRole('textbox'), 'kyc clients');
    await user.keyboard('{Enter}');

    expect(push).toHaveBeenCalledWith(expect.stringContaining('status=needs_review'));
  });

  it('moves the highlight with the arrow keys', async () => {
    const user = userEvent.setup();
    open();

    const first = screen.getAllByRole('option')[0];
    expect(first).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');

    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('does nothing on Enter when the query matches nothing', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('textbox'), 'zzzznotapage');
    await user.keyboard('{Enter}');

    // Never navigate to a row that is not there: the index is clamped against a
    // list that changes on the same keystroke.
    expect(push).not.toHaveBeenCalled();
  });
});

describe('closed', () => {
  it('renders nothing at all', () => {
    renderWithProviders(<CommandPalette open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
