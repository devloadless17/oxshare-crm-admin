'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { IpAllowlistRule, IpAllowlistStatus } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { keys } from '@/lib/query-keys';

/**
 * RBAC-08 — which networks may reach the administration API.
 *
 * ## This screen's whole job is to not lie about whether anything is enforced
 *
 * There are THREE states and they are not interchangeable, which is why none of
 * them is rendered as a plain list:
 *
 *   - no rules            → the feature is OFF. An operator looking at a page
 *                           titled "Network Access" with no errors will assume
 *                           they are protected. They are not, and it says so.
 *   - rules, enforcing    → the normal state.
 *   - rules, switched off → `ADMIN_IP_ALLOWLIST_ENABLED=false`. The rules are
 *                           still listed and none of them is doing anything. A
 *                           green shield here would be the worst screen in the
 *                           console.
 *
 * ## Why the address is explained rather than just printed
 *
 * `yourIp` is the address THE SERVER SEES. Behind the console's own dev proxy
 * that is `::1`, not the operator's public address — so a rule written for the
 * address they can see in a browser is one the server can never match, and the
 * API will refuse it as a lockout. That confusion is the reason this feature was
 * deleted once, so the panel states the address, says whose view it is, and
 * warns before the first rule rather than letting the API's refusal be the first
 * explanation anybody reads.
 */
export function IpAllowlistPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const query = useResource<IpAllowlistStatus>(keys.settings.ipAllowlist(), (signal) =>
    api.admin.getIpAllowlist(signal),
  );

  const [cidr, setCidr] = React.useState('');
  const [label, setLabel] = React.useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.settings.ipAllowlist() });

  const addRule = useMutation({
    mutationFn: () => api.admin.addIpAllowlistRule({ cidr: cidr.trim(), label: label.trim() }),
    onSuccess: async () => {
      setCidr('');
      setLabel('');
      await invalidate();
    },
  });

  const removeRule = useMutation({
    mutationFn: (rule: IpAllowlistRule) => api.admin.removeIpAllowlistRule(rule.id),
    onSuccess: invalidate,
  });

  const rules = query.data?.rules ?? [];
  const yourIp = query.data?.yourIp ?? null;
  const enforced = query.data?.enforced ?? false;
  const disabledByConfig = query.data?.disabledByConfig ?? false;
  /*
   * The FIRST rule is the dangerous one: it turns enforcement on, and if it does
   * not cover the person adding it they lose this screen. The API refuses that
   * outright, but a warning beforehand beats a rejection afterwards.
   */
  const isFirstRule = rules.length === 0;

  const confirm = useConfirm();
  const handleRemove = async (rule: IpAllowlistRule) => {
    // The app's own dialog, not `window.confirm` — the one destructive action
    // on the console that can lock every administrator out deserves the same
    // named, focus-trapped confirmation every other destructive action gets.
    const ok = await confirm({
      title: t('ipAllowlist.removeTitle'),
      description: t('ipAllowlist.confirmRemove', { cidr: rule.cidr }),
      confirmLabel: t('ipAllowlist.remove', { cidr: rule.cidr }),
      destructive: true,
    });
    if (ok) removeRule.mutate(rule);
  };

  const banner = addRule.isError
    ? apiErrorMessage(addRule.error, t('ipAllowlist.addFailed'))
    : removeRule.isError
      ? apiErrorMessage(removeRule.error, t('ipAllowlist.removeFailed'))
      : '';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{t('ipAllowlist.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('ipAllowlist.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('ipAllowlist.loading')}
        endpoints={['GET /admin/ip-allowlist']}
        onRetry={query.refetch}
        errorMessage={t('ipAllowlist.loadFailed')}
        error={query.error}
      >
        {/* The state of the control, in words, before anything else. */}
        {disabledByConfig ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('ipAllowlist.disabledByConfig')}</span>
          </div>
        ) : enforced ? (
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('ipAllowlist.enforcing', { count: rules.length })}</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('ipAllowlist.notEnforcing')}</span>
          </div>
        )}

        {/*
          The address the SERVER sees, said as such. Printing it bare invites an
          operator to compare it with what a "what is my IP" site tells them and
          conclude the console is broken.
        */}
        <p className="text-xs text-muted-foreground">
          {yourIp ? t('ipAllowlist.yourIp', { ip: yourIp }) : t('ipAllowlist.yourIpUnknown')}
        </p>

        {banner && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            {banner}
          </div>
        )}

        {rules.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
            {t('ipAllowlist.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-foreground">{rule.cidr}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{rule.label}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(rule)}
                    disabled={removeRule.isPending && removeRule.variables?.id === rule.id}
                    aria-label={t('ipAllowlist.remove', { cidr: rule.cidr })}
                    className="focus-outline inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('common.delete')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form
            className="space-y-3 rounded-lg border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!cidr.trim() || !label.trim()) return;
              addRule.mutate();
            }}
          >
            {/*
              Shown only for the FIRST rule, because that is the one that starts
              enforcement. Repeating it on every subsequent add would train
              people to ignore it.
            */}
            {isFirstRule && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
                {t('ipAllowlist.firstRuleWarning')}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" htmlFor="ip-allowlist-cidr">
                  {t('ipAllowlist.cidrLabel')}
                </label>
                <input
                  id="ip-allowlist-cidr"
                  value={cidr}
                  onChange={(e) => setCidr(e.target.value)}
                  placeholder="203.0.113.0/24"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" htmlFor="ip-allowlist-label">
                  {t('ipAllowlist.labelLabel')}
                </label>
                <input
                  id="ip-allowlist-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('ipAllowlist.labelPlaceholder')}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={addRule.isPending || !cidr.trim() || !label.trim()}
              className="focus-outline h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addRule.isPending ? t('common.saving') : t('ipAllowlist.addRule')}
            </button>
          </form>
        )}
      </AsyncBoundary>
    </div>
  );
}
