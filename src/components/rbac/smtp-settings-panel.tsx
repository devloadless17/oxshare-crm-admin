'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Mail } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { adminApi, type SmtpSettings } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Checkbox } from '@/components/ui/checkbox';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { SettingsSavedLine } from './settings-saved-line';
import { keys } from '@/lib/query-keys';

/**
 * The mail server — the Email tab. Master admin only.
 *
 * ── Why this one is not a permission ───────────────────────────────────────
 *
 * The download links next door are `settings.manage`, because a download URL is
 * routine content. This is the opposite call: whoever controls the SMTP relay
 * receives every password-reset link and every admin-invite link this system
 * sends, and an invite link turns into a live admin account. Repointing SMTP is
 * therefore a path to administrator on a system that approves withdrawals. The
 * API refuses a non-master regardless (403) — this panel simply does not offer
 * a control that would always fail.
 *
 * ── Deliberately just the connection settings ──────────────────────────────
 *
 * Six fields and Save. An earlier version also carried a "send test" button, a
 * banner naming whether the live config came from the database or the
 * environment, a checkbox for removing the stored password, and an unsaved-
 * changes warning. All of it was cut as scope this deployment does not want:
 * what remains is what a mail server needs to connect and send.
 *
 * `POST /admin/settings/smtp/test` still exists on the backend and
 * `adminApi.sendSmtpTest` still wraps it — nothing calls them now.
 *
 * ── The password is write-only, and the UI says so ─────────────────────────
 *
 * The API never returns it, so there is nothing to prefill. Rendering a fake row
 * of dots would be worse than an empty box: it implies a value the operator can
 * edit in place, when in fact anything they type REPLACES it. So the field is
 * empty and the hint says what empty means. Sending `undefined` — which is what
 * an untouched field produces below — is what keeps the stored password.
 */
export function SmtpSettingsPanel({ canManage }: { canManage: boolean }) {
  const settings = useResource<SmtpSettings>(keys.settings.smtp(), () =>
    adminApi.getSmtpSettings(),
  );

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
        errorMessage={t('smtp.loadFailed')}
        error={settings.error}
      >
        {settings.data && <SmtpForm settings={settings.data} canManage={canManage} />}
      </AsyncBoundary>
    </section>
  );
}

function SmtpForm({ settings, canManage }: { settings: SmtpSettings; canManage: boolean }) {
  const [host, setHost] = React.useState(settings.host);
  /*
   * A flash timer that OUTLIVES this component throws, rather than warning.
   *
   * `setSaved(false)` two seconds later is a state update on a component that
   * may already be gone. In a jsdom test the environment has been torn down by
   * then, so `window` is gone and it surfaces as `ReferenceError: window is not
   * defined` — an unhandled error attributed to whichever test happened to be
   * running, not to the panel that armed it. Same defect, same fix and same
   * reasoning as `payment-providers/copy-controls.tsx`, whose comment records what it cost
   * the first time: a red gate with 965 passing tests and no failure to point at.
   */
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const [port, setPort] = React.useState(String(settings.port));
  const [username, setUsername] = React.useState(settings.username ?? '');
  const [password, setPassword] = React.useState('');
  const [fromAddress, setFromAddress] = React.useState(settings.fromAddress);
  const [secure, setSecure] = React.useState(settings.secure);

  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const queryClient = useQueryClient();

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
        // Untouched field → `undefined` → the stored password is kept. The
        // checkbox that used to send `''` to remove it is gone with the rest.
        password: password !== '' ? password : undefined,
        fromAddress: fromAddress.trim(),
        secure,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setPassword('');
      flashTimer.current = window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: keys.settings.smtp() });
      /*
       * The button's own "Saved ✓" is a two-second state of the CONTROL; this
       * is the console-wide record of the write, and the two are not the same
       * signal — an operator who has already tabbed to the next field sees only
       * the toast. The inline error below stays inline: it sits beside the save
       * button, clears when the field is edited, and naming a rejected field is
       * something a toast cannot do as well.
       */
      toastSuccess(t('smtp.saved'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('smtp.updateFailed'))),
  });

  const dirty =
    host.trim() !== settings.host ||
    parsePort(port) !== settings.port ||
    (username.trim() || null) !== settings.username ||
    fromAddress.trim() !== settings.fromAddress ||
    secure !== settings.secure ||
    password !== '';

  /*
   * `!canManage` disables every field, matching the general and platform panels.
   *
   * This panel took no permission at all before, because reaching it WAS the
   * permission — the tab was master-admin-only. `settings.smtp.view` and
   * `settings.smtp.edit` are separate keys, so a holder of the first now opens
   * a form they may read and not save, and editable fields that 403 on submit
   * would be a worse answer than fields that say so up front.
   */
  const busy = save.isPending || !canManage;

  return (
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
              setError(null);
            }}
            disabled={busy}
            required
            maxLength={255}
            placeholder={t('smtp.hostPlaceholder')}
            className={INPUT_CLASS}
          />
        </Field>

        <Field id="smtp-port" label={t('smtp.port')} hint="">
          <input
            id="smtp-port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => {
              setPort(e.target.value);
              setError(null);
            }}
            disabled={busy}
            required
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field id="smtp-username" label={t('smtp.username')} hint="">
        <input
          id="smtp-username"
          type="text"
          autoComplete="off"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
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
            setError(null);
          }}
          disabled={busy}
          maxLength={500}
          className={INPUT_CLASS}
        />
        {/* The one hint that is kept: without it, an empty box on a screen that
            just loaded reads as "there is no password set". */}
        <p className="text-[11px] text-muted-foreground">
          {settings.passwordSet ? t('smtp.passwordSetHint') : t('smtp.passwordNoneHint')}
        </p>
      </div>

      <Field id="smtp-from" label={t('smtp.fromAddress')} hint="">
        <input
          id="smtp-from"
          type="text"
          value={fromAddress}
          onChange={(e) => {
            setFromAddress(e.target.value);
            setError(null);
          }}
          disabled={busy}
          required
          maxLength={320}
          className={INPUT_CLASS}
        />
      </Field>

      {/* `htmlFor`, not a wrapping label: the Radix checkbox is a button, and a
          label only associates with form controls. See ui/checkbox.tsx. */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="smtp-secure"
          checked={secure}
          onCheckedChange={(value) => {
            setSecure(value === true);
            setError(null);
          }}
          disabled={busy}
        />
        <label
          htmlFor="smtp-secure"
          className="cursor-pointer text-xs font-semibold text-foreground"
        >
          {t('smtp.secure')}
        </label>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="border-t border-border pt-4">
        <button type="submit" disabled={busy || !dirty} className={BUTTON_CLASS}>
          {save.isPending ? (
            <>
              <Spinner />
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
      </div>
      {/* WHO last saved this, and when — recorded on every save and shown
          nowhere until now. Renders nothing on a row still using its boot
          configuration, which has no author. */}
      <SettingsSavedLine updatedAt={settings.updatedAt} updatedByName={settings.updatedByName} />
    </form>
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

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

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
