'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { useAdmin } from '@/context/AdminAuthContext';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { AuthenticatorStep } from '@/components/auth/authenticator-step';
import type { AdminSignInChallenge } from '@/lib/api/auth';

/**
 * Set a password and activate an invited administrator account.
 *
 * ## It is the sign-in screen's twin, not a card of its own
 *
 * This page and `/login` are the two things a person meets before they have a
 * session, and they used to look like they came from different products: this
 * one was a rounded 24px card with a fade-in animation, an emoji, a pill badge
 * and 160 lines of `<style jsx>` — its own input, its own button, its own error
 * box, its own spinner. None of that tracked the theme tokens the rest of the
 * console uses, so it drifted every time they changed.
 *
 * It is now the same shape as `/login`: the brand mark, a heading, and the form
 * directly on the background — no card and no shadow — built from the same
 * `Input`, `Label` and `Button` every other form in this app uses. A theme
 * toggle sits in the corner because a visitor here has no console chrome to
 * change it from, and the OS preference may not be the one they want to read a
 * password field in.
 *
 * ## The token is checked BEFORE the form is offered
 *
 * `GET /admin/invite/validate` runs first, and the password fields render only
 * once it answers. An expired, revoked or mistyped token gets a stated failure
 * instead of a form that collects a password and then rejects it — and because
 * validation is a query rather than an effect writing into the form's own error
 * state, a bad token and a bad password can never be reported through the same
 * box.
 */
function AcceptInviteContent() {
  const params = useSearchParams();
  const { admin, isLoading: sessionLoading } = useAdmin();
  const token = params.get('token') ?? '';

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  /*
   * ACCEPTED, and on the way out — the flag that stops this screen calling a
   * good invite invalid at the last moment.
   *
   * `window.location.assign` does not tear the page down synchronously, and the
   * line before it scrubs the spent token out of the URL. Next patches
   * `history.replaceState` to keep the router in step, so `useSearchParams`
   * re-renders this component with no `token` — which lands in the `token === ''`
   * branch below and paints "Invalid invite link." over a successful activation,
   * for however long the navigation takes. The invite worked; the screen was
   * reading a URL it had just emptied on purpose.
   *
   * Not solvable by scrubbing later: the token must leave the address bar, and
   * every ordering puts a render between that and the navigation. A state that
   * says "this succeeded" is the thing the render actually needs to know.
   */
  const [accepted, setAccepted] = React.useState(false);
  /*
   * The account exists; the authenticator comes next (0191 — required for
   * every administrator, the newcomer included). Accept answers with the same
   * challenge a right password buys at /login, and no session until the code.
   */
  const [challenge, setChallenge] = React.useState<AdminSignInChallenge | null>(null);
  const [signedIn, setSignedIn] = React.useState(false);

  // Validating the token is a fetch, not an effect that assigns state. The old
  // version wrote the failure into the same `error` box the password form uses,
  // so a bad token and a bad password were indistinguishable.
  const validation = useQuery({
    queryKey: keys.invite.one(token),
    // Typed against the generated schema. This route carried no @ApiOkResponse,
    // so its shape was hand-written here — outside the one mechanism that stops
    // these two repos drifting apart. The backend now publishes it.
    queryFn: () => api.admin.validateInvite(token),
    enabled: token !== '',
    retry: false,
  });

  const invite = validation.data ?? null;
  const validating = token !== '' && validation.isPending;

  /*
   * Accepting an invite REPLACES whoever is signed in, and used to do it in
   * silence.
   *
   * `POST /admin/invite/accept` sets a fresh admin session on its response, so
   * an operator who opens a forwarded invite — or who is helping a colleague set
   * up at their own desk, which is the realistic case — is signed out and
   * replaced by the new account with no warning at any point. Their own
   * refresh-token family is not revoked either: it stays live for thirty days,
   * orphaned, and appears in no UI.
   *
   * Refusing outright would be wrong: the invitee may legitimately be using a
   * shared machine. So the page says plainly what is about to happen and makes
   * signing out first the obvious move.
   */
  const signedInAsSomeoneElse = !sessionLoading && admin !== null;
  /*
   * An absent token and a rejected one are DIFFERENT failures and say so. A
   * link truncated by a mail client loses the query string entirely, and
   * "invalid or expired" would send that person hunting for a fresh invite when
   * the one they hold is fine.
   */
  const inviteError = accepted
    ? // Nothing about the link can be wrong once it has been spent — see
      // `accepted`. Suppressed here rather than at the render site so no
      // future branch can reintroduce the flash.
      ''
    : token === ''
      ? t('invite.invalidLink')
      : validation.isError
        ? apiErrorMessage(validation.error, t('invite.expired'))
        : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(t('invite.tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('invite.mismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await api.admin.acceptInvite(token, password);
      // BEFORE the scrub below, which is what empties the URL this component
      // re-reads. See the note on `accepted`.
      setAccepted(true);
      setChallenge(result);
      /*
       * Take the token out of the address bar NOW — once it is spent.
       *
       * It is a bearer credential that creates an admin account, it arrives in a
       * query string because it came from an emailed link, and leaving it in the
       * URL puts it into browser history and autocomplete. So it still gets
       * removed; what changed is WHEN.
       *
       * It used to be scrubbed on mount, and that quietly destroyed the invite:
       * `history.replaceState` rewrites the current history entry, so a RELOAD
       * reloaded the scrubbed URL, found no token, and showed "invalid link" to
       * somebody holding a good invite — with no way back except the original
       * email. Reloading a form-filling page is not an edge case; browsers do it
       * on tab restore and people do it when a page looks stuck.
       *
       * The trade, stated plainly: while the form is open the token remains in
       * the URL, so an invite abandoned half-way leaves it in history until it
       * expires (48 hours, single use). Scrubbing after acceptance means the
       * entry that survives is a SPENT token, which is worth nothing. That is
       * the better side of the trade, and it is the only version in which
       * reloading works.
       */
      window.history.replaceState(null, '', window.location.pathname);
      setLoading(false);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('invite.failed')));
      setLoading(false);
    }
  };

  /** After the authenticator code: the session cookies are set. */
  const enterConsole = () => {
    setSignedIn(true);
    // Full navigation instead of router.push so AdminAuthContext boots fresh
    // with the new session; a client-side push renders the shell with admin: null.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/dashboard');
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 overflow-y-auto">
      {/*
       * A visitor here has no console chrome to change the theme from, and the
       * OS preference is not always the one someone wants to type a password
       * into. Same position as the sign-in screen's.
       */}
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          {/*
            The brand's own WORDMARK, with the console named beneath it. This
            was the mark with "OXShare" TYPED beside it in the UI font — an
            approximation of the logo next to the logo, the same defect the
            portal's KYC header was reported for (25 Sep 2026). Drawn inline
            (brand-logo.tsx); its title makes the heading read "OXShare Admin".
          */}
          <h1 className="flex flex-col items-center gap-2">
            <BrandLogo title={t('app.name')} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t('app.adminSuffix')}
            </span>
          </h1>
        </div>

        {signedIn ? (
          // The session is set; the browser is on its way to the dashboard.
          <PageLoader label={t('invite.redirecting')} className="min-h-0" srOnly={false} />
        ) : accepted && challenge ? (
          /*
           * The account exists and the invite is spent — re-rendering the
           * password form here would invite a second submit against a dead
           * token. What is left is the authenticator. Starting over means the
           * ordinary sign-in, with the password just chosen.
           */
          <AuthenticatorStep
            challenge={challenge}
            onSignedIn={enterConsole}
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onStartOver={() => window.location.assign('/login')}
          />
        ) : validating ? (
          // The shared loader, so this screen spins the same way as every other
          // one. `min-h-[60vh]` would push the mark off a short viewport, and
          // the page is already centred, so it only needs the mark and label.
          <PageLoader label={t('invite.validating')} className="min-h-0" />
        ) : inviteError ? (
          <div className="space-y-2 text-center">
            <h2 className="text-base font-semibold text-foreground">{t('invite.invalidTitle')}</h2>
            <p
              className="flex items-start justify-center gap-2 text-sm text-muted-foreground"
              role="alert"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span>{inviteError}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1 text-center">
              <h2 className="text-base font-semibold text-foreground">
                {t('invite.welcome', { name: invite?.name ?? '' })}
              </h2>
              <p className="text-xs text-muted-foreground">{t('invite.body')}</p>
              {/* The address the invite was sent to, so somebody activating on a
                  shared machine can see WHOSE account they are creating. */}
              <p className="font-mono text-xs text-link">{invite?.email}</p>
            </div>

            {/*
             * Somebody else is signed in on this browser, and accepting will
             * replace them. Said out loud rather than done silently — see the
             * note above `signedInAsSomeoneElse`.
             */}
            {signedInAsSomeoneElse && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('invite.sessionWarning', { email: admin?.email ?? '' })}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">{t('invite.newPassword')}</Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={t('invite.passwordHint')}
                    value={password}
                    onChange={(e) => {
                      setError('');
                      setPassword(e.target.value);
                    }}
                    className="ps-9 pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                    // Both fields follow this one toggle, so the label is plural
                    // — it is describing what the button does, not this field.
                    aria-label={
                      showPassword ? t('invite.hidePasswords') : t('invite.showPasswords')
                    }
                    className="focus-outline absolute end-3 top-2.5 rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">{t('invite.confirmPassword')}</Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={t('invite.repeatPassword')}
                    value={confirm}
                    onChange={(e) => {
                      setError('');
                      setConfirm(e.target.value);
                    }}
                    className="ps-9"
                  />
                </div>
              </div>

              {/*
               * No `required` on either field: the form's own "too short" and
               * "do not match" branches are the ones that must run, and native
               * validation would block submit before they could — which is
               * exactly how the old version made its own messages unreachable.
               */}
              {/* `loading` brings the disable and `aria-busy` with it — see
                  ui/button.tsx — so both hand-written attributes are gone. */}
              <Button type="submit" loading={loading} className="w-full">
                {loading ? (
                  <span>{t('invite.submitting')}</span>
                ) : (
                  <span>{t('invite.submit')}</span>
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <PageLoader label={t('invite.loadingParams')} className="min-h-0" />
        </div>
      }
    >
      <AcceptInviteContent />
    </React.Suspense>
  );
}
