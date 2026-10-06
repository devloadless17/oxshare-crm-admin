'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { AdminUser, IpAllowlistExemption, IpAllowlistStatus } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { keys } from '@/lib/query-keys';

/**
 * RBAC-08 — administrators who may reach the console from ANY network (0191).
 *
 * Shares the allowlist's own query (`GET /admin/ip-allowlist` carries
 * `exemptAdmins`), so the rules and the exemptions can never be shown from two
 * different moments. Rendered below `IpAllowlistPanel`, whose `AsyncBoundary`
 * already speaks for the loading and error states of that one request.
 *
 * Choosing an administrator reads `GET /admin/users`, which needs `admins.view`.
 * A reader with the security keys but not that one is told so rather than shown
 * an empty picker that looks like "there is nobody to add".
 */
export function IpExemptionsPanel({
  canManage,
  canPickAdmins,
  selfId,
}: {
  canManage: boolean;
  canPickAdmins: boolean;
  selfId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const status = useResource<IpAllowlistStatus>(keys.settings.ipAllowlist(), (signal) =>
    api.admin.getIpAllowlist(signal),
  );
  const admins = useResource<AdminUser[]>(
    keys.adminUsers.directory(),
    () => api.admin.getAdminUsers(),
    {
      enabled: canManage && canPickAdmins,
    },
  );

  const [adminId, setAdminId] = React.useState('');
  const [reason, setReason] = React.useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.settings.ipAllowlist() });

  const grant = useMutation({
    mutationFn: () => api.admin.addIpAllowlistExemption({ adminId, reason: reason.trim() }),
    onSuccess: async () => {
      setAdminId('');
      setReason('');
      await invalidate();
    },
  });

  const revoke = useMutation({
    mutationFn: (exemption: IpAllowlistExemption) =>
      api.admin.removeIpAllowlistExemption(exemption.adminId),
    onSuccess: invalidate,
  });

  const confirm = useConfirm();
  const handleRemove = async (exemption: IpAllowlistExemption) => {
    const ok = await confirm({
      title: t('ipAllowlist.exempt.removeTitle'),
      description: t('ipAllowlist.exempt.confirmRemove', { name: exemption.name }),
      confirmLabel: t('ipAllowlist.exempt.remove', { name: exemption.name }),
      destructive: true,
    });
    if (ok) revoke.mutate(exemption);
  };

  if (status.status !== 'ready' || !status.data) return null;
  const exempt = status.data.exemptAdmins;
  const exemptIds = new Set(exempt.map((e) => e.adminId));
  const candidates = (admins.data ?? []).filter(
    (a) => a.status === 'active' && !exemptIds.has(a.id),
  );

  const banner = grant.isError
    ? apiErrorMessage(grant.error, t('ipAllowlist.exempt.addFailed'))
    : revoke.isError
      ? apiErrorMessage(revoke.error, t('ipAllowlist.exempt.removeFailed'))
      : '';

  return (
    <section className="space-y-4" aria-labelledby="ip-exemptions-title">
      <div>
        <h2 id="ip-exemptions-title" className="text-base font-semibold">
          {t('ipAllowlist.exempt.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('ipAllowlist.exempt.subtitle')}</p>
      </div>

      {banner && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {banner}
        </div>
      )}

      {exempt.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          {t('ipAllowlist.exempt.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {exempt.map((e) => {
            const date = new Date(e.createdAt).toLocaleDateString();
            const granter = e.createdBy === selfId ? t('ipAllowlist.exempt.you') : e.createdByName;
            return (
              <li key={e.adminId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {e.name} <span className="font-normal text-muted-foreground">{e.email}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{e.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {granter
                        ? t('ipAllowlist.exempt.grantedBy', { name: granter, date })
                        : t('ipAllowlist.exempt.grantedByUnknown', { date })}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(e)}
                    disabled={revoke.isPending && revoke.variables?.adminId === e.adminId}
                    aria-label={t('ipAllowlist.exempt.remove', { name: e.name })}
                    className="focus-outline inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('common.delete')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage &&
        (!canPickAdmins ? (
          <p className="text-xs text-muted-foreground">{t('ipAllowlist.exempt.noAdminsView')}</p>
        ) : admins.status === 'ready' && candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('ipAllowlist.exempt.noneLeft')}</p>
        ) : (
          <form
            className="space-y-3 rounded-lg border border-border bg-card p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!adminId || !reason.trim()) return;
              grant.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" htmlFor="ip-exempt-admin">
                  {t('ipAllowlist.exempt.adminLabel')}
                </label>
                <select
                  id="ip-exempt-admin"
                  value={adminId}
                  onChange={(ev) => setAdminId(ev.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs"
                >
                  <option value="">{t('ipAllowlist.exempt.adminPlaceholder')}</option>
                  {candidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" htmlFor="ip-exempt-reason">
                  {t('ipAllowlist.exempt.reasonLabel')}
                </label>
                <input
                  id="ip-exempt-reason"
                  value={reason}
                  maxLength={200}
                  onChange={(ev) => setReason(ev.target.value)}
                  placeholder={t('ipAllowlist.exempt.reasonPlaceholder')}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={grant.isPending || !adminId || !reason.trim()}
              className="focus-outline h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {grant.isPending ? t('common.saving') : t('ipAllowlist.exempt.add')}
            </button>
          </form>
        ))}
    </section>
  );
}
