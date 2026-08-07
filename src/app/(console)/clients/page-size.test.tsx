import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ClientsPage from './page';

/**
 * CHANGING ROWS-PER-PAGE MUST STICK.
 *
 * The reported symptom: pick 100 in the selector, the request goes out with
 * `limit=100` — and then the control snaps back to 25 and the table redraws at
 * the old size. So the write happened and something undid it, which is a very
 * different bug from "the handler is missing" and needs a test that watches the
 * value AFTER the dust settles rather than asserting one request went out.
 *
 * What this file pins, in order of how easily each breaks silently:
 *
 *  1. the request carries the new `limit`;
 *  2. the URL still carries it once the re-render has finished — this is the
 *     one the reported bug fails, and asserting only (1) would pass while the
 *     screen visibly reverts;
 *  3. the SELECT shows the new value, because a control that does not reflect
 *     its own state is indistinguishable from one that did nothing;
 *  4. the page resets to 1, since page 4 at 25 a page is past the end at 100
 *     and renders as an empty table reading "no clients match".
 */

const { getClients, getTags } = vi.hoisted(() => ({
  getClients: vi.fn(),
  getTags: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getClients, getTags, setClientStatus: vi.fn() } };
  return { api, default: api };
});

/*
 * The router mock is a STORE, not a spy.
 *
 * `router.replace` is asynchronous in Next, and `useSearchParams` only reflects
 * a write once the tree re-renders. A mock that merely records the call would
 * let every assertion below pass against a page that reverts on screen — which
 * is precisely the bug being chased. `useSyncExternalStore` makes the mocked
 * params a real subscription, so a component reading them re-renders exactly as
 * it does in the browser.
 */
const searchParams = { current: new URLSearchParams() };
const listeners = new Set<() => void>();
let snapshot = 0;

const replace = vi.fn((url: string) => {
  searchParams.current = new URLSearchParams(url.split('?')[1] ?? '');
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
    usePathname: () => '/clients',
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      permissions: ['*'],
      createdAt: new Date().toISOString(),
    },
  }),
}));

/** Enough rows that a second page exists at 25 a page. */
function page(count: number, over: Record<string, unknown> = {}) {
  return {
    items: Array.from({ length: Math.min(count, 25) }, (_, i) => ({
      id: `c-${i}`,
      email: `client${i}@oxshare.com`,
      firstName: 'Client',
      lastName: String(i),
      type: 'individual',
      status: 'active',
      emailVerified: true,
      kycStatus: 'not_started',
      verificationLevel: 0,
      createdAt: '2026-08-03T14:51:46.899Z',
    })),
    total: count,
    page: 1,
    limit: 25,
    maskedFields: [] as string[],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  snapshot += 1;
  listeners.clear();
  getClients.mockResolvedValue(page(120));
  getTags.mockResolvedValue([]);
});

/** The last `limit` the page actually asked the API for. */
const lastLimit = () =>
  (getClients.mock.calls.at(-1)?.[0] as { limit?: number } | undefined)?.limit;

/*
 * BY ITS ACCESSIBLE NAME, not by role alone: the filter bar renders several
 * `combobox`es of its own, and a bare `getByRole('combobox')` matches them
 * too. `Pagination` labels this one "Rows per page" via `aria-labelledby`.
 */
const pageSizeSelect = () => screen.getByRole('combobox', { name: /rows per page/i });

async function pickPageSize(user: ReturnType<typeof userEvent.setup>, size: string) {
  await user.click(pageSizeSelect());
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: size }));
}

describe('rows per page', () => {
  it('sends the new limit to the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client0@oxshare.com');

    await pickPageSize(user, '100');

    await waitFor(() => expect(lastLimit()).toBe(100));
  });

  it('KEEPS the new limit — it must not revert to the default', async () => {
    /*
     * The reported bug. The request went out with `limit=100` and the control
     * snapped back to 25, so an assertion on the request alone passed while the
     * screen was visibly wrong. This waits for the change and then re-checks,
     * so a revert on a later render fails here.
     */
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client0@oxshare.com');

    await pickPageSize(user, '100');
    await waitFor(() => expect(lastLimit()).toBe(100));

    // Let every queued re-render settle, then assert it is STILL 100.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(searchParams.current.get('limit'), 'the URL dropped the limit').toBe('100');
    expect(lastLimit(), 'the page reverted to the default size').toBe(100);
  });

  it('shows the chosen size in the control itself', async () => {
    // A selector that does not reflect its own value is indistinguishable from
    // one that did nothing, whatever the network tab says.
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client0@oxshare.com');

    await pickPageSize(user, '50');

    await waitFor(() => expect(pageSizeSelect()).toHaveTextContent('50'));
  });

  it('returns to page one, so the new size cannot land past the end', async () => {
    const user = userEvent.setup();
    searchParams.current = new URLSearchParams('page=4');
    snapshot += 1;
    renderWithProviders(<ClientsPage />);
    await screen.findByText('client0@oxshare.com');

    await pickPageSize(user, '100');

    await waitFor(() => expect(lastLimit()).toBe(100));
    expect(searchParams.current.get('page'), 'stayed on a page past the end').toBeNull();
  });
});
