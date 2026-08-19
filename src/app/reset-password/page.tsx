'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { PageLoader } from '@/components/ui/loader';

/**
 * Where an admin password-reset link lands — DECISIONS D-44.
 *
 * Reachable WITHOUT a session by definition: the person here is an
 * administrator who cannot sign in. That is why `/reset-password` is in
 * `proxy.ts`'s public list, and why the completion endpoint is declared in the
 * backend's `PUBLIC_ROUTES` with its reason.
 *
 * There is no "request a reset" form anywhere in this console, deliberately.
 * Self-service would make an admin's mailbox the root of trust for an account
 * that approves payouts; a second administrator arms this link instead, and the
 * API refuses anyone reaching above their own privilege level.
 */
function ResetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();

  /*
   * Captured ONCE, before the effect below scrubs it from the address bar.
   *
   * The invite screen learned this the hard way: reading the token from
   * `useSearchParams()` on every render meant a reload found nothing and showed
   * "invalid link" to somebody holding a perfectly good one. A lazy initialiser
   * runs on mount, while the value still exists.
   */
  const [token] = useState(() => params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  /*
   * Take the token out of the URL once it has been read.
   *
   * It is a bearer credential that sets an administrator's password, and it
   * arrives in a query string because it came from an email — that part is
   * unavoidable. What is avoidable is leaving it in browser history, in
   * autocomplete, and on screen during a screen-share.
   */
  useEffect(() => {
    if (token === '') return;
    window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here purely so the person is told before a round trip. The API
    // enforces the length itself and its answer is the one that counts.
    if (password !== confirm) {
      setError(t('resetPassword.mismatch'));
      return;
    }

    setBusy(true);
    try {
      await api.admin.completePasswordReset(token, password);
      setDone(true);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('resetPassword.failed')));
    } finally {
      setBusy(false);
    }
  };

  if (token === '') {
    return (
      <Card>
        <h1 className="text-lg font-bold">{t('resetPassword.noTokenTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('resetPassword.noTokenBody')}</p>
        <SignInLink />
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <h1 className="text-lg font-bold">{t('resetPassword.doneTitle')}</h1>
        {/*
          Says that other sessions ended. Completing a reset revokes every
          session for this admin, and somebody who was signed in on a second
          machine should learn that here rather than discover it as a fault.
        */}
        <p className="mt-2 text-sm text-muted-foreground">{t('resetPassword.doneBody')}</p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="mt-5 h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground focus-outline"
        >
          {t('resetPassword.goToSignIn')}
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-lg font-bold">{t('resetPassword.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('resetPassword.subtitle')}</p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <form className="mt-5 space-y-4" onSubmit={(e) => void submit(e)}>
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-xs font-semibold">
            {t('resetPassword.newPassword')}
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-xs font-semibold">
            {t('resetPassword.confirmPassword')}
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-outline"
        >
          {busy ? t('resetPassword.saving') : t('resetPassword.submit')}
        </button>
      </form>

      <SignInLink />
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground overflow-y-auto">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}

/**
 * The way out — every state has one.
 *
 * A dead link with no exit is the trap the portal's verify-email screen was, and
 * unlike an invitee this person DOES have an account, so sign-in is somewhere
 * real to send them.
 */
function SignInLink() {
  return (
    <p className="mt-5 border-t border-border pt-4 text-center text-xs">
      <Link href="/login" className="font-semibold text-link hover:underline focus-outline">
        {t('resetPassword.backToSignIn')}
      </Link>
    </p>
  );
}

export default function ResetPasswordPage() {
  // `useSearchParams` needs a Suspense boundary in the app router.
  return (
    // The shared loader rather than `null`, which showed a blank screen while
    // the boundary resolved — see the note on app/login/page.tsx.
    <Suspense fallback={<PageLoader label={t('common.loading')} fullScreen />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
