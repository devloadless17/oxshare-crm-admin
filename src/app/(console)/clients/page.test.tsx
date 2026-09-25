import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { answerConfirm, expectNoConfirm } from '@/test/confirm';
import ClientsPage from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * The client directory, and the one destructive action on it.
 *
 * Suspending logs a client out immediately and locks them out, so the asymmetry in
 * this screen is deliberate and worth pinning: suspending asks for confirmation,
 * reactivating does not. Only the direction that takes access away needs a guard.
 *
 * Also pins that suspension is gated on clients.suspend. Client-side gating is UX
 * rather than security — PermissionsGuard answers 403 independently — but a missing
 * gate implies the permission model is wider than it is.
 */

const { getClients, setClientStatus, getTags, downloadExport } = vi.hoisted(() => ({
  getClients: vi.fn(),
  setClientStatus: vi.fn(),
  getTags: vi.fn(),
  downloadExport: vi.fn(),
}));

/* The export button's download — asserted on, never performed. */
vi.mock('@/lib/api/export', () => ({ downloadExport }));

// Both exports, per the convention in CLAUDE.md — lib/api/index.ts publishes `api`
// as a named export and as the default, and which one a page uses varies.
vi.mock('@/lib/api', () => {
  const api = { admin: { getClients, setClientStatus, getTags } };
  return { api, default: api };
});

/*
 * The filters live in the URL now, so the page reads `useSearchParams` and
 * writes through `router.replace` — which means both have to be mocked, and
 * `replace` is what the sorting assertions below inspect.
 */
const searchParams = { current: new URLSearchParams() };

/*
 * `replace` FEEDS BACK into `useSearchParams`, because the real router does.
 *
 * A spy that only records would leave every URL-controlled input frozen at its
 * initial value: typing "alpha" into the search box would fire five changes
 * that each read back an empty string, so the page would send `q=a`. The test
 * would then be asserting against a screen that behaves nothing like the real
 * one — and would keep passing if the wiring broke.
 */
/*
 * …and the write-back has to RE-RENDER, not merely be stored.
 *
 * The filter inputs are controlled (`value={values.q}` in client-filters.tsx),
 * so their displayed text comes from the URL rather than from local state. A
 * mock that only mutates `searchParams.current` updates the value the next
 * render would read — but nothing schedules that render, so the box stays
 * frozen at its first character and typing "alpha" sends `q=a`.
 *
 * `useSyncExternalStore` makes the mock what the real router is: a store that
 * components subscribe to. Each `replace` bumps the snapshot and every
 * subscriber re-renders, so the input advances a character at a time exactly as
 * it does in the browser.
 */
const listeners = new Set<() => void>();

/**
 * How long the mock router takes to APPLY a `replace`.
 *
 * `0` means synchronous, which is what most tests here want and what the mock
 * has always done. The real `router.replace` is NOT synchronous — it schedules
 * a navigation and `useSearchParams()` keeps returning the old value until it
 * lands — and that gap is the entire mechanism behind the lost-characters bug
 * the search box had. A test that only ever runs the synchronous mock cannot
 * tell a URL-controlled input from a locally-controlled one, because with zero
 * latency there is no window in which the stale value can be re-applied.
 *
 * Set it per-test (see "typing survives a slow router") to get the real thing.
 */
const routerLatencyMs = { current: 0 };

const applyUrl = (url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
  // React requires a CHANGED snapshot to re-render; the URLSearchParams
  // identity alone is not enough because getSnapshot must be cheap and stable.
  snapshot += 1;
  for (const notify of listeners) notify();
};

const replace = vi.fn((url: string) => {
  if (routerLatencyMs.current === 0) {
    applyUrl(url);
    return;
  }
  setTimeout(() => applyUrl(url), routerLatencyMs.current);
});

let snapshot = 0;

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () => {
      useSyncExternalStore(
        (onChange: () => void) => {
          listeners.add(onChange);
          return () => listeners.delete(onChange);
        },
        () => snapshot,
        () => snapshot,
      );
      return searchParams.current;
    },
    usePathname: () => '/clients',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
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

function client(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    portalId: 1000245,
    email: 'client@oxshare.com',
    firstName: 'John',
    lastName: 'Doe',
    type: 'individual',
    // The ACCOUNT state — whether this person may sign in. Distinct from the
    // two verification fields below, which is the whole point of the change
    // these fixtures cover.
    status: 'active',
    // Both are non-optional on every real row: `kycStatus` is TOTAL (a client
    // who never began reads 'not_started', never null), so a fixture omitting
    // them would describe a response the API does not send.
    emailVerified: true,
    kycStatus: 'approved',
    verificationLevel: 1,
    createdAt: '2026-08-03T14:51:46.899Z',
    ...over,
  };
}

function page(rows: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  return {
    items: rows,
    total: rows.length,
    page: 1,
    limit: 20,
    nextCursor: null,
    // Present on every real response. An absent `maskedFields` would make the
    // fixture describe a shape the API never sends.
    maskedFields: [] as string[],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  routerLatencyMs.current = 0;
  searchParams.current = new URLSearchParams();
  // Bumped rather than zeroed: a stale subscriber from the previous test would
  // see an unchanged snapshot and skip the render that clears its inputs.
  snapshot += 1;
  listeners.clear();
  getClients.mockResolvedValue(page([client()]));
  getTags.mockResolvedValue([]);
  setClientStatus.mockResolvedValue(client({ status: 'suspended' }));
});

describe('client directory — listing', () => {
  it('lists clients returned by the API', async () => {
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('client@oxshare.com')).toBeInTheDocument();
  });

  it('shows the Portal ID — whole — and never the uuid, not even a fragment of it', async () => {
    // The owner's rule (24 Sep 2026): a client is identified by Portal ID
    // alone, as if the uuid had never existed. It still addresses the row, so
    // it must be in the payload and nowhere on the screen.
    const uuid = '0b7d3c9e-4f21-48a6-9c05-2d8e11aa3f47';
    getClients.mockResolvedValue(page([client({ id: uuid, portalId: 26184 })]));
    const { container } = renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('26184')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('0b7d3c9e');
    // The row still LINKS by Portal ID — the address bar is on screen too.
    expect(container.querySelector('a[href="/clients/26184"]')).not.toBeNull();
  });

  it('does NOT offer a sort on the Portal ID column — the API has no such key', async () => {
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    const header = screen.getByRole('columnheader', { name: /^portal id$/i });
    expect(within(header).queryByRole('button')).toBeNull();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    getClients.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

/**
 * Open a row's three-dot menu and pick an item.
 *
 * Suspend used to be a button sitting in the Actions cell. It is now behind the
 * shared `RowActions` trigger, which is named for its row — so this takes the
 * same two steps the operator now does.
 */
async function chooseRowAction(user: ReturnType<typeof userEvent.setup>, item: RegExp) {
  await user.click(await screen.findByRole('button', { name: /actions for/i }));
  await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: item }));
}

describe('client directory — suspension', () => {
  it('asks before suspending, and does nothing if declined', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await chooseRowAction(user, /^suspend$/i);
    await answerConfirm(user, 'cancel');

    // Suspension logs the client out immediately; a mis-click must not reach the API.
    expect(setClientStatus).not.toHaveBeenCalled();
  });

  it('suspends once confirmed, sending status: suspended', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await chooseRowAction(user, /^suspend$/i);
    await answerConfirm(user, 'confirm');

    await waitFor(() => expect(setClientStatus).toHaveBeenCalledTimes(1));
    // `(id, status)`, not an axios `(url, body)` pair — the call moved behind
    // `api.admin.setClientStatus` so the page no longer builds its own URLs.
    expect(setClientStatus).toHaveBeenCalledWith('c-1', 'suspended');
  });

  it('warns which client is being suspended, by email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await chooseRowAction(user, /^suspend$/i);
    const asked = await answerConfirm(user, 'cancel');

    // Acting on the wrong row is the mistake this text exists to prevent. The
    // email is in the dialog's TITLE, and the body states the consequence —
    // both are on screen at once, which is more than window.confirm's single
    // string could carry.
    expect(asked).toContain('client@oxshare.com');
    expect(asked).toMatch(/logged out immediately/i);
  });

  it('reactivates WITHOUT a confirmation, since it restores access', async () => {
    getClients.mockResolvedValue(page([client({ status: 'suspended' })]));
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await chooseRowAction(user, /reactivate/i);

    // Only the destructive direction is guarded. Asking here would be friction
    // with nothing to protect.
    await waitFor(() => expect(setClientStatus).toHaveBeenCalledTimes(1));
    expect(setClientStatus).toHaveBeenCalledWith('c-1', 'active');
    expectNoConfirm();
  });
});

describe('client directory — permission gating', () => {
  it('shows no suspend control without clients.suspend', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientsPage />);

    await screen.findByText('client@oxshare.com');
    /*
     * The whole Actions column is gone, so the assertion is against the row
     * TRIGGER rather than against a "Suspend" button.
     *
     * Querying for the button by name would now pass whatever the permissions
     * were — no such button exists on any code path since suspend moved into
     * the menu — which is a test that has stopped watching the thing it names.
     */
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
  });

  it('still lists clients read-only without clients.suspend', async () => {
    permissions.current = ['clients.view'];
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('client@oxshare.com')).toBeInTheDocument();
  });
});

/**
 * THE GAP THIS FILE HAD.
 *
 * Search, filtering, sorting and paging were the whole point of ADM-01 and none
 * of them was covered — the suite tested suspension and permission gating on a
 * screen whose main job is finding a client among 219,000.
 *
 * The sorting cases matter most. Seven columns declared `sortable: true` with
 * no handler passed, so clicking a header re-ordered the twenty-five rows on
 * screen and presented the result as the dataset. R-2.5 names it exactly:
 * "sorting the 25 rows you happen to be holding looks identical to sorting the
 * dataset, and is wrong in a way no one notices until someone acts on the top
 * row."
 */
describe('finding a client — search, filters and sort reach the API', () => {
  it('sends the search term to the server rather than filtering locally', async () => {
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await userEvent.type(screen.getByRole('searchbox'), 'alpha');

    // Debounced, so the assertion waits rather than asserting on the first
    // keystroke — otherwise this passes for the wrong reason on a slow machine.
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const [url] = replace.mock.calls.at(-1) as [string];
    expect(url).toContain('q=alpha');
  });

  /**
   * THE BUG THIS PINS: the search box used to LOSE CHARACTERS.
   *
   * It was fully controlled by the URL — `value={values.q}`, with every
   * keystroke doing a `router.replace`. `replace` is asynchronous, so between
   * the keypress and the re-render the input still held the PREVIOUS value;
   * React re-applied that stale value to a controlled input and the character
   * was gone. Typing at any speed sent a subset of what was typed.
   *
   * The box keeps LOCAL state now and writes the URL on a debounce, so the term
   * that reaches the API is the whole term. Asserting the last request rather
   * than the last `replace` is deliberate: what matters is not that a URL was
   * written but that the SERVER was asked for "alexandra" — a box that dropped
   * letters would ask for "aeadra" and still have written a URL.
   */
  it('reaches the API with the WHOLE term, not a subset of the keystrokes', async () => {
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await userEvent.type(screen.getByRole('searchbox'), 'alexandra');

    // Long enough that a dropped character is overwhelmingly likely if the
    // input is fighting the router: nine keystrokes, each its own round trip
    // under the old wiring.
    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]?.q).toBe('alexandra'), {
      timeout: 3000,
    });
    // And the box still shows what was typed — the other half of the bug was
    // the operator watching their own text disappear as they typed it.
    expect(screen.getByRole('searchbox')).toHaveValue('alexandra');
  });

  /**
   * THE REGRESSION TEST FOR THE LOST CHARACTERS — and the one that needs a SLOW
   * router to mean anything.
   *
   * The box was fully controlled by the URL: `value={values.q}`, every keystroke
   * doing a `router.replace`. `replace` is asynchronous, so between the keypress
   * and the navigation landing, `useSearchParams()` still returned the PREVIOUS
   * value — React re-applied that stale value to the controlled input and the
   * character the operator had just typed was gone. What reached the API was
   * some subset of what was typed, and the operator watched their own text
   * disappear as they wrote it.
   *
   * With `routerLatencyMs` at 0 this passes either way, which is exactly why the
   * default mock never caught it. At 50ms the round trip is slower than typing,
   * which is the real condition, and a URL-controlled input drops letters here.
   */
  it('keeps every character when the router is SLOW to apply the URL', async () => {
    routerLatencyMs.current = 50;
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    // `delay: 10` types faster than the 50ms router — the ordering that made
    // the old input lose characters.
    await userEvent.type(screen.getByRole('searchbox'), 'alexandra', { delay: 10 });

    // The box shows what was typed, in full. This is the half the operator sees.
    expect(screen.getByRole('searchbox')).toHaveValue('alexandra');
    // …and the whole term is what the server is eventually asked for.
    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]?.q).toBe('alexandra'), {
      timeout: 4000,
    });
  });

  it('puts a filter in the URL, so a segment can be linked to', async () => {
    // The forcing requirement: `/tags` shows a client count per tag and has to
    // make it clickable.
    searchParams.current = new URLSearchParams('status=suspended');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'suspended' });
  });

  it('passes the country and tag filters through', async () => {
    searchParams.current = new URLSearchParams('country=Lebanon&tag=high-risk');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({
      country: 'Lebanon',
      tag: 'high-risk',
    });
  });

  it('SENDS the sort to the API instead of reordering the current page', async () => {
    getClients.mockResolvedValue(
      page([client({ id: 'c-1', email: 'zulu@oxshare.com', firstName: 'Zulu' })]),
    );
    renderWithProviders(<ClientsPage />);
    await screen.findByText('zulu@oxshare.com');

    await userEvent.click(screen.getByRole('button', { name: /email/i }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const [url] = replace.mock.calls.at(-1) as [string];
    expect(url).toContain('sort=email');
    expect(url).toContain('order=');
  });

  it('reads an existing sort out of the URL and asks the API for it', async () => {
    searchParams.current = new URLSearchParams('sort=email&order=asc');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'email', order: 'asc' });
  });

  it('IGNORES a sort key the API does not accept', async () => {
    /*
     * A stale bookmark, or a hand-edited URL. The API answers 400 for an
     * unrecognised sort (R-2.5 — never a silent fallback), so passing it
     * through would turn a link somebody saved last month into an error page
     * instead of a list.
     */
    searchParams.current = new URLSearchParams('sort=password_hash');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]?.sort).toBeUndefined();
  });

  /*
   * Paging is by PAGE NUMBER now, not by cursor, and the number is in the URL.
   *
   * The test this replaces asserted that "next" sent back the `nextCursor` the
   * server returned. That was right for a cursor walk and is the wrong contract
   * now: a cursor cannot express "page 7", so an operator had no way back to a
   * page they had left and no link they could share.
   */
  it('asks for the total, which numbered pages cannot be drawn without', async () => {
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    // `ClientListResponseDto.total` is optional — the endpoint counts only when
    // asked. Without this the pager has no page count and hides the whole list
    // behind page one.
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ withTotal: true });
  });

  it('pages forward by NUMBER, and puts the page in the URL', async () => {
    // 3 pages at 25 a page, so the numbered buttons render.
    getClients.mockResolvedValue(page([client()], { total: 70 }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 }));
    // In the URL, so a refresh and the Back button both land where the operator
    // was rather than back at page one.
    expect(searchParams.current.get('page')).toBe('2');
  });

  /**
   * THE ROWS-PER-PAGE SELECTOR USED TO DO NOTHING.
   *
   * The pager rendered its `<Select>`, but this page passed no
   * `onPageSizeChange` and sent a hardcoded `limit: 25`. The control opened,
   * took a choice, closed — and the next request asked for 25 rows again.
   *
   * A second, subtler defect sat behind it: `Pagination` used to call
   * `onPageSizeChange` and then `onPageChange(1)`, and both write the query
   * string from the SAME `searchParams` snapshot. The second `replace`
   * therefore overwrote the first and the size was discarded even once the
   * handler existed. The reset is the caller's job now, done in one `set`.
   */
  it('sends a new limit when the rows-per-page size changes', async () => {
    const user = userEvent.setup();
    getClients.mockResolvedValue(page([client()], { total: 500 }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await user.click(await screen.findByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '100' }));

    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ limit: 100 }));
  });

  it('RESETS to page one when the size changes, so it cannot land past the end', async () => {
    // Page 4 at 25 a page is past the end at 100 a page, which renders as an
    // empty table and reads as "no clients match".
    const user = userEvent.setup();
    getClients.mockResolvedValue(page([client()], { total: 500 }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await user.click(screen.getByRole('button', { name: 'Page 4' }));
    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ page: 4 }));

    await user.click(await screen.findByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '100' }));

    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ limit: 100 }));
    // Both halves of the fix: the new size AND page one, in the same request.
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ page: 1, limit: 100 });
    expect(searchParams.current.get('page')).toBeNull();
  });

  it('honours a limit from the URL, so a shared link opens the same view', async () => {
    searchParams.current = new URLSearchParams('limit=50');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ limit: 50 });
  });

  it('CLAMPS a hand-edited limit the API would refuse', async () => {
    // The endpoint caps `limit` at 100, so passing 5000 through would turn a
    // stale bookmark into an error page instead of a list.
    searchParams.current = new URLSearchParams('limit=5000');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ limit: 25 });
  });

  it('returns to page ONE when a filter changes', async () => {
    getClients.mockResolvedValue(page([client()], { total: 70 }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 }));

    /*
     * Page 7 of the old filter is rarely page 7 of the new one and is very
     * often past the end of it — which renders as an empty table and reads as
     * "no clients match", not as "you are too far down the list".
     */
    await userEvent.type(screen.getByRole('searchbox'), 'alpha');

    await waitFor(() => expect(searchParams.current.get('page')).toBeNull());
  });
});

/**
 * THREE THINGS A READER MIGHT CALL "STATUS", and they are not the same thing.
 *
 * `status` is the ACCOUNT state (may this person sign in), `kycStatus` is the
 * identity decision, and `emailVerified` is a self-service step the client can
 * complete themselves. The list used to show a "KYC level" column instead of
 * the decision, which could not tell "never applied" from "applied and was
 * refused" — a rejection leaves the level at 0, exactly where someone who has
 * done nothing sits. Those are opposite pieces of work for a reviewer.
 */
describe('verification is shown separately from the account state', () => {
  it('shows the KYC DECISION, not just the tier it granted', async () => {
    getClients.mockResolvedValue(page([client({ kycStatus: 'rejected', verificationLevel: 0 })]));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    // The row that the old "KYC level" column rendered as "L0 · Unverified" —
    // indistinguishable from a client who never applied.
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows email verification as its own column, distinct from KYC', async () => {
    // An unconfirmed email is fixed by the client clicking a link; a KYC
    // decision is work for a reviewer. Folding them together would send an
    // operator chasing documents for somebody who only needed their inbox.
    getClients.mockResolvedValue(page([client({ emailVerified: false, kycStatus: 'approved' })]));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    expect(screen.getByRole('columnheader', { name: /email verified/i })).toBeInTheDocument();
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    // The KYC decision is still its own, opposite, value on the same row.
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('passes kycStatus and emailVerified through to the API', async () => {
    searchParams.current = new URLSearchParams('kycStatus=under_review&emailVerified=false');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({
      kycStatus: 'under_review',
      emailVerified: 'false',
    });
  });

  it('does NOT offer a sort on either — the API has no such key', async () => {
    /*
     * Neither is in the backend's `CLIENT_SORT_COLUMNS`: both are joined or
     * derived rather than columns on `users`. R-2.5 makes an unrecognised sort
     * a 400 rather than a silent fallback, so a sortable header here would turn
     * a click into an error page instead of rows.
     */
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    for (const name of [/^kyc status$/i, /^email verified$/i]) {
      const header = screen.getByRole('columnheader', { name });
      expect(within(header).queryByRole('button')).toBeNull();
    }
  });
});

/**
 * The tag filter is a SELECT, at the operator's request — it was a row of
 * toggle chips.
 *
 * Still ONE tag at a time, which the select makes structural rather than a
 * convention: the API takes a single `?tag=`, because AND and OR are both
 * plausible readings of a multi-tag filter and shipping the wrong one silently
 * is worse than not shipping it (D-15).
 */
describe('the tag filter', () => {
  beforeEach(() => {
    getTags.mockResolvedValue([
      { id: 't-1', slug: 'high-risk', label: 'High risk', color: null, clientCount: 4 },
      { id: 't-2', slug: 'vip', label: 'VIP', color: null, clientCount: 2 },
    ]);
  });

  it('is a select rather than a row of chips', async () => {
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    const trigger = await screen.findByLabelText(/all tags/i);
    // A combobox, not a set of pressable chips — the chips were `aria-pressed`
    // buttons, so their absence is what "it is no longer chips" means.
    expect(trigger).toHaveAttribute('role', 'combobox');
    expect(screen.queryByRole('button', { pressed: false })).toBeNull();
  });

  it('filters by tag SLUG, not id — a rename must not break a saved link', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await user.click(await screen.findByLabelText(/all tags/i));
    await user.click(await screen.findByRole('option', { name: /high risk/i }));

    await waitFor(() =>
      expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ tag: 'high-risk' }),
    );
  });

  it('offers an "all tags" option that CLEARS the filter', async () => {
    // The select's equivalent of the second click that used to clear a chip.
    searchParams.current = new URLSearchParams('tag=high-risk');
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await user.click(await screen.findByLabelText(/all tags/i));
    await user.click(await screen.findByRole('option', { name: /^all tags$/i }));

    await waitFor(() => expect(searchParams.current.get('tag')).toBeNull());
  });
});

/**
 * The country FILTER is gone; the country COLUMN is not.
 *
 * Its options were built from the twenty-five rows on screen — `users.country`
 * is free text written by the KYC flow, so there was no vocabulary to offer —
 * which meant they changed as the operator paged and a country visible in the
 * table was frequently one the filter did not list. Removed on request.
 */
describe('the country filter', () => {
  it('is not offered any more', async () => {
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    expect(screen.queryByLabelText(/all countries/i)).toBeNull();
  });

  it('still HONOURS ?country= from a link somebody saved', async () => {
    // The endpoint still accepts the parameter. Dropping it here would silently
    // widen a bookmarked URL into a list it never named.
    searchParams.current = new URLSearchParams('country=Lebanon');
    renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(getClients).toHaveBeenCalled());
    expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ country: 'Lebanon' });
  });
});

describe('a masked field', () => {
  it('loses its whole COLUMN, not just its values', async () => {
    /*
     * The mask is a property of the viewer, so every row carries the same set —
     * twenty-five identical redaction chips would spend horizontal space
     * communicating one fact.
     */
    getClients.mockResolvedValue(
      page([client({ email: undefined })], { maskedFields: ['client.email'] }),
    );
    renderWithProviders(<ClientsPage />);
    await screen.findByText('John Doe');

    // ANCHORED. A loose `/email/i` now also matches the "Email verified"
    // column, which is a different field and is NOT masked here — so the
    // unanchored query would fail against a correctly masked table.
    expect(screen.queryByRole('columnheader', { name: /^email$/i })).not.toBeInTheDocument();
    // The address itself is gone from the row, while the separate
    // email-VERIFICATION column survives: masking hides the value, not the fact
    // that the client confirmed it.
    expect(screen.getByRole('columnheader', { name: /^email verified$/i })).toBeInTheDocument();
  });

  it('SAYS the column is hidden, rather than leaving it silently absent', async () => {
    // Without this, an operator comparing notes with a colleague who sees more
    // has no way to tell whether the screen is broken or they are.
    getClients.mockResolvedValue(
      page([client({ email: undefined })], { maskedFields: ['client.email'] }),
    );
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByRole('note')).toHaveTextContent(/hidden by your permissions/i);
  });

  it('drops the FILTER for a masked field too', async () => {
    /*
     * A control for a field you cannot read back can only produce confusion: it
     * either does nothing visible (the column is gone) or it quietly narrows
     * the list on a value the operator has no way to see.
     *
     * Asserted against TAGS rather than country. This case used to name the
     * country filter, which no longer exists on any code path — so the test
     * passed whatever `hiddenFilters` did, and had stopped watching the thing
     * it names. Tags are the remaining maskable field with a filter.
     */
    getTags.mockResolvedValue([
      { id: 't-1', slug: 'high-risk', label: 'High risk', color: null, clientCount: 4 },
    ]);
    getClients.mockResolvedValue(page([client()], { maskedFields: ['client.tags'] }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('John Doe');

    expect(screen.queryByLabelText(/all tags/i)).toBeNull();
  });

  it('keeps that filter when the field is NOT masked', async () => {
    // The other half — otherwise the assertion above passes on a filter bar
    // that never renders a tag control at all.
    getTags.mockResolvedValue([
      { id: 't-1', slug: 'high-risk', label: 'High risk', color: null, clientCount: 4 },
    ]);
    renderWithProviders(<ClientsPage />);
    await screen.findByText('John Doe');

    expect(await screen.findByLabelText(/all tags/i)).toBeInTheDocument();
  });
});

describe('exporting the client list', () => {
  /*
   * "Export what I am looking at": the file must be narrowed by the same
   * filters and ordered by the same sort as the screen, or a filtered list
   * downloads as every client in the scope — the defect the backend's own
   * filter-parity tests exist to stop, one layer up.
   */
  it('sends the filters and sort the list is showing', async () => {
    searchParams.current = new URLSearchParams(
      'status=active&kycStatus=approved&tag=vip&sort=createdAt&order=desc&page=3',
    );
    downloadExport.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await screen.findByText('client@oxshare.com');
    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(downloadExport).toHaveBeenCalledTimes(1));
    const [resource, format, filters] = downloadExport.mock.calls[0] as [
      string,
      string,
      URLSearchParams,
    ];
    expect(resource).toBe('clients');
    expect(format).toBe('csv');
    expect(filters.get('status')).toBe('active');
    expect(filters.get('kycStatus')).toBe('approved');
    expect(filters.get('tag')).toBe('vip');
    expect(filters.get('sort')).toBe('createdAt');
    expect(filters.get('order')).toBe('desc');
    // The file is the whole filtered set, not the page on screen.
    expect(filters.has('page')).toBe(false);
    expect(filters.has('limit')).toBe(false);
  });

  it('sends nothing it was not filtered by — an empty filter is a 400 on the export', async () => {
    downloadExport.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await screen.findByText('client@oxshare.com');
    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(downloadExport).toHaveBeenCalledTimes(1));
    const filters = downloadExport.mock.calls[0]?.[2] as URLSearchParams;
    expect([...filters.keys()]).toEqual([]);
  });

  it('carries the partner filter, so one partner’s book exports as that book', async () => {
    searchParams.current = new URLSearchParams('referredBy=26184');
    downloadExport.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await screen.findByText('client@oxshare.com');
    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(downloadExport).toHaveBeenCalledTimes(1));
    expect((downloadExport.mock.calls[0]?.[2] as URLSearchParams).get('referredBy')).toBe('26184');
  });
});
