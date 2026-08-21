// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
