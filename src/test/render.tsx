import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

/**
 * Renders a screen with the providers it needs in the app.
 *
 * TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
 *
 * The QueryClient here deliberately differs from the app's in two ways:
 *
 *  - `retry: false`, so a test asserting an error state sees it immediately
 *    rather than after the app's back-off, and a failing request does not stall
 *    the test for seconds.
 *  - `staleTime: 0`, so each test starts from a cold cache. A shared cache across
 *    tests is the classic source of "passes alone, fails in the suite".
 */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Providers({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return render(ui, { wrapper: Providers });
}
