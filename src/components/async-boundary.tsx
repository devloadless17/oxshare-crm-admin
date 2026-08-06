'use client';

// NEAR-TWIN of the same path in oxshare-crm-client: same props, same four branches.
// Excluded from scripts/check-twins.sh because the loading state uses a
// different component in each app. Keep the props and the branch behaviour in
// step by hand.
import { Loader } from '@/components/ui/loader';
import { BackendPending } from '@/components/backend-pending';
import type { ResourceStatus } from '@/hooks/use-resource';
import { t } from '@/lib/i18n';
import { apiErrorMessage, apiErrorRequestId } from '@/lib/api/errors';

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
  error,
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
   * makes every `onRetry={refetch}` a no-misused-promises error and invites a
   * `void` at seven call sites to silence it. Ignoring the result is the real
   * contract, so the type says so once, here.
   */
  onRetry: () => unknown;
  errorMessage?: string;
  /**
   * The raw error, only so the request id can be shown under the message.
   *
   * Passed as the error rather than as an extracted id because every call site
   * already holds it — asking each one to call `apiErrorRequestId` first would
   * be a second thing to remember, and the one that forgot would be silently
   * back to an unreportable failure.
   */
  error?: unknown;
  children: React.ReactNode;
}) {
  if (status === 'loading') {
    return <Loader text={label} fullPage />;
  }

  if (status === 'unavailable') return <BackendPending endpoints={endpoints} />;

  /*
   * A 403 is a closed door, not a broken page — R-2.3.
   *
   * It used to fall into the branch below, which offers "something went wrong"
   * and a Retry button. Retrying a permission failure cannot succeed, so the
   * admin clicks it, watches it fail again, and reports a bug against a system
   * that is working exactly as configured. No retry here, and no request id:
   * there is nothing for support to look up, only a role to change.
   */
  if (status === 'forbidden') {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-2"
        role="alert"
      >
        <p className="text-sm font-semibold text-foreground">{t('session.deniedTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('session.deniedBody')}</p>
      </div>
    );
  }

  if (status === 'error') {
    const requestId = apiErrorRequestId(error);
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-3"
        role="alert"
      >
        <p className="text-sm text-muted-foreground">
          {/*
           * The API's OWN message when it sent one, and the generic line only
           * as a fallback.
           *
           * R-2.5 requires an unrecognised filter or sort to be a 400 rather
           * than a silently empty list, precisely so the operator learns what
           * they got wrong — and this component was throwing that sentence
           * away and printing "Failed to load clients." instead. A validation
           * error the user cannot read is a 400 with the usefulness of a 500.
           *
           * `apiErrorMessage` falls back to the caller's line for a 500, where
           * the server's message is not something to show anybody.
           */}
          {apiErrorMessage(error, errorMessage ?? 'Something went wrong loading this page.')}
        </p>
        {/*
          The id the API already logged with this failure. Rendered small and
          selectable rather than hidden behind a "details" toggle: its whole
          purpose is to be copied into a support message, and a user who has to
          find it first mostly will not.
        */}
        {requestId && (
          <p className="text-[11px] font-mono text-muted-foreground/70 select-all">
            {t('common.errorReference', { id: requestId })}
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="h-9 px-4 rounded-lg border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.retryShort')}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
