'use client';

import * as React from 'react';
import type { PermissionModule, Role } from '@/lib/api/admin';
import { PermissionMatrix } from './permission-matrix';
import { t } from '@/lib/i18n';

export interface RoleFormValues {
  name: string;
  description?: string;
  permissions: string[];
}

/**
 * Create/edit form for a dynamic RBAC role: name, description, and the
 * per-action permission matrix built from the backend catalog
 * (GET /admin/permissions). Used by both /roles and /settings so the two
 * screens can never drift apart.
 */
export function RoleFormModal({
  title,
  initial,
  catalog,
  busy,
  error,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: Pick<Role, 'name' | 'description' | 'permissions'>;
  catalog: Record<string, PermissionModule>;
  busy: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (values: RoleFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [permissions, setPermissions] = React.useState<string[]>(initial?.permissions ?? []);

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-base font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-muted-foreground hover:text-foreground focus-outline rounded-sm"
          >
            {t('table.close')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold" htmlFor="role-name">
                {t('settings.roleName')}
              </label>
              <input
                id="role-name"
                type="text"
                required
                placeholder={t('settings.roleNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
              />
            </div>
            <div>
              <label className="font-semibold" htmlFor="role-description">
                {t('settings.roleDescription')}
              </label>
              <input
                id="role-description"
                type="text"
                placeholder={t('settings.roleDescriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
              />
            </div>
          </div>

          {/* The matrix is shared with the admin editor (RBAC-02), so a role and a
              direct grant always offer the same vocabulary. */}
          <PermissionMatrix catalog={catalog} selected={permissions} onToggle={toggle} />

          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              {busy ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
