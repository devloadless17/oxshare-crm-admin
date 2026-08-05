'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { adminApi, type SecuritySwitch } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { t } from '@/lib/i18n';

/**
 * Master-admin switches for security controls that can legitimately be off.
 *
 * The withdrawal OTP is the first: it cannot be exercised by an automated test
 * and is a nuisance before go-live, so the operator genuinely needs it off and
 * then on. The risk in that is not malice — it is the Tuesday demo nobody turns
 * back on, and this panel is designed against that specific failure:
 *
 *  - a control that is OFF is rendered in the destructive colour with a standing
 *    warning, not as a neutral unchecked box;
 *  - turning one off asks for confirmation naming what stops being enforced;
 *  - the panel states that the change is audited, because knowing that changes
 *    how carefully people click.
 *
 * The API enforces all of this independently (master-admin guard, audit row,
 * alert). Everything here is UX — see R-4.1 — but it is the UX that decides
 * whether a control gets left off.
 */
export function SecurityControlsPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const controls = useResource<SecuritySwitch[]>(['security-settings'], () =>
    adminApi.getSecuritySettings(),
  );

  const mutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      adminApi.setSecuritySwitch(key, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['security-settings'] }),
    onError: (e: unknown) => setError(apiErrorMessage(e, t('security.updateFailed'))),
  });

  const toggle = (control: SecuritySwitch) => {
    setError(null);
    // Confirmation only in the dangerous DIRECTION. Asking "are you sure?" when
    // someone turns a protection back ON trains people to dismiss the dialog,
    // which is how the one that matters gets dismissed too.
    if (control.enabled) {
      const ok = window.confirm(t('security.confirmDisable', { label: control.label }));
      if (!ok) return;
    }
    mutation.mutate({ key: control.key, enabled: !control.enabled });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-bold text-foreground">{t('security.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('security.subtitle')}</p>
      </header>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <AsyncBoundary
        status={controls.status}
        label={t('security.loading')}
        endpoints={['GET /admin/security-settings']}
        onRetry={controls.refetch}
        error={controls.error}
      >
        <ul className="space-y-3">
          {(controls.data ?? []).map((control) => (
            <li
              key={control.key}
              className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${
                control.enabled ? 'border-border' : 'border-destructive/40 bg-destructive/5'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {control.enabled ? (
                    <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
                  )}
                  <span className="text-xs font-semibold text-foreground">{control.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {control.enabled ? t('security.enforced') : t('security.notEnforced')}
                </p>
                {/* Not decoration: "who turned this off, and when" is the first
                    question afterwards, and it is answerable here rather than
                    only in the audit log. */}
                {control.updatedBy && (
                  <p className="text-[11px] text-muted-foreground/70">
                    {t('security.lastChanged', {
                      when: new Date(control.updatedAt).toLocaleString(),
                    })}
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={!canManage || mutation.isPending}
                onClick={() => toggle(control)}
                aria-pressed={control.enabled}
                className={`shrink-0 h-8 px-3 rounded-lg text-xs font-semibold focus-outline disabled:opacity-50 disabled:cursor-not-allowed ${
                  control.enabled
                    ? 'border border-input bg-card hover:bg-muted text-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary-hover'
                }`}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : control.enabled ? (
                  t('security.turnOff')
                ) : (
                  t('security.turnOn')
                )}
              </button>
            </li>
          ))}
        </ul>
      </AsyncBoundary>

      <p className="text-[11px] text-muted-foreground/70">{t('security.auditNote')}</p>
    </section>
  );
}
