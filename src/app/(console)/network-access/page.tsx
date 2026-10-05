'use client';

import { IpAllowlistPanel } from '@/components/rbac/ip-allowlist-panel';
import { IpExemptionsPanel } from '@/components/rbac/ip-exemptions-panel';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { t } from '@/lib/i18n';

/**
 * RBAC-08 — which networks may reach the administration console.
 *
 * ## Why this is its own page
 *
 * It was the Security tab on `/settings`. The owner asked for it under Security
 * in the sidebar (25 Sep 2026), and the reasoning holds: Settings is where the
 * console's configuration lives — mail relay, payment provider, trading limits —
 * while this decides who can reach the console AT ALL, beside the API keys that
 * decide the same thing for machines. A bookmark to the old `?tab=security`
 * lands here; see the settings page.
 *
 * ## Read and change are separate keys
 *
 * The route is gated on `settings.security.view` (see ROUTE_REQUIREMENTS), and
 * the add/remove controls on `settings.security.edit`. Seeing which networks are
 * trusted is an audit question; adding one can lock every administrator out of
 * the building, which is why the panel warns before the first rule.
 */
export default function NetworkAccessPage() {
  const { admin } = useAdmin();
  const canEdit = hasPermission(admin, 'settings.security.edit');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('ipAllowlist.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('ipAllowlist.subtitle')}</p>
      </div>

      <div className="max-w-3xl space-y-10">
        <IpAllowlistPanel canManage={canEdit} showHeading={false} />
        <IpExemptionsPanel
          canManage={canEdit}
          canPickAdmins={hasPermission(admin, 'admins.view')}
          selfId={admin?.id}
        />
      </div>
    </div>
  );
}
