'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Sparkles } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/loader';
import { useResource } from '@/hooks/use-resource';
import { adminApi, type AssistantSettings } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { toastSuccess } from '@/lib/toast';
import { SettingsSavedLine } from './settings-saved-line';

/**
 * The portal assistant's switch and limits (backend 0187).
 *
 * The switch is the kill switch: turning it off hides the launcher from every
 * client and refuses new questions at once, with no deploy. The platform-wide
 * daily ceiling is what bounds spend when sign-up is open, so a flood of new
 * accounts cannot multiply the per-client allowance into an unbounded bill.
 */
export function AssistantSettingsPanel({ canManage }: { canManage: boolean }) {
  const settings = useResource<AssistantSettings>(keys.settings.assistant(), (signal) =>
    adminApi.getAssistantSettings(signal),
  );

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('assistantSettings.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('assistantSettings.subtitle')}
        </p>
        {!canManage && (
          <p className="text-xs font-medium text-warning">{t('assistantSettings.readOnly')}</p>
        )}
      </header>

      <AsyncBoundary
        status={settings.status}
        label={t('assistantSettings.loading')}
        endpoints={['GET /admin/settings/assistant']}
        onRetry={() => void settings.refetch()}
        errorMessage={t('assistantSettings.loadFailed')}
        error={settings.error}
      >
        {settings.data && <AssistantForm settings={settings.data} canManage={canManage} />}
      </AsyncBoundary>
    </section>
  );
}

function AssistantForm({
  settings,
  canManage,
}: {
  settings: AssistantSettings;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [daily, setDaily] = React.useState(String(settings.dailyMessageLimit));
  const [global, setGlobal] = React.useState(String(settings.globalDailyMessageLimit));
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateAssistantSettings({
        enabled,
        dailyMessageLimit: Number.parseInt(daily, 10),
        globalDailyMessageLimit: Number.parseInt(global, 10),
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: keys.settings.assistant() });
      toastSuccess(t('assistantSettings.saved'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('assistantSettings.updateFailed'))),
  });

  const dirty =
    enabled !== settings.enabled ||
    daily.trim() !== String(settings.dailyMessageLimit) ||
    global.trim() !== String(settings.globalDailyMessageLimit);
  const disabled = !canManage || mutation.isPending;
  const number = new Intl.NumberFormat();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {!settings.keyConfigured && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          {t('assistantSettings.noKey')}
        </p>
      )}

      <label className="flex items-start gap-3">
        <Checkbox
          checked={enabled}
          onCheckedChange={(value) => {
            setEnabled(value === true);
            setError(null);
          }}
          disabled={disabled}
          className="mt-0.5"
        />
        <span className="space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            {t('assistantSettings.enabled')}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {t('assistantSettings.enabledHint')}
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="assistant-daily"
          label={t('assistantSettings.dailyLimit')}
          hint={t('assistantSettings.dailyLimitHint')}
          value={daily}
          onChange={(v) => {
            setDaily(v);
            setError(null);
          }}
          disabled={disabled}
          max={1000}
        />
        <NumberField
          id="assistant-global"
          label={t('assistantSettings.globalLimit')}
          hint={t('assistantSettings.globalLimitHint')}
          value={global}
          onChange={(v) => {
            setGlobal(v);
            setError(null);
          }}
          disabled={disabled}
          max={10_000_000}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
          {t('assistantSettings.todayTitle')}
          {settings.keyConfigured && (
            <span className="ms-2 font-normal">
              {t('assistantSettings.model', { model: settings.model })}
            </span>
          )}
        </p>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Stat
            label={t('assistantSettings.todayAnswers')}
            value={number.format(settings.today.answers)}
          />
          <Stat
            label={t('assistantSettings.todayInput')}
            value={number.format(settings.today.inputTokens)}
            note={`${number.format(settings.today.cachedTokens)} ${t('assistantSettings.todayCached')}`}
          />
          <Stat
            label={t('assistantSettings.todayOutput')}
            value={number.format(settings.today.outputTokens)}
          />
          <Stat
            label={t('assistantSettings.todaySearches')}
            value={number.format(settings.today.webSearches)}
          />
        </dl>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <SettingsSavedLine updatedAt={settings.updatedAt} />
        <button
          type="submit"
          disabled={disabled || !dirty}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t('assistantSettings.save')}
        </button>
      </div>
    </form>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
        {value}
      </dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  max,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        min={1}
        max={max}
        step={1}
        className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 font-mono text-xs tabular-nums focus:ring-2 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
