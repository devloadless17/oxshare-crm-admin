'use client';

import * as React from 'react';
import type { ClientFieldGroup, PermissionModule, Role } from '@/lib/api/admin';
import { PermissionMatrix } from './permission-matrix';
import { ToggleList } from '@/components/ui/toggle-list';
import { t } from '@/lib/i18n';

export interface RoleFormValues {
  name: string;
  description?: string;
  permissions: string[];
  /** RBAC-03 — client fields holders of this role may not see. */
  maskedFields: string[];
}

/**
 * Create/edit form for a dynamic RBAC role.
 *
 * Name, description, the per-action permission matrix, and — RBAC-03 — the
 * client fields holders of this role may not see. Used by both /roles and
 * /settings so the two screens can never drift apart.
 *
 * ── Why masking belongs HERE, on the role ───────────────────────────────────
 *
 * It is a property of the JOB. "Support agents do not see phone numbers" is the
 * same kind of statement as "support agents cannot approve withdrawals", and
 * the two belong on the same screen: an operator answering "what can a support
 * agent do and see" should not have to open twenty individual admins and diff
 * them.
 *
 * It also resolves LIVE, exactly as permissions do, so adding a field here
 * blinds every holder on their next request with no re-login.
 *
 * A per-PERSON exception still exists — `admins.masked_fields`, edited from the
 * admin directory — but it is an override that inherits from here by default,
 * and the directory shows which administrators have one so the exception stays
 * visible rather than becoming invisible drift.
 */
export function RoleFormModal({
  title,
  initial,
  catalog,
  fieldCatalog,
  busy,
  error,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: Pick<Role, 'name' | 'description' | 'permissions' | 'maskedFields'>;
  catalog: Record<string, PermissionModule>;
  /** RBAC-03 vocabulary, fetched — the frontend invents no keys (R-4.5). */
  fieldCatalog: Record<string, ClientFieldGroup>;
  busy: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (values: RoleFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [permissions, setPermissions] = React.useState<string[]>(initial?.permissions ?? []);
  const [maskedFields, setMaskedFields] = React.useState<string[]>(initial?.maskedFields ?? []);

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions,
      maskedFields,
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

          {/*
           * A <details> with an always-visible summary, matching the admin
           * editor. Collapsed because most roles hide nothing — but the
           * summary line is on screen before it is opened, because RBAC-03's
           * failure mode is granting visibility you did not realise you
           * granted.
           */}
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer list-none text-xs font-semibold focus-outline">
              <span className="flex items-center justify-between gap-3">
                {t('roles.maskSection')}
                <span className="font-normal text-[11px] text-muted-foreground">
                  {maskedFields.length === 0
                    ? t('roles.maskSummaryNone')
                    : t('roles.maskSummary', { count: maskedFields.length })}
                </span>
              </span>
            </summary>
            <div className="pt-3">
              <p className="mb-2 text-[11px] text-muted-foreground">{t('roles.maskHint')}</p>
              <ToggleList
                options={Object.values(fieldCatalog)
                  .flatMap((group) => group.fields)
                  .map((field) => ({
                    value: field.key,
                    label: field.label,
                    hint: field.key,
                    // Shown and disabled WITH the reason, never omitted: an
                    // operator hunting for "why can I not hide the status
                    // column" needs the answer where they are looking.
                    disabledReason: field.maskable ? undefined : field.reason,
                  }))}
                selected={maskedFields}
                onToggle={(key) =>
                  setMaskedFields((prev) =>
                    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                  )
                }
                disabled={busy}
              />
            </div>
          </details>

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
