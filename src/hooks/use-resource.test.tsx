// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useResource } from './use-resource';

/**
 * The status vocabulary every list screen renders from — PLATFORM-CONVENTIONS
 * R-2.3: 401 means "no valid session", 403 means "session valid, not permitted",
 * 404 means "not built yet", anything else is a failure worth a retry button.
 *
 * `unauthenticated` is the newest and the one a person sees least: the 401 is
 * being handled by the interceptor's redirect, and naming it here is what lets
 * `AsyncBoundary` avoid painting a Retry card into the moment before that
 * navigation lands.
 */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function failingWith(status: number) {
  // Shaped like an AxiosError: an Error carrying `response.status`.
  return () => Promise.reject(Object.assign(new Error(`HTTP ${status}`), { response: { status } }));
}

describe('useResource status mapping', () => {
  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'unavailable'],
    [500, 'error'],
  ] as const)('maps HTTP %i to %s', async (status, expected) => {
    const { result } = renderHook(() => useResource(['t', status], failingWith(status)), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe(expected));
  });

  it('is ready with the data once the fetcher resolves', async () => {
    const { result } = renderHook(() => useResource(['ok'], () => Promise.resolve(42)), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toBe(42);
  });
});

/**
 * WHAT A SCREEN IS TOLD WHEN A *BACKGROUND* REFRESH FAILS.
 *
 * The first load failing is covered above and by every screen's error state.
 * The case nobody had asked about is the second one: the query already HAS
 * data, a refresh is triggered — by a mutation, an invalidation, a poll, a
 * window focus — and that refresh fails.
 *
 * TanStack keeps such a query in `status: 'success'` with EVERY observable
 * field clean (measured in both apps: `failureCount 0`, `errorUpdateCount 0`,
 * `error null`), so `useResource` reported `ready`, `AsyncBoundary` rendered
 * the happy branch, and the screen showed stale rows with nothing saying so.
 * On a money screen that is a BALANCE that is not the balance.
 *
 * `refreshFailed` is the signal that case never had.
 */
/*
 * ONE client for the whole block, created OUTSIDE the component.
 *
 * The wrapper above builds a `new QueryClient()` in its render body, which is
 * harmless for a hook that never re-renders its own tree — and wrong for these
 * three, because `refreshFailed` is React state: raising it re-renders, the
 * wrapper runs again, and a fresh QueryClient arrives with an empty cache. The
 * query then looks like a first load that failed, `status` reads `error`
 * instead of `ready`, and the test reports the product broken when the fixture
 * is. Measured: raw `useQuery` reports `success` in the same scenario.
 */
const staleClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function staleWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={staleClient}>{children}</QueryClientProvider>;
}

describe('useResource reports a failed background refresh', () => {
  it('stays `ready`, keeps the data, and RAISES refreshFailed', async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<{ balance: string }>>()
      .mockResolvedValueOnce({ balance: '700.00' })
      .mockRejectedValue(new Error('the endpoint is down'));

    const { result } = renderHook(
      () => useResource(['wallet', 'a'], (s) => fetcher(s), { retry: 0 }),
      {
        wrapper: staleWrapper,
      },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.refreshFailed).toBe(false);

    await act(async () => {
      await result.current.refetch();
    });

    // Both halves are the point. The screen must keep SHOWING the last good
    // answer — blanking a balance is the failure this project has shipped twice
    // — and it must now be able to SAY that is what it is doing.
    await waitFor(() => expect(result.current.refreshFailed).toBe(true));
    // Both halves are the point: the screen must KEEP the last good answer —
    // blanking a balance is the failure this project has shipped twice — and it
    // must now be able to SAY that is what it is showing.
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual({ balance: '700.00' });
  });

  it('clears the moment a refresh succeeds again', async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<{ balance: string }>>()
      .mockResolvedValueOnce({ balance: '700.00' })
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ balance: '750.00' });

    const { result } = renderHook(
      () => useResource(['wallet', 'b'], (s) => fetcher(s), { retry: 0 }),
      {
        wrapper: staleWrapper,
      },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    /*
     * `waitFor`, not a bare assertion, and the reason is the measurement that
     * produced this flag: the observer SNAPSHOT lags the query. Read straight
     * after a failed refetch it still says success, and only the next render
     * carries the error. Asserting synchronously here reads the stale snapshot
     * and fails for a reason that has nothing to do with the property.
     */
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.refreshFailed).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.refreshFailed).toBe(false));
    expect(result.current.data).toEqual({ balance: '750.00' });
  });

  it('does NOT raise it when the FIRST load fails — that is an error, not staleness', async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<unknown>>()
      .mockRejectedValue(new Error('down'));

    const { result } = renderHook(
      () => useResource(['wallet', 'c'], (s) => fetcher(s), { retry: 0 }),
      {
        wrapper: staleWrapper,
      },
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    /*
     * A screen with nothing to show is an ERROR and says so. Reporting it as
     * stale as well would let a screen render "showing you the last known
     * balance" over no balance at all — which is the invented number the wallet
     * rules exist to prevent, arrived at through the control meant to warn
     * about it.
     */
    expect(result.current.refreshFailed).toBe(false);
  });
});
