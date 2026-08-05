'use client';

import { CheckSquare, Square } from 'lucide-react';
import type { PermissionModule } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/**
 * The per-action permission matrix, built from the backend catalog
 * (GET /admin/permissions).
 *
 * Extracted from RoleFormModal when a second screen needed it: RBAC-02 asks for
 * permissions "assigned individually to a sub-admin", so the admin editor grants
 * from the same vocabulary a role does. Copying the markup was the alternative,
 * and a copy is exactly how the old /roles page drifted out of step with the
 * Settings tab it duplicated.
 *
 * The catalog is DATA from the API, never a hardcoded list — a permission the
 * backend does not enforce must not be offerable here, and one it gained must
 * appear without a frontend release.
 */
export function PermissionMatrix({
  catalog,
  selected,
  onToggle,
  disabled = false,
}: {
  catalog: Record<string, PermissionModule>;
  selected: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4 pt-2">
      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
        {t('settings.permissionMatrix', {
          count: selected.length,
          noun: selected.length === 1 ? t('settings.action') : t('settings.actions'),
        })}
      </h4>

      <div className="space-y-4">
        {Object.entries(catalog).map(([modKey, mod]) => (
          <div key={modKey} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground text-xs">{mod.moduleName}</span>
              <span className="text-[11px] text-muted-foreground">{mod.description}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {mod.permissions.map((p) => {
                const isChecked = selected.includes(p.key);
                return (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => onToggle(p.key)}
                    aria-pressed={isChecked}
                    disabled={disabled}
                    className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left cursor-pointer focus-outline disabled:opacity-50 disabled:cursor-not-allowed ${
                      isChecked
                        ? 'border-ring bg-primary/10 text-link'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="h-4 w-4 text-link shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-[11px] leading-tight text-foreground">
                        {p.label}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">{p.key}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
