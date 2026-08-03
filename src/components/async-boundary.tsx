'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.
import { Loader2 } from 'lucide-react';
import { BackendPending } from '@/components/backend-pending';
import type { ResourceStatus } from '@/hooks/use-resource';

/**
 * The loading / not-built-yet / error / ready branch that eight pages each
 * spelled out by hand — with drifting copy, and one page rendering a 403 as
 * "check your connection".
 */
export function AsyncBoundary({
  status,
  label,
  endpoints,
  onRetry,
  errorMessage,
  children,
}: {
  status: ResourceStatus;
  /** Screen-reader text for the spinner, e.g. "Loading ledger". */
  label: string;
  /** Endpoints named in the not-implemented-yet state. */
  endpoints: string[];
  /**
   * `unknown`, not `void`: callers pass React Query's `refetch`, which returns a
   * promise this component deliberately does not await. Typing it `() => void`
   * made every `onRetry={refetch}` a no-misused-promises error and invited a
   * `void` at seven call sites to silence it. Ignoring the result is the real
   * contract, so the type says so once, here.
   */
  onRetry: () => unknown;
  errorMessage?: string;
  children: React.ReactNode;
}) {
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-link" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (status === 'unavailable') return <BackendPending endpoints={endpoints} />;

  if (status === 'error') {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-3"
        role="alert"
      >
        <p className="text-sm text-muted-foreground">
          {errorMessage ?? 'Something went wrong loading this page.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
