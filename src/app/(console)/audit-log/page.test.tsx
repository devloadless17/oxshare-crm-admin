import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AuditLogPage from './page';
import type { AuditEntry } from '@/lib/api/admin';

/**
 * The admin action log.
 *
 * The master-admin gate is NOT retested here — `lib/permissions.test.ts` already
 * covers it at the route level ("audit log stays master-only"), which is where the
 * gate actually lives. Duplicating it would give two places to update and no extra
 * signal.
 *
 * What is pinned instead is the page's own behaviour: the log is APPEND-ONLY, so it
 * must offer no way to change or remove an entry, and the filter has to actually
 * reach the request rather than only filtering what is already on screen.
 */

const { get, getAuditActions } = vi.hoisted(() => ({
  get: vi.fn(),
  // The action filter is SERVED now, not hardcoded — the screen offered eight
  // of thirty-four, so everything recently made auditable was unfilterable.
  getAuditActions: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { get, admin: { getAuditActions } };
  return { api, default: api };
});

/*
 * The page number and the action filter live in the URL now, so the page reads
 * `useSearchParams` and writes through `router.replace` — both have to be
 * mocked. Same shape as `clients/page.test.tsx`.
 */
const searchParams = { current: new URLSearchParams() };

/*
 * `replace` FEEDS BACK into `useSearchParams`, because the real router does.
 *
 * A spy that only recorded would leave every URL-controlled input frozen at its
 * initial value, so clicking "Page 2" would re-request page 1 and the test
 * would be asserting against a screen that behaves nothing like the real one.
 */
/*
 * …and the write-back has to RE-RENDER, not merely be stored.
 *
 * Storing the new params updates what the next render would read, but nothing
 * schedules that render — so clicking "Page 2" wrote `page=2` into the mock and
 * the component went on asking for page 1 from its previous props. Making the
 * mock a subscribable store, as the real router is, is what closes that gap.
 */
const listeners = new Set<() => void>();
let snapshot = 0;

const replace = vi.fn((url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
  // React re-renders only on a CHANGED snapshot, and `getSnapshot` must be
  // cheap and stable — so a counter rather than the params object itself.
  snapshot += 1;
  for (const notify of listeners) notify();
});

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
    usePathname: () => '/audit-log',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

/**
 * Typed against the generated schema on purpose. The first draft of this fixture
 * invented `adminId`/`adminEmail`; the real fields are `actorId`/`actorEmail`, and
 * the page was correct all along. A typed fixture turns that into a compile error
 * instead of a puzzling empty column.
 */
function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'e-1',
    actorId: 'a-1',
    actorEmail: 'admin@oxshare.com',
    // Both required by the generated schema, and both were missing from this
    // fixture until the API started admitting they exist — the compile error
    // was the contract doing its job.
    actorKind: 'admin',
    ipAddress: '203.0.113.9',
    action: 'kyc.approve',
    subjectType: 'kyc',
    subjectId: 'u-1',
    createdAt: '2026-08-03T15:25:08.798Z',
    ...over,
  };
}

function page(rows: AuditEntry[], total = rows.length) {
  return { items: rows, total, page: 1, limit: 20 };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The URL is shared mutable state between tests now — a page or filter left
  // behind by one would silently become the starting condition of the next.
  searchParams.current = new URLSearchParams();
  // Bumped rather than zeroed: a subscriber left over from the previous test
  // would see an unchanged snapshot and skip the render that resets it.
  snapshot += 1;
  listeners.clear();
  get.mockResolvedValue({ data: page([entry()]) });
  getAuditActions.mockResolvedValue([
    { action: 'kyc.approve', label: 'KYC approved', group: 'Verification' },
  ]);
});

describe('audit log — listing', () => {
  it('lists entries with the acting admin and the action', async () => {
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/admin@oxshare\.com/)).toBeInTheDocument();
    expect(screen.getByText(/kyc\.approve/i)).toBeInTheDocument();
  });

  it('requests a numbered first page with a bounded limit', async () => {
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls[0]?.[0] as string;

    // An unbounded audit query is a slow query at §5's row counts.
    expect(url).toMatch(/limit=\d+/);

    /*
     * `page=1`, and no cursor. This assertion asked for the OPPOSITE of both
     * until the tables were unified on offset paging, and the reasoning it
     * carried is worth keeping rather than deleting: offset paging over a list
     * being written to can skip rows, and a trail with a gap is worse than no
     * trail because it is believed.
     *
     * What decided it the other way is that the log only ever grows at the END.
     * A reader walking backwards through history is not stepping over rows being
     * inserted ahead of them — new entries land on page one, which is the page
     * they are not on. Against that, a cursor cost the ability to link "page 12
     * of the log, filtered to kyc.reject" into a ticket, which is what an
     * investigation actually does with this screen.
     */
    expect(url).toMatch(/page=1/);
    expect(url).not.toMatch(/cursor=/);
  });

  it('asks for a different page when the pager is used, and says so in the URL', async () => {
    // 3 pages at 25 a page, so the numbered buttons render.
    get.mockResolvedValue({ data: page([entry()], 70) });
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() => {
      const url = get.mock.calls.at(-1)?.[0] as string;
      expect(url).toMatch(/page=2/);
    });
  });

  it('offers a retry when the log cannot be loaded', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the endpoint when the API is not built yet', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('nope'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/\/admin\/audit-log/)).toBeInTheDocument();
  });
});

describe('audit log — filtering happens server-side', () => {
  it('sends the chosen action to the API rather than filtering locally', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);

    await screen.findByText(/kyc\.approve/i);
    get.mockClear();

    // Pick a specific action from the filter.
    // Two comboboxes render: the action filter and rows-per-page.
    await user.click(screen.getAllByRole('combobox')[0]!);
    const option = await screen.findByRole('option', { name: /kyc approve/i });
    await user.click(option);

    // Filtering client-side would silently show only the current page's matches,
    // which on an append-only log of ~219K rows is a wrong answer, not a slow one.
    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toMatch(/action=kyc\.approve/);
  });
});

/**
 * THE ROWS-PER-PAGE SELECTOR USED TO DO NOTHING.
 *
 * The pager rendered its `<Select>` on every one of these tables, but the page
 * passed no `onPageSizeChange` and sent a hardcoded `limit`. So the control
 * opened, took a choice, closed — and the next request asked for 25 rows again.
 * From the operator's side that is indistinguishable from a broken screen.
 */
describe('audit log — the rows-per-page selector reaches the API', () => {
  /**
   * Pick a size from the pager's own `<Select>`.
   *
   * By its accessible NAME rather than by index among the comboboxes: the
   * action filter is the other one, and an index would silently start asserting
   * about the wrong control the moment a filter is added or removed. The name
   * comes from the visible "Rows per page:" label, which the trigger now points
   * at with `aria-labelledby` — it announced as an unnamed combobox before.
   */
  async function choosePageSize(user: ReturnType<typeof userEvent.setup>, size: string) {
    await user.click(await screen.findByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: size }));
  }

  it('sends a new limit when the size changes', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: page([entry()], 500) });
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    await choosePageSize(user, '100');

    await waitFor(() => {
      const url = get.mock.calls.at(-1)?.[0] as string;
      expect(url).toMatch(/limit=100/);
    });
  });

  /**
   * THE HALF THAT IS EASY TO GET WRONG.
   *
   * Page 4 at 25 a page is past the end at 100 a page. Keeping the page number
   * across a size change renders an empty table, which reads as "no entries
   * match" rather than as "you are beyond the end of the list".
   */
  it('RESETS to page one, so the new size cannot land past the end', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: page([entry()], 500) });
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    await userEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    await waitFor(() => expect(searchParams.current.get('page')).toBe('4'));

    await choosePageSize(user, '100');

    // The page comes out of the URL entirely rather than being pinned to 1 —
    // `url.set` drops a key handed `undefined`, so page one leaves a clean URL.
    await waitFor(() => expect(searchParams.current.get('page')).toBeNull());
    const url = get.mock.calls.at(-1)?.[0] as string;
    expect(url).toMatch(/page=1/);
    expect(url).toMatch(/limit=100/);
  });

  it('honours a limit from the URL, so a shared link opens the same view', async () => {
    searchParams.current = new URLSearchParams('limit=50');
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls.at(-1)?.[0] as string).toMatch(/limit=50/);
  });

  it('CLAMPS a hand-edited limit the API would refuse', async () => {
    // The backend caps `limit` at 100, so passing 5000 through would turn a
    // stale bookmark into an error page instead of a list.
    searchParams.current = new URLSearchParams('limit=5000');
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls.at(-1)?.[0] as string;
    expect(url).not.toMatch(/limit=5000/);
    expect(url).toMatch(/limit=25/);
  });
});

/**
 * THE SORT USED TO BE A LIE — R-2.5.
 *
 * This screen was honest for as long as the endpoint accepted no `sort`: every
 * column said `sortable: false`. The endpoint now allowlists three keys, so
 * those three headers must reach the API, and the other two must still refuse
 * to offer an ordering the endpoint would answer 400 to.
 */
describe('audit log — sorting reaches the API', () => {
  it('SENDS the sort instead of reordering the current page', async () => {
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    await userEvent.click(screen.getByRole('button', { name: /^action$/i }));

    await waitFor(() => {
      const url = get.mock.calls.at(-1)?.[0] as string;
      expect(url).toMatch(/sort=action/);
      expect(url).toMatch(/order=asc/);
    });
  });

  it('drops BOTH params when the column is cycled back off', async () => {
    /*
     * The third click of asc → desc → unsorted. A lingering `order=desc` with
     * no `sort` is a URL that means nothing, and the API is entitled to 400 on
     * it — so the two come out together and the trail returns to its own
     * `created_at DESC` default rather than to a guess this screen substituted.
     */
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    const header = () => screen.getByRole('button', { name: /^action$/i });
    await user.click(header()); // asc
    await waitFor(() => expect(searchParams.current.get('sort')).toBe('action'));
    await user.click(header()); // desc
    await waitFor(() => expect(searchParams.current.get('order')).toBe('desc'));
    await user.click(header()); // off

    await waitFor(() => expect(searchParams.current.get('sort')).toBeNull());
    expect(searchParams.current.get('order')).toBeNull();
    const url = get.mock.calls.at(-1)?.[0] as string;
    expect(url).not.toMatch(/sort=/);
    expect(url).not.toMatch(/order=/);
  });

  it('returns to page ONE when the sort changes', async () => {
    // Reordering renumbers every page, so positions 26–50 under the new sort
    // are not the entries that were there under the old.
    get.mockResolvedValue({ data: page([entry()], 500) });
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    await userEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    await waitFor(() => expect(searchParams.current.get('page')).toBe('4'));

    await userEvent.click(screen.getByRole('button', { name: /^action$/i }));

    await waitFor(() => expect(searchParams.current.get('page')).toBeNull());
  });

  it('reads an existing sort out of the URL and asks the API for it', async () => {
    searchParams.current = new URLSearchParams('sort=actorEmail&order=asc');
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls.at(-1)?.[0] as string;
    expect(url).toMatch(/sort=actorEmail/);
    expect(url).toMatch(/order=asc/);
  });

  it('IGNORES a sort key the API does not accept', async () => {
    // A stale bookmark or a hand-edited URL. R-2.5 makes an unrecognised sort a
    // 400, never a silent fallback, so passing it through would turn a saved
    // link into an error page instead of a list.
    searchParams.current = new URLSearchParams('sort=details&order=asc');
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls.at(-1)?.[0] as string;
    expect(url).not.toMatch(/sort=/);
  });

  it('offers NO sort on the columns outside the allowlist', async () => {
    /*
     * `subjectType` is a declared FILTER on this endpoint but not a sort key,
     * and `details` is a JSON blob. Both read like plausible sort keys, which is
     * exactly why the absence is pinned: a header claiming either would 400.
     */
    renderWithProviders(<AuditLogPage />);
    await screen.findByText(/admin@oxshare\.com/);

    for (const name of [/^subject$/i, /^details$/i]) {
      const header = screen.getByRole('columnheader', { name });
      expect(within(header).queryByRole('button')).toBeNull();
    }
  });
});

describe('audit log — append-only', () => {
  it('offers no way to edit or delete an entry', async () => {
    renderWithProviders(<AuditLogPage />);

    await screen.findByText(/kyc\.approve/i);

    // ARCHITECTURE §6.4: the log is append-only. A UI affordance to change it
    // would be a promise the database refuses to keep.
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});

describe('who acted, and from where', () => {
  /**
   * The address is what makes an action attributable rather than merely
   * attributed. `audit_log.ip_address` was populated from the first day the
   * column existed and was absent from the response DTO, so this screen could
   * not show it: "which address did this administrator approve the payout
   * from" was answerable in SQL and nowhere an operator would look.
   */
  it('shows the address the action came from', async () => {
    get.mockResolvedValue({ data: page([entry({ ipAddress: '203.0.113.9' })]) });
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('203.0.113.9')).toBeInTheDocument();
  });

  it('says so plainly when no address was recorded', async () => {
    // Null is legitimate — a scheduled job has no request context. An empty
    // cell would read as a rendering bug rather than as a fact about the row.
    get.mockResolvedValue({ data: page([entry({ ipAddress: null })]) });
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/no address recorded/i)).toBeInTheDocument();
  });

  it('labels a non-admin actor, and does NOT label an admin one', async () => {
    // Every row here is an admin action until background jobs land, so
    // labelling all of them would be noise that hides the one row that is not.
    get.mockResolvedValue({
      data: page([entry({ actorKind: 'system', actorEmail: 'commission.confirm' })]),
    });
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('system')).toBeInTheDocument();
  });

  it('does not label an ordinary admin row', async () => {
    get.mockResolvedValue({ data: page([entry({ actorKind: 'admin' })]) });
    renderWithProviders(<AuditLogPage />);

    await screen.findByText('admin@oxshare.com');
    expect(screen.queryByText('admin', { selector: 'span.uppercase' })).not.toBeInTheDocument();
  });
});
