'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { googleStartUrl } from '@/lib/api/auth';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';

/** Google's four-colour "G", inline so the sign-in screen loads no third-party asset. */
export function GoogleMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Whether the API offers Google sign-in. A failed or pending check reads as
 * "not offered" — the password form is always there, so hiding a button that
 * might not work is the safe direction.
 */
export function useGoogleSignInEnabled(): boolean {
  const status = useQuery({
    queryKey: keys.session.googleStatus(),
    queryFn: ({ signal }) => api.auth.googleStatus(signal),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return status.data?.enabled === true;
}

/**
 * "Continue with Google" — a full-page navigation to the API, never a fetch.
 * See `googleStartUrl` for why the round trip has to run on the API's host.
 */
export function GoogleSignInButton({
  next,
  invite,
  label = t('google.continue'),
}: {
  next?: string;
  invite?: string;
  label?: string;
}) {
  const [leaving, setLeaving] = React.useState(false);
  return (
    <button
      type="button"
      disabled={leaving}
      aria-busy={leaving}
      onClick={() => {
        setLeaving(true);
        window.location.assign(googleStartUrl({ next, invite }));
      }}
      className="focus-outline inline-flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-input bg-white px-4 text-sm font-medium text-[#1f1f1f] shadow-xs hover:bg-[#f8f9fa] disabled:opacity-60 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f20]"
    >
      <GoogleMark />
      <span>{leaving ? t('google.redirecting') : label}</span>
    </button>
  );
}

/** The thin "or" rule between the two ways in. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {t('google.or')}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
