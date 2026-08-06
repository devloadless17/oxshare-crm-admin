import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ClientsPage from './page';

/**
 * The client directory, and the one destructive action on it.
 *
 * Suspending logs a client out immediately and locks them out, so the asymmetry in
 * this screen is deliberate and worth pinning: suspending asks for confirmation,
 * reactivating does not. Only the direction that takes access away needs a guard.
 *
 * Also pins that suspension is gated on users.suspend. Client-side gating is UX
 * rather than security — PermissionsGuard answers 403 independently — but a missing
 * gate implies the permission model is wider than it is.
 */

const { getClients, setClientStatus, getTags } = vi.hoisted(() => ({
  getClients: vi.fn(),
  setClientStatus: vi.fn(),
  getTags: vi.fn(),
}));

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
const replace = vi.fn((url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
  usePathname: () => '/clients',
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

const permissions = { current: ['*'] as string[] };

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
    email: 'client@oxshare.com',
    firstName: 'John',
    lastName: 'Doe',
    type: 'individual',
    status: 'active',
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
  permissions.current = ['*'];
  searchParams.current = new URLSearchParams();
  getClients.mockResolvedValue(page([client()]));
  getTags.mockResolvedValue([]);
  setClientStatus.mockResolvedValue(client({ status: 'suspended' }));
});

describe('client directory — listing', () => {
  it('lists clients returned by the API', async () => {
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('client@oxshare.com')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    getClients.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('client directory — suspension', () => {
  it('asks before suspending, and does nothing if declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /^suspend$/i }));

    expect(confirmSpy).toHaveBeenCalled();
    // Suspension logs the client out immediately; a mis-click must not reach the API.
    expect(setClientStatus).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('suspends once confirmed, sending status: suspended', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /^suspend$/i }));

    await waitFor(() => expect(setClientStatus).toHaveBeenCalledTimes(1));
    // `(id, status)`, not an axios `(url, body)` pair — the call moved behind
    // `api.admin.setClientStatus` so the page no longer builds its own URLs.
    expect(setClientStatus).toHaveBeenCalledWith('c-1', 'suspended');
    confirmSpy.mockRestore();
  });

  it('warns which client is being suspended, by email', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /^suspend$/i }));

    // Acting on the wrong row is the mistake this text exists to prevent.
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('client@oxshare.com');
    confirmSpy.mockRestore();
  });

  it('reactivates WITHOUT a confirmation, since it restores access', async () => {
    getClients.mockResolvedValue(page([client({ status: 'suspended' })]));
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    await user.click(await screen.findByRole('button', { name: /reactivate/i }));

    // Only the destructive direction is guarded. Asking here would be friction
    // with nothing to protect.
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(setClientStatus).toHaveBeenCalledTimes(1));
    expect(setClientStatus).toHaveBeenCalledWith('c-1', 'active');
    confirmSpy.mockRestore();
  });
});

describe('client directory — permission gating', () => {
  it('shows no suspend control without users.suspend', async () => {
    permissions.current = ['users.view'];
    renderWithProviders(<ClientsPage />);

    await screen.findByText('client@oxshare.com');
    expect(screen.queryByRole('button', { name: /^suspend$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reactivate/i })).toBeNull();
  });

  it('still lists clients read-only without users.suspend', async () => {
    permissions.current = ['users.view'];
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

  it('pages forward with the cursor the server returned', async () => {
    getClients.mockResolvedValue(page([client()], { nextCursor: 'cursor-two' }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client@oxshare.com');

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(getClients.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: 'cursor-two' }),
    );
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

    expect(screen.queryByRole('columnheader', { name: /email/i })).not.toBeInTheDocument();
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
    // A control for a field you cannot read back can only produce confusion.
    getClients.mockResolvedValue(page([client()], { maskedFields: ['client.country'] }));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('John Doe');

    expect(screen.queryByText(/all countries/i)).not.toBeInTheDocument();
  });
});
