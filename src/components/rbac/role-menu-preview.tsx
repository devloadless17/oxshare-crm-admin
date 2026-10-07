'use client';

import type { AdminProfile } from '@/context/AdminAuthContext';
import { isNavGroup, visibleNav } from '@/components/layout/navigation';
import { t } from '@/lib/i18n';

/**
 * WHAT THIS ROLE WILL SEE — the sidebar its permissions produce, live as boxes
 * are ticked (Oct 2026 audit).
 *
 * The buyer's two reports were both "I ticked X and somebody saw Y". This
 * renders the REAL menu through the SAME filter the sidebar uses
 * (`visibleNav` → `canAccess`), so it cannot disagree with what the holder
 * will get: there is no second copy of the rules here to drift.
 */
export function RoleMenuPreview({ permissions }: { permissions: string[] }) {
  // `canAccess` reads only the permission list; the rest of a profile is unused.
  const entries = visibleNav({ permissions } as AdminProfile);
  return (
    <aside
      aria-labelledby="role-menu-preview"
      className="rounded-xl border border-border bg-card p-4 text-xs"
    >
      <h4 id="role-menu-preview" className="text-xs font-bold text-foreground">
        {t('rbac.previewTitle')}
      </h4>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{t('rbac.previewHint')}</p>
      <ul className="mt-3 space-y-2">
        {entries.map((entry) =>
          isNavGroup(entry) ? (
            <li key={entry.id}>
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <entry.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {t(entry.label)}
              </span>
              <ul className="mt-1 space-y-1 border-s border-border ps-4">
                {entry.items.map((item) => (
                  <li key={item.href} className="text-muted-foreground">
                    {t(item.label)}
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li key={entry.href} className="flex items-center gap-2 font-semibold text-foreground">
              <entry.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {t(entry.label)}
            </li>
          ),
        )}
      </ul>
    </aside>
  );
}

/** How many pages a set of permissions puts in the sidebar (Dashboard excluded). */
export function menuPageCount(permissions: string[]): number {
  return visibleNav({ permissions } as AdminProfile).reduce(
    (n, entry) => n + (isNavGroup(entry) ? entry.items.length : 0),
    0,
  );
}

/**
 * One line under a role picker saying what the chosen role IS (Oct 2026 audit):
 * the pickers listed bare names, and nothing said that "Administrator" means
 * every permission there is.
 */
export function RoleSummaryLine({
  role,
}: {
  role?: { isSystem: boolean; description?: string; permissions: string[] };
}) {
  if (!role) return null;
  const pages = menuPageCount(role.permissions);
  return (
    <p className="mt-1.5 text-[11px] text-muted-foreground">
      {role.isSystem
        ? t('rbac.roleFullAccess')
        : [role.description, t('rbac.rolePages', { count: pages })].filter(Boolean).join(' · ')}
    </p>
  );
}
