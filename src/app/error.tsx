'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * What a render-time throw looks like, instead of nothing.
 *
 * There was no `error.tsx` anywhere in this app, so any throw inside a client
 * page escaped to Next's default `global-error` — a bare, unstyled page rendered
 * OUTSIDE the console shell, with no navigation, no sign-out and no route back
 * to `/login`. On an internal tool that is a dead end reached by a stack trace.
 *
 * `reset()` re-renders the segment, which recovers the common case of a
 * transient failure during data load without a full reload. The link is the
 * escape hatch for when it does not.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <h1 className="text-lg font-bold text-foreground">{t('error.title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('error.body')}</p>
      {/*
       * The digest, not the message. Next replaces the message with a generic
       * string in production anyway, and the digest is the value that ties this
       * screen to a server log line — the one thing worth quoting in a report.
       */}
      {error.digest && (
        <p className="font-mono text-[11px] text-muted-foreground">{error.digest}</p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="text-sm font-semibold text-link hover:underline focus-outline rounded-sm"
        >
          {t('session.retry')}
        </button>
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-link hover:underline focus-outline rounded-sm"
        >
          {t('session.backToDashboard')}
        </Link>
      </div>
    </div>
  );
}
