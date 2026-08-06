'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Mail, Send, ShieldAlert } from 'lucide-react';
import { adminApi, type SmtpSettings } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { t } from '@/lib/i18n';

/**
 * The mail server — the Email tab. Master admin only.
 *
 * ── Why this one is not a permission ───────────────────────────────────────
 *
 * The download links next door are `settings.manage`, because a download URL is
 * routine content. This is the opposite call, matching the security controls:
 * whoever controls the SMTP relay receives every password-reset link and every
 * admin-invite link this system sends, and an invite link turns into a live
 * admin account. Repointing SMTP is therefore a path to administrator on a
 * system that approves withdrawals. The API refuses a non-master regardless
 * (403) — this panel simply does not offer a control that would always fail.
 *
 * ── The password is write-only, and the UI says so ─────────────────────────
 *
 * The API never returns it, so there is nothing to prefill. Rendering a fake row
 * of dots would be worse than an empty box: it implies a value the operator can
 * edit in place, when in fact anything they type REPLACES it. So the field is
 * empty, the hint says what empty means, and removing the password is a separate
 * explicit checkbox rather than a side effect of clearing the field.
 *
 * ── The test button sends what is SAVED ────────────────────────────────────
 *
 * Not what is on screen. The endpoint reads the stored row, so testing with
 * unsaved edits would report on a configuration the operator is not looking at.
 * Rather than silently saving first — which would persist a half-finished
 * config to run a diagnostic — the panel says so and leaves the choice with
 * them.
 */
export function SmtpSettingsPanel() {
  const settings = useResource<SmtpSettings>(['smtp-settings'], () => adminApi.getSmtpSettings());

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('smtp.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('smtp.subtitle')}</p>
      </header>

      <AsyncBoundary
        status={settings.status}
        label={t('smtp.loading')}
        endpoints={['GET /admin/settings/smtp']}
        onRetry={() => void settings.refetch()}
        errorMessage={apiErrorMessage(settings.error, t('smtp.loadFailed'))}
        error={settings.error}
      >
        {settings.data && <SmtpForm settings={settings.data} />}
      </AsyncBoundary>
    </section>
  );
}

function SmtpForm({ settings }: { settings: SmtpSettings }) {
  const [host, setHost] = React.useState(settings.host);
  const [port, setPort] = React.useState(String(settings.port));
  const [username, setUsername] = React.useState(settings.username ?? '');
  const [password, setPassword] = React.useState('');
  const [clearPassword, setClearPassword] = React.useState(false);
  const [fromAddress, setFromAddress] = React.useState(settings.fromAddress);
  const [secure, setSecure] = React.useState(settings.secure);

  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const touched = () => {
    setError(null);
    setTestResult(null);
    setTestError(null);
  };

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateSmtpSettings({
        host: host.trim(),
        /*
         * Parsed through a helper rather than `Number(port) || 587`. That idiom
         * turns a typo into the fallback silently, and on a field that decides
         * whether mail is delivered at all, "it quietly used 587" is a worse
         * outcome than a validation error from the server.
         */
        port: parsePort(port),
        username: username.trim() || null,
        /*
         * The three-state password, decided here:
         *   checkbox ticked → ''        remove the stored password
         *   field filled    → the value replace it
         *   otherwise       → undefined keep it
         */
        password: clearPassword ? '' : password !== '' ? password : undefined,
        fromAddress: fromAddress.trim(),
        secure,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setPassword('');
      setClearPassword(false);
      window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ['smtp-settings'] });
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('smtp.updateFailed'))),
  });

  const test = useMutation({
    mutationFn: () => adminApi.sendSmtpTest(),
    onSuccess: (result) => {
      setTestError(null);
      setTestResult(
        result.source === 'database'
          ? t('smtp.testSentDatabase', { email: result.sentTo })
          : t('smtp.testSentEnvironment', { email: result.sentTo }),
      );
    },
    // The mail server's own message — "535 Authentication failed" is the whole
    // value of this button, and a generic failure would waste it.
    onError: (e: unknown) => {
      setTestResult(null);
      setTestError(apiErrorMessage(e, t('smtp.testFailed')));
    },
  });

  const dirty =
    host.trim() !== settings.host ||
    parsePort(port) !== settings.port ||
    (username.trim() || null) !== settings.username ||
    fromAddress.trim() !== settings.fromAddress ||
    secure !== settings.secure ||
    password !== '' ||
    clearPassword;

  const busy = save.isPending || test.isPending;

  return (
    <div className="space-y-4">
      {/*
       * Which configuration is live. Before the first save the form is prefilled
       * from the server's own start-up settings rather than left blank, so this
       * line is what stops that reading as "already saved".
       */}
      <p
        className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
          settings.source === 'database'
            ? 'border-border bg-muted/40 text-muted-foreground'
            : 'border-warning/30 bg-warning/10 text-warning'
        }`}
      >
        {settings.source === 'database'
          ? t('smtp.sourceDatabase', { when: formatWhen(settings.updatedAt) })
          : t('smtp.sourceEnvironment')}
      </p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field id="smtp-host" label={t('smtp.host')} hint="">
            <input
              id="smtp-host"
              type="text"
              value={host}
              onChange={(e) => {
                setHost(e.target.value);
                touched();
              }}
              disabled={busy}
              required
              maxLength={255}
              placeholder={t('smtp.hostPlaceholder')}
              className={INPUT_CLASS}
            />
          </Field>

          <Field id="smtp-port" label={t('smtp.port')} hint={t('smtp.portHint')}>
            <input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => {
                setPort(e.target.value);
                touched();
              }}
              disabled={busy}
              required
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field id="smtp-username" label={t('smtp.username')} hint={t('smtp.usernameHint')}>
          <input
            id="smtp-username"
            type="text"
            autoComplete="off"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              touched();
            }}
            disabled={busy}
            maxLength={255}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="space-y-1.5">
          <label htmlFor="smtp-password" className="block text-xs font-semibold text-foreground">
            {t('smtp.password')}
          </label>
          <input
            id="smtp-password"
            type="password"
            // Never `current-password`: a manager offering to fill the operator's
            // own login here would be pasting the wrong secret into a shared
            // server credential.
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              touched();
            }}
            disabled={busy || clearPassword}
            maxLength={500}
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-muted-foreground">
            {settings.passwordSet ? t('smtp.passwordSetHint') : t('smtp.passwordNoneHint')}{' '}
            {t('smtp.passwordNeverShown')}
          </p>

          {settings.passwordSet && (
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => {
                  setClearPassword(e.target.checked);
                  if (e.target.checked) setPassword('');
                  touched();
                }}
                disabled={busy}
                className="h-3.5 w-3.5 cursor-pointer rounded border-input"
              />
              {t('smtp.passwordClear')}
            </label>
          )}
        </div>

        <Field id="smtp-from" label={t('smtp.fromAddress')} hint={t('smtp.fromHint')}>
          <input
            id="smtp-from"
            type="text"
            value={fromAddress}
            onChange={(e) => {
              setFromAddress(e.target.value);
              touched();
            }}
            disabled={busy}
            required
            maxLength={320}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={secure}
              onChange={(e) => {
                setSecure(e.target.checked);
                touched();
              }}
              disabled={busy}
              className="h-3.5 w-3.5 cursor-pointer rounded border-input"
            />
            {t('smtp.secure')}
          </label>
          <p className="text-[11px] text-muted-foreground">{t('smtp.secureHint')}</p>
        </div>

        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="submit"
            disabled={busy || !dirty}
            className={BUTTON_CLASS}
          >
            {save.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>{t('smtp.saving')}</span>
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                <span>{t('smtp.saved')}</span>
              </>
            ) : (
              <span>{t('smtp.save')}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={busy}
            className={BUTTON_CLASS}
          >
            {test.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>{t('smtp.testing')}</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('smtp.test')}</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">{t('smtp.testHint')}</p>

        {/*
         * Only while there is something unsaved. A permanent caveat is one
         * nobody reads by the third visit.
         */}
        {dirty && (
          <p className="flex items-start gap-1.5 text-[11px] text-warning">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('smtp.unsavedWarning')}
          </p>
        )}

        {testResult && (
          <p role="status" className="text-[11px] text-success">
            {testResult}
          </p>
        )}
        {testError && (
          <p role="alert" className="text-[11px] text-destructive">
            {testError}
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * A port, or the value the server will reject.
 *
 * Deliberately NOT `Number(raw) || 587`: that turns a typo into a plausible
 * default nobody chose. `NaN` here fails class-validator's `@IsInt()` and comes
 * back as a message naming the field, which is the outcome we want.
 */
export function parsePort(raw: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

/**
 * `updatedAt` is optional AND nullable in the generated type — `@ApiPropertyOptional`
 * with `nullable: true` — so this takes both rather than making the call site
 * assert a shape the contract does not promise.
 */
function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_CLASS =
  'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:transform-none focus-outline';

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
