'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * `@tanstack/react-query` was a dependency with zero imports while every page
 * hand-rolled useEffect + axios: no cancellation, no race guard, no cache. The
 * visible symptom was in /clients — typing fired one request per keystroke and
 * a slow early response reliably overwrote a fresh late one.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A 404 means the endpoint does not exist yet and a 4xx means the
            // request was wrong — retrying either just burns time. Retry only
            // what a retry can actually fix.
            retry: (failureCount, error: unknown) => {
              const status = (error as { response?: { status?: number } })?.response?.status;
              if (status !== undefined && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
