import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { Toaster } from '@/components/ui/toaster';

/**
 * Renders a screen with the providers it needs in the app.
 *
 * NEAR-TWIN of the same path in oxshare-crm-client: the QueryClient below is
 * identical and the admin copy adds `ConfirmProvider`. The file is not listed
 * in `scripts/check-twins.sh`, so the extra provider is not reported as drift —
 * the portal has no confirm dialog to mirror yet. Build one there and this
 * wrapper goes back to being identical.
 *
 * ## Why ConfirmProvider is here and AdminAuthProvider is not
 *
 * They are different kinds of context. `useAdmin` is the identity a test is
 * asserting ABOUT, so a test mocks it and states which admin it means; one that
 * inherited an identity from this wrapper would be asserting against whatever
 * the provider happened to supply. `useConfirm` is infrastructure the screen
 * needs in order to mount at all: `confirm-dialog.tsx` throws without a host
 * rather than returning a stub that resolves `true` — deliberately, so a
 * missing provider fails loudly instead of silently confirming every
 * destructive action. Left out here, that hard failure lands on every test of
 * every screen that can delete something, which is a broken harness rather than
 * a finding.
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
    return (
      <QueryClientProvider client={client}>
        <ConfirmProvider>
          {children}
          {/*
           * The toast HOST, for the same reason as the dialog above: since
           * `lib/toast.ts` landed, "the save succeeded" and "the API refused,
           * here is why" are things a screen says through a toast rather than
           * through a banner it renders itself. Without a host mounted those
           * sentences exist only inside sonner's store, and a test asserting
           * what the operator is told finds an empty document.
           */}
          <Toaster />
        </ConfirmProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Providers });
}
