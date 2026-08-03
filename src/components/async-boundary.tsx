'use client';

import { Loader } from '@/components/ui/loader';
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
  onRetry: () => void;
  errorMessage?: string;
  children: React.ReactNode;
}) {
  if (status === 'loading') {
    return (
      <Loader text={label} fullPage />
    );
  }

  if (status === 'unavailable') return <BackendPending endpoints={endpoints} />;

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3" role="alert">
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
