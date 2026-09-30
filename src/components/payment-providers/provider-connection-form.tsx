'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type {
  PaymentProvider,
  PaymentProviderSetting,
  UpdatePaymentProvider,
} from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/loader';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * A provider's connection: the settings its adapter DECLARES, rendered without
 * a screen of its own — so the USDT provider gets this form the day its adapter
 * exists (backend 0168).
 *
 * Secrets are write-only and three-state, as the Rival tab's API key was: a
 * blank box keeps what is saved, typing replaces it, "Remove it" clears it. A
 * GENERATED secret (a webhook key) is not here at all — it is rotated on the
 * webhook card, never typed.
 */
export function ProviderConnectionForm({
  provider,
  canManage,
}: {
  provider: PaymentProvider;
  canManage: boolean;
}) {
  const typed = provider.settings.filter((s) => !s.generated);
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(typed.map((s) => [s.name, s.kind === 'secret' ? '' : (s.value ?? '')])),
  );
  const [removed, setRemoved] = React.useState<Set<string>>(() => new Set());
  const [enabled, setEnabled] = React.useState(provider.enabled);
  // The server's environment configures it: on, with no console switch.
  const fromEnvironment = provider.configuredFrom === 'environment';
  const [environment, setEnvironment] = React.useState(provider.environment);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [check, setCheck] = React.useState<{ ok: boolean; message: string } | null>(null);
  const queryClient = useQueryClient();

  // Cancelled on unmount — `flash-timer-census.test.ts`.
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() });

  /** Only what changed: an absent key is left alone by the API. */
  const body = (): UpdatePaymentProvider => {
    const settings: Record<string, string | null> = {};
    const secrets: Record<string, string | null> = {};
    for (const field of typed) {
      const value = values[field.name]?.trim() ?? '';
      if (field.kind === 'secret') {
        if (removed.has(field.name)) secrets[field.name] = null;
        else if (value !== '') secrets[field.name] = value;
      } else if (value !== (field.value ?? '')) {
        settings[field.name] = value === '' ? null : value;
      }
    }
    const changes = {
      ...(environment !== provider.environment ? { environment } : {}),
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
      ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
    };
    /*
     * Running on the ENVIRONMENT, it is on and has no switch here. Saving a
     * connection moves it to the console, where the row wins whole — so that
     * save carries "on" with it, or the provider would stop the moment its
     * settings were entered.
     */
    if (fromEnvironment) {
      return Object.keys(changes).length > 0 ? { ...changes, enabled: true } : {};
    }
    return { ...(enabled !== provider.enabled ? { enabled } : {}), ...changes };
  };
  const dirty = Object.keys(body()).length > 0;

  const save = useMutation({
    mutationFn: () => api.admin.updatePaymentProvider(provider.code, body()),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setRemoved(new Set());
      setValues((current) => {
        const next = { ...current };
        for (const field of typed) if (field.kind === 'secret') next[field.name] = '';
        return next;
      });
      flashTimer.current = window.setTimeout(() => setSaved(false), 2000);
      void invalidate();
      toastSuccess(t('providers.saved', { provider: provider.name }));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('providers.saveFailed'))),
  });

  const test = useMutation({
    mutationFn: () => api.admin.testPaymentProvider(provider.code),
    onSuccess: (result) => {
      setError(null);
      setCheck({ ok: result.ok, message: result.message });
      void invalidate();
    },
    onError: (e: unknown) => {
      setCheck(null);
      setError(apiErrorMessage(e, t('providers.testFailed')));
    },
  });

  const busy = save.isPending || !canManage;
  const secretsSaved = typed.filter((s) => s.kind === 'secret').every((s) => s.isSet);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {typed.map((field) => (
        <SettingField
          key={field.name}
          field={field}
          value={values[field.name] ?? ''}
          removing={removed.has(field.name)}
          disabled={busy}
          onChange={(value) => {
            setValues((current) => ({ ...current, [field.name]: value }));
            setError(null);
          }}
          onRemove={() => {
            setRemoved((current) => new Set(current).add(field.name));
            setError(null);
          }}
        />
      ))}

      <div className="space-y-1.5">
        <label
          htmlFor={`${provider.code}-environment`}
          className="block text-xs font-semibold text-foreground"
        >
          {t('providers.environment')}
        </label>
        <select
          id={`${provider.code}-environment`}
          value={environment}
          disabled={busy}
          onChange={(e) => setEnvironment(e.target.value === 'sandbox' ? 'sandbox' : 'live')}
          className={INPUT_CLASS}
        >
          <option value="live">{t('providers.env.live')}</option>
          <option value="sandbox">{t('providers.env.sandbox')}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t('providers.envHint')}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${provider.code}-enabled`}
            checked={fromEnvironment || enabled}
            onCheckedChange={(value) => {
              setEnabled(value === true);
              setError(null);
            }}
            disabled={busy || fromEnvironment}
          />
          <label
            htmlFor={`${provider.code}-enabled`}
            className="cursor-pointer text-xs font-semibold text-foreground"
          >
            {t('providers.enabled')}
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {fromEnvironment ? t('providers.enabledEnvHint') : t('providers.enabledHint')}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {check && (
        <p
          role="status"
          className={`flex items-start gap-1.5 text-xs ${check.ok ? 'text-success' : 'text-destructive'}`}
        >
          {check.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{check.message}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {canManage && (
          <button type="submit" disabled={busy || !dirty} className={BUTTON_CLASS}>
            {save.isPending ? (
              <>
                <Spinner />
                <span>{t('providers.saving')}</span>
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('providers.save')}</span>
              </>
            ) : (
              <span>{t('providers.save')}</span>
            )}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            disabled={test.isPending || !secretsSaved}
            onClick={() => test.mutate()}
            className={SECONDARY_BUTTON_CLASS}
          >
            {test.isPending && <Spinner />}
            <span>{t('providers.test')}</span>
          </button>
        )}
      </div>
    </form>
  );
}

function SettingField({
  field,
  value,
  removing,
  disabled,
  onChange,
  onRemove,
}: {
  field: PaymentProviderSetting;
  value: string;
  removing: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const id = `provider-setting-${field.name}`;
  const secret = field.kind === 'secret';
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </label>
      <input
        id={id}
        type={secret ? 'password' : field.kind === 'url' ? 'url' : 'text'}
        autoComplete={secret ? 'new-password' : 'off'}
        value={value}
        disabled={disabled || removing}
        maxLength={2048}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      {secret && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {removing ? (
            <span className="text-warning">{t('providers.secretRemoving')}</span>
          ) : field.isSet ? (
            <>
              <span>{t('providers.secretSet')}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="font-semibold text-destructive hover:underline focus-outline"
                >
                  {t('providers.secretRemove')}
                </button>
              )}
            </>
          ) : (
            <span>{t('providers.secretNone')}</span>
          )}
        </p>
      )}
    </div>
  );
}

export const INPUT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus-outline disabled:cursor-not-allowed disabled:opacity-60';

export const BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold ' +
  'text-primary-foreground hover:bg-primary/90 focus-outline disabled:cursor-not-allowed ' +
  'disabled:opacity-60';

export const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 ' +
  'text-xs font-semibold text-foreground hover:bg-accent focus-outline ' +
  'disabled:cursor-not-allowed disabled:opacity-60';
