import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import KycQueuePage from './page';

/**
 * The KYC review queue — the reviewer's working list.
 *
 * The queue itself decides nothing; the detail screen does. What it must get
 * right is not showing the wrong work: filtering and paging happen SERVER-side,
 * so a filter that is applied in the browser instead would silently review a
 * page of 25 rather than the whole queue, and a reviewer would believe an empty
 * screen meant an empty backlog.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

/*
 * The reviewer this file is about, stated rather than inherited.
 *
 * `renderWithProviders` deliberately supplies no AdminAuthProvider, so a screen
 * that reads identity needs the test to name one. This became load-bearing when
 * each row's link started checking whether the viewer may open the destination
 * (`PermittedLink`): without a session there is no link to assert on, and the
 * queue's own row link is the thing under test here.
 *
 * `kyc.view` and nothing else — the queue's route requirement, and enough to
 * reach a submission. It deliberately does NOT hold `clients.view`, which is the
 * case the link gating exists for.
 */
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'reviewer@oxshare.com',
      name: 'KYC Reviewer',
      role: 'sub_admin',
      status: 'active',
      permissions: ['kyc.view', 'kyc.review'],
      maskedFields: [],
      scopedTags: [],
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  }),
}));

/*
 * The queue reaches for the app router so a double-clicked row can open its
 * review screen. `useRouter` throws outside a mounted router ("invariant
 * expected app router to be mounted"), and this file renders the page directly
 * rather than through a route.
 *
 * `push` is captured so the double-click test below can assert WHERE it
 * navigated — the row shortcut is only worth having if it goes to that row's
 * own submission.
 */
const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

// Both exports — lib/api/index.ts exposes `api` named AND default. Mocking only
// `default` leaves the named one undefined and the page renders its generic
// failure state, which reads as a broken query rather than a broken mock.
vi.mock('@/lib/api', () => {
  const api = { get };
  return { api, default: api };
});

const row = (over: Record<string, unknown> = {}) => ({
  userId: '11111111-1111-1111-1111-111111111111',
  status: 'submitted',
  submittedAt: '2026-08-01T10:00:00.000Z',
  user: { email: 'client@oxshare.com', firstName: 'Kay', lastName: 'Client' },
  ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  items: [row()],
  total: 1,
  page: 1,
  limit: 25,
  counts: { all: 1, submitted: 1, under_review: 0, approved: 0, rejected: 0 },
  ...over,
});

/** The querystring of the most recent request. */
const lastQuery = () => {
  const calls = get.mock.calls as Array<[string, unknown]>;
  const url = calls[calls.length - 1]?.[0] ?? '';
  return new URLSearchParams(url.split('?')[1] ?? '');
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: page() });
});

describe('the queue', () => {
  it('lists a waiting submission with the person behind it', async () => {
    renderWithProviders(<KycQueuePage />);
    expect(await screen.findByText(/client@oxshare.com/)).toBeInTheDocument();
  });

  it('asks the server for a bounded page rather than the whole table', async () => {
    // §5 warns the risk is unindexed filters and N+1 in the admin table. An
    // unbounded request is the version of that the client can cause.
    renderWithProviders(<KycQueuePage />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(Number(lastQuery().get('limit'))).toBeGreaterThan(0);
    expect(Number(lastQuery().get('limit'))).toBeLessThanOrEqual(100);
  });

  it('sends the status filter to the SERVER, not applying it in the browser', async () => {
    // Filtering a single page client-side would show "no submissions" whenever
    // the matching ones happen to be on page 2 — a reviewer reading that as an
    // empty backlog is how a submission waits a week.
    const user = userEvent.setup();
    renderWithProviders(<KycQueuePage />);
    await screen.findByText(/client@oxshare.com/);

    await user.click(screen.getByRole('button', { name: /approved/i }));

    await waitFor(() => expect(lastQuery().get('status')).toBe('approved'));
  });

  it('returns to page 1 when the filter changes', async () => {
    // Otherwise switching filters on page 3 lands on page 3 of a shorter list,
    // which is usually empty and reads as "nothing to review".
    const user = userEvent.setup();
    renderWithProviders(<KycQueuePage />);
    await screen.findByText(/client@oxshare.com/);

    await user.click(screen.getByRole('button', { name: /approved/i }));
    await waitFor(() => expect(lastQuery().get('page')).toBe('1'));
  });

  it('sends the search term to the server, debounced', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycQueuePage />);
    await screen.findByText(/client@oxshare.com/);

    await user.type(screen.getByLabelText(/search submissions/i), 'kay');

    await waitFor(() => expect(lastQuery().get('q')).toBe('kay'), { timeout: 2000 });
  });

  it('shows counts over the WHOLE set, not just the page on screen', async () => {
    // The counts come from the API precisely so they stay correct while a
    // filter is active. Counting rows in the DOM instead would make every tab
    // read the size of the current page.
    get.mockResolvedValue({
      data: page({
        counts: { all: 140, submitted: 12, under_review: 3, approved: 120, rejected: 5 },
      }),
    });
    renderWithProviders(<KycQueuePage />);
    expect(await screen.findByText('120')).toBeInTheDocument();
  });

  it('links each row to that submission, not to a shared screen', async () => {
    renderWithProviders(<KycQueuePage />);
    const link = await screen.findByRole('link', { name: /client@oxshare.com|review|kay/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('11111111-1111-1111-1111-111111111111'),
    );
  });

  it('opens on the PENDING queue, not on every status', async () => {
    /*
     * The default is the whole point of the screen: a reviewer should land on
     * what is waiting for them. Defaulting to all statuses buried the queue
     * under already-decided identities, and the number that mattered — how many
     * people are waiting — was never the one on screen.
     *
     * Asserted on the FIRST request rather than by reading the tab's styling:
     * the tab could highlight correctly while the query asked for everything,
     * which is the version of this bug that looks fixed.
     */
    renderWithProviders(<KycQueuePage />);
    await screen.findByText(/client@oxshare.com/);

    expect(lastQuery().get('status')).toBe('submitted');
  });

  it('opens the review screen on a double-clicked row', async () => {
    /*
     * The shortcut, not the affordance — the Review link above is still what a
     * keyboard reaches, and it has its own test. This pins that the gesture
     * lands on THAT ROW's submission rather than a shared screen.
     */
    const user = userEvent.setup();
    renderWithProviders(<KycQueuePage />);
    const cell = await screen.findByText(/client@oxshare.com/);

    await user.dblClick(cell);

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/kyc/11111111-1111-1111-1111-111111111111'),
    );
  });

  it('does NOT navigate when the double-click landed on a control', async () => {
    /*
     * Double-clicking the Review link would otherwise fire the link AND this
     * handler — two navigations for one gesture — and on a table with an expand
     * chevron it would toggle the row twice before leaving it. The handler
     * ignores anything inside an interactive element.
     */
    const user = userEvent.setup();
    renderWithProviders(<KycQueuePage />);
    const link = await screen.findByRole('link', { name: /client@oxshare.com|review|kay/i });

    await user.dblClick(link);

    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('when there is nothing to show', () => {
  it('says the queue is empty rather than rendering a blank table', async () => {
    get.mockResolvedValue({ data: page({ items: [], total: 0, counts: { all: 0 } }) });
    renderWithProviders(<KycQueuePage />);
    expect(await screen.findByText(/no .*(submission|result|match)/i)).toBeInTheDocument();
  });

  it('offers a retry when the queue cannot be loaded', async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<KycQueuePage />);
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
