'use client';

import * as React from 'react';
import type { AdminUser, PermissionModule, Role } from '@/lib/api/admin';
import { PermissionMatrix } from './permission-matrix';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface AdminFormValues {
  name?: string;
  roleId?: string;
  permissions?: string[];
}

const DIRECT = '__direct__';

/**
 * Edit one administrator — FR-RBAC-07's "edit" and FR-RBAC-02's per-sub-admin half.
 *
 * `PATCH /admin/users/:id` has always accepted `{ name, roleId, permissions }`.
 * The directory only ever sent `roleId`, so granting a single extra permission to
 * one person meant inventing a role for them — and the FSD asks for permissions
 * "assigned individually to a sub-admin", not only through roles.
 *
 * THE RULE THIS UI MUST NOT HIDE: roleId and direct permissions are exclusive.
 * The API copies a role's permissions onto the admin and records the roleId, or
 * takes a direct list and clears the roleId — never both. An admin on a role
 * tracks that role as it is edited; one on direct grants does not. Presenting
 * them as two independent fields would let someone believe they had done both,
 * so the choice is a single control and the consequence is stated in the form.
 */
export function AdminFormModal({
  admin,
  roles,
  catalog,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  admin: AdminUser;
  roles: Role[];
  catalog: Record<string, PermissionModule>;
  busy: boolean;
  error: string;
  onSubmit: (values: AdminFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(admin.name);
  // '__direct__' rather than '' — an empty Select value is indistinguishable
  // from "nothing chosen yet", and this is a deliberate choice with consequences.
  const [source, setSource] = React.useState<string>(admin.roleId ?? DIRECT);
  const [permissions, setPermissions] = React.useState<string[]>(admin.permissions ?? []);

  const assignable = roles.filter((r) => !r.isSystem);
  const usingDirect = source === DIRECT;
  const nameChanged = name.trim() !== admin.name;

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Send only what changed. A roleId echoed back unchanged still rewrites the
    // permission snapshot and lands another entry in the audit log against a
    // named administrator.
    const values: AdminFormValues = {};
    if (nameChanged) values.name = name.trim();
    if (usingDirect) {
      values.permissions = permissions;
    } else if (source !== admin.roleId) {
      values.roleId = source;
    }
    if (Object.keys(values).length === 0) {
      onClose();
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold">{t('adminUsers.editTitle')}</h3>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{admin.email}</p>
          </div>
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
          <div>
            <label className="font-semibold" htmlFor="admin-name">
              {t('adminUsers.nameLabel')}
            </label>
            <input
              id="admin-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
            />
          </div>

          <div>
            <label className="font-semibold" htmlFor="admin-source">
              {t('adminUsers.accessLabel')}
            </label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="admin-source" className="mt-1 h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
                <SelectItem value={DIRECT}>{t('adminUsers.directOption')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {usingDirect ? t('adminUsers.directHint') : t('adminUsers.roleHint')}
            </p>
          </div>

          {/* Only when granting directly. Showing the matrix under a role would
              imply the ticks are editable, when the role owns them and edits to
              it overwrite whatever is shown here. */}
          {usingDirect && (
            <PermissionMatrix catalog={catalog} selected={permissions} onToggle={toggle} />
          )}

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
              {busy ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
