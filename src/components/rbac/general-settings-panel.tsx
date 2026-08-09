'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Loader2 } from 'lucide-react';
import { adminApi, type GeneralSettings } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Brand name, support contacts and the maintenance notice — the General tab.
 *
 * Behind `settings.manage`, the same permission as the download links and for
 * the same reason: a support address is routine operational content, and forcing
 * a master admin to edit one is how the master credential ends up shared.
 *
 * ── One form, one save ─────────────────────────────────────────────────────
 *
 * Unlike the platform links panel, which saves each row independently, these
 * four fields save together. They are one PUT on the server — the row is a
 * singleton — and a per-field save button would imply four independent writes
 * that do not exist.
 *
 * ── The maintenance notice says what it does ───────────────────────────────
 *
 * Its hint states that clients see it while it is set. A free-text box on a
 * settings screen reads like a draft; this one is live the moment it saves, and
 * an operator who types a note to themselves would be publishing it.
 */
export function GeneralSettingsPanel({ canManage }: { canManage: boolean }) {
  const settings = useResource<GeneralSettings>(['general-settings'], () =>
    adminApi.getGeneralSettings(),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('general.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('general.subtitle')}</p>
        {!canManage && <p className="text-xs font-medium text-warning">{t('general.readOnly')}</p>}
      </header>

      <AsyncBoundary
        status={settings.status}
        label={t('general.loading')}
        endpoints={['GET /admin/settings/general']}
        onRetry={() => void settings.refetch()}
        errorMessage={apiErrorMessage(settings.error, t('general.loadFailed'))}
        error={settings.error}
      >
        {settings.data && <GeneralForm settings={settings.data} canManage={canManage} />}
      </AsyncBoundary>
    </section>
  );
}

function GeneralForm({ settings, canManage }: { settings: GeneralSettings; canManage: boolean }) {
  /*
   * Seeded from the server value and then owned by the fields, matching the
   * platform links panel: a `value` bound straight to query data would let a
   * background refetch wipe what the operator is halfway through typing.
   */
  const [brandName, setBrandName] = React.useState(settings.brandName);
  const [supportEmail, setSupportEmail] = React.useState(settings.supportEmail ?? '');
  const [supportUrl, setSupportUrl] = React.useState(settings.supportUrl ?? '');
  const [maintenanceNotice, setMaintenanceNotice] = React.useState(
    settings.maintenanceNotice ?? '',
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateGeneralSettings({
        brandName: brandName.trim(),
        supportEmail: supportEmail.trim() || null,
        supportUrl: supportUrl.trim() || null,
        maintenanceNotice: maintenanceNotice.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ['general-settings'] });
      /*
       * The button's own "Saved ✓" is a two-second state of the CONTROL; this
       * is the console-wide record of the write, and the two are not the same
       * signal — an operator who has already tabbed to the next field sees only
       * the toast. The inline error below stays inline: it sits beside the save
       * button, clears when the field is edited, and naming a rejected field is
       * something a toast cannot do as well.
       */
      toastSuccess(t('general.saved'));
    },
    // The API's own message — it names the field it refused and why, which is
    // more useful than a generic failure.
    onError: (e: unknown) => setError(apiErrorMessage(e, t('general.updateFailed'))),
  });

  const dirty =
    brandName.trim() !== settings.brandName ||
    (supportEmail.trim() || null) !== settings.supportEmail ||
    (supportUrl.trim() || null) !== settings.supportUrl ||
    (maintenanceNotice.trim() || null) !== settings.maintenanceNotice;

  const disabled = !canManage || mutation.isPending;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <Field
        id="general-brand-name"
        label={t('general.brandName')}
        hint={t('general.brandNameHint')}
      >
        <input
          id="general-brand-name"
          type="text"
          value={brandName}
          onChange={(e) => {
            setBrandName(e.target.value);
            setError(null);
          }}
          disabled={disabled}
          required
          maxLength={120}
          className={INPUT_CLASS}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="general-support-email"
          label={t('general.supportEmail')}
          hint={t('general.supportEmailHint')}
        >
          <input
            id="general-support-email"
            type="email"
            value={supportEmail}
            onChange={(e) => {
              setSupportEmail(e.target.value);
              setError(null);
            }}
            disabled={disabled}
            maxLength={320}
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          id="general-support-url"
          label={t('general.supportUrl')}
          hint={t('general.supportUrlHint')}
        >
          <input
            id="general-support-url"
            type="url"
            value={supportUrl}
            onChange={(e) => {
              setSupportUrl(e.target.value);
              setError(null);
            }}
            disabled={disabled}
            maxLength={2048}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field
        id="general-maintenance"
        label={t('general.maintenanceNotice')}
        hint={t('general.maintenanceHint')}
      >
        <textarea
          id="general-maintenance"
          value={maintenanceNotice}
          onChange={(e) => {
            setMaintenanceNotice(e.target.value);
            setError(null);
          }}
          disabled={disabled}
          rows={3}
          maxLength={2000}
          placeholder={t('general.maintenancePlaceholder')}
          className={`${INPUT_CLASS} h-auto py-2 leading-relaxed`}
        />
      </Field>

      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        // Nothing to save when the form matches the server. Without this the
        // operator cannot tell whether their edit went through.
        disabled={disabled || !dirty}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>{t('general.saving')}</span>
          </>
        ) : saved ? (
          <>
            <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            <span>{t('general.saved')}</span>
          </>
        ) : (
          <span>{t('general.save')}</span>
        )}
      </button>
    </form>
  );
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

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
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
