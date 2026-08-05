'use client';

import { IpAllowlistPanel } from '@/components/rbac/ip-allowlist-panel';
import { PlatformLinksPanel } from '@/components/rbac/platform-links-panel';
import { SecurityControlsPanel } from '@/components/rbac/security-controls-panel';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission, isMasterAdmin } from '@/lib/permissions';
import { t } from '@/lib/i18n';

/**
 * What protects this API.
 *
 * Until the split this page also owned roles and the admin directory behind a
 * tab strip. It now answers one question, and both panels below answer it: which
 * networks may reach the admin API (RBAC-08) and which security controls are on.
 *
 * Neither panel is fetched here — each owns its own query, as they did when this
 * was the Network tab. That is deliberate: the two lists are unrelated, and
 * folding them into one query would make each wait for the other.
 */
export default function AdminSettingsPage() {
  const { admin } = useAdmin();
  // Gated on roles.manage: deciding which networks may reach the admin API is
  // the same class of authority as deciding who holds which permissions.
  const canManage = hasPermission(admin, 'roles.manage');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      <div className="space-y-6">
        <IpAllowlistPanel canManage={canManage} />
        {/*
          Rendered for EVERY admin, with the controls disabled without
          `settings.manage`, rather than hidden like the master-admin panel
          below. The two are different kinds of secret: which security controls
          exist is worth withholding, whereas which platforms have a download is
          something an operator needs to look up without holding a permission
          they do not need. The API refuses the write regardless.
        */}
        <PlatformLinksPanel canManage={hasPermission(admin, 'settings.manage')} />
        {/* Master admin only, and the API refuses anyone else regardless (R-4.1). */}
        {isMasterAdmin(admin) && <SecurityControlsPanel canManage />}
      </div>
    </div>
  );
}
