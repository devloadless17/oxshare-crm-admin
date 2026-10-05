'use client';

import * as React from 'react';
import { AlertCircle, KeyRound, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminSignInChallenge, AdminTotpSetup } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';

/**
 * The second half of every admin sign-in (0191): a 6-digit code from an
 * authenticator app — Google Authenticator, Microsoft Authenticator, Authy,
 * 1Password, any of them. Required for every administrator.
 *
 * Shared by `/login` and `/invite/accept`, which both end with a challenge
 * rather than a session:
 *
 *  - `step: 'totp_setup'` — no app yet. Shows the QR code to scan (and the
 *    secret as text, for a phone that cannot scan), then asks for the first
 *    code. A right code confirms the app AND signs in.
 *  - `step: 'totp'` — the app is set up; ask for the code it shows now.
 *
 * `onSignedIn` runs once the server has set the session cookies.
 */
export function AuthenticatorStep({
  challenge,
  onSignedIn,
  onStartOver,
}: {
  challenge: AdminSignInChallenge;
  onSignedIn: () => Promise<void> | void;
  onStartOver: () => void;
}) {
  const enrolling = challenge.step === 'totp_setup';
  const [setup, setSetup] = React.useState<AdminTotpSetup | null>(null);
  const [setupError, setSetupError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const codeInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!enrolling) return;
    let cancelled = false;
    api.auth
      .totpSetup(challenge.challengeToken)
      .then((data) => {
        if (!cancelled) setSetup(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSetupError(apiErrorMessage(err, t('totp.setupFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, [enrolling, challenge.challengeToken]);

  React.useEffect(() => {
    if (!enrolling || setup) codeInput.current?.focus();
  }, [enrolling, setup]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) {
      setError(t('totp.sixDigits'));
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      await api.auth.totpVerify(challenge.challengeToken, digits);
      await onSignedIn();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('totp.failed')));
      setCode('');
      codeInput.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  if (enrolling && setupError) {
    return (
      <div className="space-y-4 text-center">
        <p
          role="alert"
          className="flex items-start justify-center gap-2 text-sm text-muted-foreground"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span>{setupError}</span>
        </p>
        <Button variant="outline" onClick={onStartOver} className="w-full">
          {t('totp.startOver')}
        </Button>
      </div>
    );
  }

  if (enrolling && !setup) {
    return <PageLoader label={t('totp.preparing')} className="min-h-0" />;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="flex items-center justify-center gap-2 text-base font-semibold text-foreground">
          {enrolling ? (
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          ) : (
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          )}
          {enrolling ? t('totp.setupTitle') : t('totp.codeTitle')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {enrolling ? t('totp.setupBody') : t('totp.codeBody')}
        </p>
      </div>

      {enrolling && setup && (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
            <li>{t('totp.stepInstall')}</li>
            <li>{t('totp.stepScan')}</li>
            <li>{t('totp.stepType')}</li>
          </ol>
          {/*
           * An <img>, not inline markup: the SVG comes from the API, and as an
           * image it can draw nothing but pixels. White behind it in both
           * themes — phone cameras read dark-on-light.
           */}
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI
                generated per sign-in; next/image has nothing to optimise. */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`}
              alt={t('totp.qrAlt')}
              width={200}
              height={200}
              className="rounded-lg border border-border bg-white p-2"
            />
          </div>
          <div className="space-y-1 text-center">
            <p className="text-xs text-muted-foreground">{t('totp.manualEntry')}</p>
            <p
              className="select-all break-all font-mono text-sm tracking-wider text-foreground"
              data-testid="totp-secret"
            >
              {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('totp.account', { account: setup.account })}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="totp-code">{t('totp.codeLabel')}</Label>
          <Input
            ref={codeInput}
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123 456"
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(e.target.value.replace(/[^\d ]/g, ''));
            }}
            className="text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>
        <Button type="submit" loading={verifying} className="w-full">
          <span>{verifying ? t('totp.verifying') : t('totp.verify')}</span>
        </Button>
        <button
          type="button"
          onClick={onStartOver}
          className="focus-outline w-full rounded-sm text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {t('totp.startOver')}
        </button>
      </form>
    </div>
  );
}
