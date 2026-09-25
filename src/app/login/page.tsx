'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { useAdmin } from '@/context/AdminAuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/errors';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated';
import { t } from '@/lib/i18n';

function AdminLoginForm() {
  const router = useRouter();
  // `next` is written by proxy.ts when it bounces a signed-out operator.
  const searchParams = useSearchParams();
  const { refetchAdmin } = useAdmin();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError(t('login.missingFields'));
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.login({ email, password });

      /*
       * Refetch the session BEFORE navigating.
       *
       * `AdminAuthContext` holds `GET /admin/auth/me` in a React Query with
       * `retry: false` and a 5-minute staleTime. On the login screen that query
       * has already run and failed with a 401, and that failure is cached.
       * `router.push` is a client-side navigation — it does not remount the
       * provider — and `router.refresh()` only re-runs Server Components, not a
       * client query. So the dashboard rendered with `admin: null` until a
       * manual reload.
       *
       * That bug predates the nav-gating change but was invisible: the sidebar
       * used to fall back to showing EVERY item while `admin` was null, so it
       * looked complete and only a sub-admin would ever have noticed. Once the
       * nav correctly renders nothing until identity is known, an unrefetched
       * session shows as an empty sidebar.
       *
       * `invite/accept` hit the same wall and solved it with a full page load,
       * documenting that "a client-side push renders the shell with admin:
       * null". Refetching is the smaller fix: it keeps the SPA navigation and
       * uses the mechanism the context already exposes.
       */
      /*
       * And do not navigate if that refetch FAILED.
       *
       * `refetchAdmin` is `invalidateQueries`, which resolves even when the
       * refetch behind it errors — so a transient failure on `/admin/auth/me`
       * immediately after a successful sign-in still pushed to the destination,
       * landing the operator in the layout's "no admin" state after an
       * apparently successful login.
       */
      const identity = await refetchAdmin();
      if (!identity) {
        setError(t('login.sessionCheckFailed'));
        return;
      }
      /*
       * Back where they were going, or the dashboard.
       *
       * `safeReturnTo` is not decoration here: `next` comes out of a URL, so it
       * is attacker-controlled even though we wrote it. Anyone can send an
       * operator a link to `/login?next=https://evil.example/login`, and a
       * console that follows it after a successful sign-in has handed over a
       * phishing page wearing its own flow — at the exact instant after the
       * password was typed. The validator resolves through `URL` against an
       * opaque origin rather than pattern-matching, because the browser's
       * parser is the authority on what a string navigates to.
       */
      router.push(safeReturnTo(searchParams.get(RETURN_TO_PARAM)));
    } catch (err: unknown) {
      // This was a line-for-line reimplementation of apiErrorMessage, array join
      // included. One copy, in lib/api/errors.ts.
      setError(apiErrorMessage(err, t('login.failed')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 overflow-y-auto">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-2 text-center">
          {/*
            The brand's own WORDMARK, with the console named beneath it. This
            was the mark with "OXShare" TYPED beside it in the UI font — an
            approximation of the logo next to the logo, the same defect the
            portal's KYC header was reported for (25 Sep 2026). Drawn inline
            (brand-logo.tsx); its title makes the heading read "OXShare Admin".
          */}
          <h1 className="flex flex-col items-center gap-2">
            <BrandLogo title={t('app.name')} className="h-12 w-auto" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t('app.adminSuffix')}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground">{t('login.subtitle')}</p>
        </div>

        {/* Login Form Card */}
        <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('login.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('login.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  /* Icon-only, so it is named — the portal's toggle always was, and
                     this one was announced as a bare "button" (ux-sweep). */
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus-outline rounded-sm"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" loading={isLoading} className="w-full">
              {isLoading ? <span>{t('login.submitting')}</span> : <span>{t('login.submit')}</span>}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

/**
 * `useSearchParams()` needs a Suspense boundary, and this is where it goes.
 *
 * The form reads `?next=`, and so does `RedirectIfAuthenticated`. Without a
 * boundary this built only because the root layout is `async` and reads
 * `headers()` for the CSP nonce, which forces every route dynamic — so moving
 * the nonce anywhere else would turn the one page an unauthenticated visitor
 * definitely loads into a hard build failure. `clients/page.tsx` and
 * `invite/accept/page.tsx` both wrap it for the same reason.
 */
/*
 * The boundary's fallback is a LOADER rather than `null`.
 *
 * `null` renders nothing at all while it resolves, so the sign-in screen — the
 * one page an unauthenticated visitor definitely loads — showed a blank until
 * it did. `fullScreen` matches what `RedirectIfAuthenticated` paints a moment
 * later for an operator who turns out to be signed in, so the two states are
 * the same screen rather than a blank followed by a spinner.
 */
export default function AdminLoginPage() {
  return (
    <React.Suspense fallback={<PageLoader label={t('common.loading')} fullScreen />}>
      <RedirectIfAuthenticated>
        <AdminLoginForm />
      </RedirectIfAuthenticated>
    </React.Suspense>
  );
}
