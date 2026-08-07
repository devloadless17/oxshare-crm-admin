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
